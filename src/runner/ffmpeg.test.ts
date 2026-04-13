import { EventEmitter } from 'node:events';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildM4aArgs, buildMetadataFlags, buildMkvMultiVoiceArgs, buildPadVideoArgs, runFfmpeg } from './ffmpeg';
import type { MultiVoiceTrack, SynthesisedSegment, VideoMetadata } from '../types';

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

describe('buildPadVideoArgs', () => {
	it('produces a pad filter with correct target dimensions', () => {
		const args = buildPadVideoArgs('/raw.mp4', '/out.mp4');
		const vfIndex = args.indexOf('-vf');
		expect(vfIndex).toBeGreaterThan(-1);
		const filter = args[vfIndex + 1];
		expect(filter).toContain('pad=w=1280:h=720');
	});

	it('includes -i rawMp4 as first input', () => {
		const args = buildPadVideoArgs('/raw.mp4', '/out.mp4');
		expect(args[0]).toBe('-i');
		expect(args[1]).toBe('/raw.mp4');
	});

	it('does not include any audio map', () => {
		const args = buildPadVideoArgs('/raw.mp4', '/out.mp4');
		expect(args.join(' ')).not.toContain('-map 1:');
		expect(args.join(' ')).not.toContain('amix');
	});

	it('does not include a subtitles filter', () => {
		const args = buildPadVideoArgs('/raw.mp4', '/out.mp4');
		expect(args.join(' ')).not.toContain('subtitles=');
	});

	it('ends with the output file path', () => {
		const args = buildPadVideoArgs('/raw.mp4', '/out.mp4');
		expect(args[args.length - 1]).toBe('/out.mp4');
	});
});

const twoSegments: SynthesisedSegment[] = [
	{
		audioDuration: 2.0,
		audioFile: '/segs/seg-0.wav',
		startTime: 0,
		stepIndex: 0,
		text: 'Hello.',
	},
	{
		audioDuration: 3.0,
		audioFile: '/segs/seg-1.wav',
		startTime: 5.0,
		stepIndex: 1,
		text: 'Goodbye.',
	},
];

describe('buildM4aArgs', () => {
	it('includes one -i flag per segment', () => {
		const args = buildM4aArgs(twoSegments, '/out.m4a');
		const inputs = args.filter((a) => a === '-i');
		expect(inputs).toHaveLength(2);
	});

	it('includes adelay filter for each segment', () => {
		const args = buildM4aArgs(twoSegments, '/out.m4a');
		const fc = args[args.indexOf('-filter_complex') + 1];
		expect(fc).toContain('adelay=0|0');
		expect(fc).toContain('adelay=5000|5000');
	});

	it('includes amix with normalize=0', () => {
		const args = buildM4aArgs(twoSegments, '/out.m4a');
		const fc = args[args.indexOf('-filter_complex') + 1];
		expect(fc).toContain('amix');
		expect(fc).toContain('normalize=0');
	});

	it('does not include a video map', () => {
		const args = buildM4aArgs(twoSegments, '/out.m4a');
		expect(args.join(' ')).not.toContain('-map 0:v');
	});

	it('ends with the output file path', () => {
		const args = buildM4aArgs(twoSegments, '/out.m4a');
		expect(args[args.length - 1]).toBe('/out.m4a');
	});

	it('uses AAC codec with standard sample rate', () => {
		const args = buildM4aArgs(twoSegments, '/out.m4a');
		expect(args).toContain('aac');
		expect(args).toContain('44100');
	});
});

const twoTracks: MultiVoiceTrack[] = [
	{
		captions: {
			assFile: '/out/ep.alan.ass',
			srtFile: '/out/ep.alan.srt',
			vttFile: '/out/ep.alan.vtt',
		},
		segments: [
			{
				audioDuration: 2.0,
				audioFile: '/segs/seg-0-alan.wav',
				startTime: 0,
				stepIndex: 0,
				text: 'Hello.',
			},
		],
		voice: 'alan',
	},
	{
		captions: {
			assFile: '/out/ep.alba.ass',
			srtFile: '/out/ep.alba.srt',
			vttFile: '/out/ep.alba.vtt',
		},
		segments: [
			{
				audioDuration: 2.0,
				audioFile: '/segs/seg-0-alba.wav',
				startTime: 0,
				stepIndex: 0,
				text: 'Hello.',
			},
		],
		voice: 'alba',
	},
];

describe('buildMkvMultiVoiceArgs', () => {
	it('includes one SRT input per voice', () => {
		const args = buildMkvMultiVoiceArgs('/raw.mp4', twoTracks, '/out.mkv', {
			artist: 'Test',
			title: 'Test',
		});
		const srtInputs = args.filter((a) => a.endsWith('.srt'));
		expect(srtInputs).toHaveLength(2);
	});

	it('maps video from input 0', () => {
		const args = buildMkvMultiVoiceArgs('/raw.mp4', twoTracks, '/out.mkv', {
			artist: 'Test',
			title: 'Test',
		});
		expect(args).toContain('-map');
		expect(args).toContain('0:v');
	});

	it('ends with the output file path', () => {
		const args = buildMkvMultiVoiceArgs('/raw.mp4', twoTracks, '/out.mkv', {
			artist: 'Test',
			title: 'Test',
		});
		expect(args[args.length - 1]).toBe('/out.mkv');
	});

	it('embeds container metadata via -metadata flags', () => {
		const args = buildMkvMultiVoiceArgs('/raw.mp4', twoTracks, '/out.mkv', {
			artist: 'Phil Sherry',
			title: 'My Episode',
		});
		const metaIdx = args.indexOf('-metadata');
		expect(metaIdx).toBeGreaterThan(-1);
		const pairs: Record<string, string> = {};
		for (let i = 0; i < args.length - 1; i++) {
			if (args[i] === '-metadata') {
				const [k, v] = args[i + 1].split('=');
				pairs[k] = v;
			}
		}
		expect(pairs['title']).toBe('My Episode');
		expect(pairs['artist']).toBe('Phil Sherry');
	});

	it('uses -map_chapters not -map_metadata for chapter file', () => {
		const args = buildMkvMultiVoiceArgs('/raw.mp4', twoTracks, '/out.mkv', {
			artist: 'Test',
			title: 'Test',
		}, '/chapters.txt');
		expect(args).toContain('-map_chapters');
		// -map_metadata -1 (clear auto-copy) is correct; a positive index is not.
		for (let i = 0; i < args.length - 1; i++) {
			if (args[i] === '-map_metadata') {
				expect(args[i + 1]).toBe('-1');
			}
		}
	});
});
