import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
	writeFileSync: vi.fn(),
}));

import { writeFileSync } from 'node:fs';
import { extractTtsScript } from './tts';
import type { ParsedTape } from '../types';

const mockWriteFileSync = vi.mocked(writeFileSync);

const mockTape: ParsedTape = {
	dir: '/tapes/test',
	meta: {
		title: 'Test Episode',
		voices: ['northern_english_male'],
	},
	posterFile: null,
	tape: {
		output: 'test/output',
		title: 'Test Tape',
		steps: [
			{ action: 'type', command: 'ls', narration: 'List the files.' },
			{ action: 'run', narration: 'The command runs.' },
			{ action: 'comment' }, // no narration — should not produce a segment
			{ action: 'type', command: 'pwd' }, // no narration
		],
	},
};

describe('extractTtsScript', () => {
	beforeEach(() => {
		mockWriteFileSync.mockClear();
	});

	it('returns the script file path inside outputDir', () => {
		const result = extractTtsScript(mockTape, '/output/dir');
		expect(result.scriptFile).toBe('/output/dir/script.txt');
	});

	it('extracts only steps that have narration', () => {
		const result = extractTtsScript(mockTape, '/output');
		expect(result.segments).toHaveLength(2);
	});

	it('preserves zero-based step indices', () => {
		const result = extractTtsScript(mockTape, '/output');
		expect(result.segments[0].stepIndex).toBe(0);
		expect(result.segments[1].stepIndex).toBe(1);
	});

	it('sets startTime to 0 for the first narrated step', () => {
		const result = extractTtsScript(mockTape, '/output');
		expect(result.segments[0].startTime).toBe(0);
	});

	it('sets startTime based on cumulative preceding step durations', () => {
		// step 0: type 'ls' with 3-word narration
		//   typing: 2 * 0.075 + 0.5 = 0.65s
		//   narrationDuration('List the files.') = max(1.5, 3/150*60) = 1.5s
		//   stepDuration = max(0.65, 1.5) = 1.5s
		const result = extractTtsScript(mockTape, '/output');
		expect(result.segments[1].startTime).toBeCloseTo(1.5, 5);
	});

	it('preserves the narration text verbatim', () => {
		const result = extractTtsScript(mockTape, '/output');
		expect(result.segments[0].text).toBe('List the files.');
		expect(result.segments[1].text).toBe('The command runs.');
	});

	it('writes a script.txt file', () => {
		extractTtsScript(mockTape, '/output');
		expect(mockWriteFileSync).toHaveBeenCalledOnce();
		expect(mockWriteFileSync).toHaveBeenCalledWith(
			'/output/script.txt',
			expect.any(String),
			'utf8'
		);
	});

	it('returns empty segments for a tape with no narration', () => {
		const tape: ParsedTape = {
			...mockTape,
			tape: {
				...mockTape.tape,
				steps: [
					{ action: 'type', command: 'ls' },
					{ action: 'run' },
				],
			},
		};
		const result = extractTtsScript(tape, '/output');
		expect(result.segments).toHaveLength(0);
	});

	it('writes "(no narration)" to the script file when there are no segments', () => {
		const tape: ParsedTape = {
			...mockTape,
			tape: { ...mockTape.tape, steps: [{ action: 'run' }] },
		};
		extractTtsScript(tape, '/output');
		const [, content] = mockWriteFileSync.mock.calls[0];
		expect(String(content)).toContain('(no narration)');
	});

	it('includes timestamps in the script file', () => {
		extractTtsScript(mockTape, '/output');
		const [, content] = mockWriteFileSync.mock.calls[0];
		// First segment starts at 0.00s
		expect(String(content)).toMatch(/\[0\.00s\]/);
	});
});
