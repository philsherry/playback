import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
	spawn: vi.fn(),
	execFileSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
	existsSync: vi.fn(),
	mkdirSync: vi.fn(),
}));

import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { runPiper, PiperError, VOICE_CONFIG } from './piper';
import type { NarrationSegment } from '../types';

const mockSpawn = vi.mocked(spawn);
const mockExecFileSync = vi.mocked(execFileSync);
const mockExistsSync = vi.mocked(existsSync);

/**
 * Minimal child-process stub that triggers the 'close' handler on the next
 * tick. Covers the stdin/stderr/on surface that `synthesise` actually uses.
 * @param exitCode - Exit code passed to the 'close' listener.
 * @returns A mock child-process object compatible with the `spawn` return type.
 */
function makeChildMock(exitCode = 0) {
	const child = {
		stdin: { write: vi.fn(), end: vi.fn() },
		stderr: { on: vi.fn() },
		on: vi.fn((event: string, fn: (arg: unknown) => void) => {
			if (event === 'close') setImmediate(() => fn(exitCode));
		}),
	};

	return child as unknown as ReturnType<typeof spawn>;
}

const segment: NarrationSegment = {
	stepIndex: 0,
	startTime: 0,
	text: 'Hello.',
};

describe('runPiper', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockExistsSync.mockReturnValue(true);
		mockExecFileSync.mockReturnValue('2.5\n' as ReturnType<typeof execFileSync>);
		mockSpawn.mockReturnValue(makeChildMock());
	});

	it('returns an empty array immediately when given no segments', async () => {
		const result = await runPiper([], '/output');
		expect(result).toEqual([]);
		expect(mockSpawn).not.toHaveBeenCalled();
	});

	it('throws PiperError when the voice model is not found locally or in XDG cache', async () => {
		mockExistsSync.mockReturnValue(false);
		await expect(runPiper([segment], '/output')).rejects.toBeInstanceOf(PiperError);
	});

	it('throws PiperError with both searched paths in the message', async () => {
		mockExistsSync.mockReturnValue(false);
		await expect(runPiper([segment], '/output')).rejects.toThrow(/Searched:/);
	});

	it('falls back to XDG cache when project-local model is missing', async () => {
		// First call (project-local) returns false, second call (XDG) returns true.
		mockExistsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);
		const result = await runPiper([segment], '/output');
		expect(result).toHaveLength(1);
	});

	describe('piper spawn arguments', () => {
		/**
		 * Retrieves the args array from the first spawn() call.
		 * spawn(command, args, options) → mockSpawn.mock.calls[0][1]
		 * @returns The args array passed to the first `spawn` call.
		 */
		async function spawnArgs(): Promise<string[]> {
			await runPiper([segment], '/output');
			return mockSpawn.mock.calls[0][1] as string[];
		}

		it('spawns piper with --model pointing to the resolved .onnx file', async () => {
			const args = await spawnArgs();
			expect(args).toContain('--model');
			expect(args[args.indexOf('--model') + 1]).toMatch(/en_GB-northern_english_male-medium\.onnx$/);
		});

		it('spawns piper with --output_file in the segments subdirectory', async () => {
			const args = await spawnArgs();
			expect(args).toContain('--output_file');
			expect(args[args.indexOf('--output_file') + 1]).toMatch(
				/\/output\/segments\/00-northern_english_male\.wav$/
			);
		});

		// Regression guard: piper's VITS model samples fresh random noise on
		// every sentence boundary within a single synthesis call. Without
		// explicit values the default noise_scale=0.667 and noise_w=0.8
		// cause consecutive sentences to sound like different speakers.
		// noise_scale (phonation/timbre) is set very low to lock down speaker
		// identity; noise_w (duration) is kept higher to preserve natural
		// rhythm across the episode. Values are driven from VOICE_CONFIG so
		// any tuning change here is automatically reflected in the test.
		it('passes --noise_scale from VOICE_CONFIG for the active voice', async () => {
			const args = await spawnArgs();
			expect(args).toContain('--noise_scale');
			expect(args[args.indexOf('--noise_scale') + 1]).toBe(
				String(VOICE_CONFIG['northern_english_male'].noiseScale)
			);
		});

		it('passes --noise_w from VOICE_CONFIG for the active voice', async () => {
			const args = await spawnArgs();
			expect(args).toContain('--noise_w');
			expect(args[args.indexOf('--noise_w') + 1]).toBe(
				String(VOICE_CONFIG['northern_english_male'].noiseW)
			);
		});

		it('passes --length_scale from VOICE_CONFIG for the active voice', async () => {
			const args = await spawnArgs();
			expect(args).toContain('--length_scale');
			expect(args[args.indexOf('--length_scale') + 1]).toBe(
				String(VOICE_CONFIG['northern_english_male'].lengthScale)
			);
		});
	});

	describe('returned segments', () => {
		it('resolves with the correct number of segments', async () => {
			const result = await runPiper([segment], '/output');
			expect(result).toHaveLength(1);
		});

		it('includes the measured audioDuration from ffprobe', async () => {
			const result = await runPiper([segment], '/output');
			expect(result[0].audioDuration).toBe(2.5);
		});

		it('includes the audioFile path pointing into segments subdirectory', async () => {
			const result = await runPiper([segment], '/output');
			expect(result[0].audioFile).toMatch(
				/\/output\/segments\/00-northern_english_male\.wav$/
			);
		});

		it('preserves the original segment fields', async () => {
			const result = await runPiper([segment], '/output');
			expect(result[0].stepIndex).toBe(0);
			expect(result[0].startTime).toBe(0);
			expect(result[0].text).toBe('Hello.');
		});
	});

	it('throws PiperError when piper is not on PATH', async () => {
		mockSpawn.mockReturnValue(makeChildMock());
		// Simulate ENOENT on the 'error' event rather than 'close'
		const enoentChild = {
			stdin: { write: vi.fn(), end: vi.fn() },
			stderr: { on: vi.fn() },
			on: vi.fn((event: string, fn: (arg: unknown) => void) => {
				if (event === 'error') {
					const err = Object.assign(new Error('spawn piper ENOENT'), { code: 'ENOENT' });
					setImmediate(() => fn(err));
				}
			}),
		} as unknown as ReturnType<typeof spawn>;

		mockSpawn.mockReturnValue(enoentChild);
		await expect(runPiper([segment], '/output')).rejects.toBeInstanceOf(PiperError);
	});
});
