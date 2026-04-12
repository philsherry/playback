import { EventEmitter } from 'node:events';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildMetadataFlags, runFfmpeg } from './ffmpeg';
import type { VideoMetadata } from '../types';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('node:fs', () => ({ statSync: vi.fn() }));
vi.mock('../constants', () => ({
	FFMPEG_FULL_BIN: '/mock/ffmpeg/bin',
	GIF_HEIGHT: 450,
	GIF_WIDTH: 800,
	VIDEO_HEIGHT: 720,
	VIDEO_WIDTH: 1280,
}));
vi.mock('../utilities/escape', () => ({ escapeAssPath: (p: string) => p }));
vi.mock('../logger', () => ({
	isVerbose: () => false,
	logVerbose: vi.fn(),
	logWarn: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a fake child_process that emits stdout/stderr and closes with `code`.
 * @param code - Exit code the process will close with.
 * @returns A fake child process with stdout and stderr EventEmitters.
 */
function makeFakeProcess(code = 0): EventEmitter & {
	stderr: EventEmitter;
	stdout: EventEmitter;
} {
	const proc = new EventEmitter() as EventEmitter & {
		stderr: EventEmitter;
		stdout: EventEmitter;
	};
	proc.stdout = new EventEmitter();
	proc.stderr = new EventEmitter();
	// Schedule close on the next tick so callers can attach listeners first.
	setTimeout(() => proc.emit('close', code), 0);
	return proc;
}

const BASE_META: VideoMetadata = { artist: 'Test', title: 'Test tape' };

const BASE_CAPTIONS = {
	assFile: '/out/test.ass',
	srtFile: '/out/test.srt',
	vttFile: '/out/test.vtt',
};

// ---------------------------------------------------------------------------
// buildMetadataFlags
// ---------------------------------------------------------------------------

describe('buildMetadataFlags', () => {
	it('includes all populated fields', () => {
		const meta: VideoMetadata = {
			album: 's1-getting-started',
			artist: 'Created by Playback',
			comment: 'Clone the repo and look around',
			language: 'en-GB',
			title: 'Install and explore',
			track: 1,
		};

		const flags = buildMetadataFlags(meta);

		expect(flags).toContain('title=Install and explore');
		expect(flags).toContain('comment=Clone the repo and look around');
		expect(flags).toContain('artist=Created by Playback');
		expect(flags).toContain('album=s1-getting-started');
		expect(flags).toContain('track=1');
		expect(flags).toContain('language=en-GB');
	});

	it('omits undefined fields', () => {
		const meta: VideoMetadata = {
			artist: 'Created by Playback',
			title: 'Minimal tape',
		};

		const flags = buildMetadataFlags(meta);

		expect(flags).toContain('title=Minimal tape');
		expect(flags).toContain('artist=Created by Playback');
		expect(flags.join(' ')).not.toContain('comment=');
		expect(flags.join(' ')).not.toContain('album=');
		expect(flags.join(' ')).not.toContain('track=');
		expect(flags.join(' ')).not.toContain('language=');
	});

	it('omits empty string fields', () => {
		const meta: VideoMetadata = {
			artist: 'Created by Playback',
			comment: '',
			title: 'Test',
		};

		const flags = buildMetadataFlags(meta);

		expect(flags.join(' ')).not.toContain('comment=');
	});

	it('uses a custom artist when provided', () => {
		const meta: VideoMetadata = {
			artist: 'Phil Sherry',
			title: 'Custom credit',
		};

		const flags = buildMetadataFlags(meta);

		expect(flags).toContain('artist=Phil Sherry');
		expect(flags).not.toContain('artist=Created by Playback');
	});

	it('sets stream-level audio language from BCP-47 locale', () => {
		const meta: VideoMetadata = {
			artist: 'Test',
			language: 'en-GB',
			title: 'Language test',
		};

		const flags = buildMetadataFlags(meta);

		expect(flags).toContain('-metadata:s:a:0');
		expect(flags).toContain('language=eng');
	});

	it('omits stream-level language when locale is absent', () => {
		const meta: VideoMetadata = {
			artist: 'Test',
			title: 'No locale',
		};

		const flags = buildMetadataFlags(meta);

		expect(flags).not.toContain('-metadata:s:a:0');
	});

	it('handles Welsh locale', () => {
		const meta: VideoMetadata = {
			artist: 'Test',
			language: 'cy',
			title: 'Welsh test',
		};

		const flags = buildMetadataFlags(meta);

		expect(flags).toContain('language=cym');
	});
});

// ---------------------------------------------------------------------------
// runFfmpeg — poster / card guard
//
// These tests cover the scenario where ffmpeg's `select` filter finds no
// matching frames: it exits 0 but either produces a missing or zero-byte
// poster file.  generateCard must NOT be called in that case.
// ---------------------------------------------------------------------------

describe('runFfmpeg poster guard', () => {
	let spawnMock: ReturnType<typeof vi.fn>;
	let statSyncMock: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const childProcess = await import('node:child_process');
		const fs = await import('node:fs');
		spawnMock = childProcess.spawn as ReturnType<typeof vi.fn>;
		statSyncMock = fs.statSync as ReturnType<typeof vi.fn>;
		spawnMock.mockReset();
		statSyncMock.mockReset();
		// Default: every ffmpeg call succeeds.
		spawnMock.mockImplementation(() => makeFakeProcess(0));
	});

	it('returns null poster and card when extractPoster produces no file', async () => {
		// statSync throws ENOENT — file was never created.
		statSyncMock.mockImplementation(() => {
			throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
		});

		const result = await runFfmpeg(
			'/raw/test.raw.mp4',
			[],
			BASE_CAPTIONS,
			'/out',
			'test',
			5,           // posterTime is set — should attempt extraction
			null,
			BASE_META
		);

		expect(result.posterFile).toBeNull();
		expect(result.cardFile).toBeNull();
	});

	it('returns null poster and card when extractPoster produces a zero-byte file', async () => {
		// statSync returns size 0 — ffmpeg created the file but encoded nothing.
		statSyncMock.mockReturnValue({ size: 0 });

		const result = await runFfmpeg(
			'/raw/test.raw.mp4',
			[],
			BASE_CAPTIONS,
			'/out',
			'test',
			5,
			null,
			BASE_META
		);

		expect(result.posterFile).toBeNull();
		expect(result.cardFile).toBeNull();
	});

	it('returns poster and card paths when extractPoster produces a valid file', async () => {
		// statSync returns a non-zero size — valid PNG was written.
		statSyncMock.mockReturnValue({ size: 81_920 });

		const result = await runFfmpeg(
			'/raw/test.raw.mp4',
			[],
			BASE_CAPTIONS,
			'/out',
			'test',
			5,
			null,
			BASE_META
		);

		expect(result.posterFile).toBe('/out/test.poster.png');
		expect(result.cardFile).toBe('/out/test.card.png');
	});

	it('uses posterSourceFile directly without calling extractPoster or statSync', async () => {
		const result = await runFfmpeg(
			'/raw/test.raw.mp4',
			[],
			BASE_CAPTIONS,
			'/out',
			'test',
			null,                       // no posterTime
			'/tape/poster.png',         // explicit source file
			BASE_META
		);

		// statSync should not be consulted — the source file is trusted as-is.
		expect(statSyncMock).not.toHaveBeenCalled();
		expect(result.posterFile).toBe('/tape/poster.png');
		expect(result.cardFile).toBe('/out/test.card.png');
	});

	it('returns null poster and card when posterTime is null and no posterSourceFile', async () => {
		const result = await runFfmpeg(
			'/raw/test.raw.mp4',
			[],
			BASE_CAPTIONS,
			'/out',
			'test',
			null,
			null,
			BASE_META
		);

		expect(result.posterFile).toBeNull();
		expect(result.cardFile).toBeNull();
		expect(statSyncMock).not.toHaveBeenCalled();
	});
});
