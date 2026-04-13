import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
	writeFileSync: vi.fn(),
}));

import { writeFileSync } from 'node:fs';
import { generateCaptions, wrapCueText } from './captions';
import type { SynthesisedSegment } from '../types';

const mockWriteFileSync = vi.mocked(writeFileSync);

const segments: SynthesisedSegment[] = [
	{
		audioDuration: 1.5,
		audioFile: '/output/segment-00-northern_english_male.wav',
		startTime: 0,
		stepIndex: 0,
		text: 'Hello world.',
	},
	{
		audioDuration: 2.0,
		audioFile: '/output/segment-02-northern_english_male.wav',
		startTime: 3.0,
		stepIndex: 2,
		text: 'Second segment.',
	},
];

/**
 * Returns the mocked file content written for a given file extension.
 * @param ext - File extension to match in the mocked write calls.
 * @returns The captured file content.
 */
function capturedContent(ext: string): string {
	const call = mockWriteFileSync.mock.calls.find(([path]) =>
		String(path).endsWith(ext)
	);
	expect(call, `no ${ext} write call found`).toBeDefined();
	return String(call![1]);
}

/**
 * Parses `HH:MM:SS.mmm` → seconds.
 * @param ts - WebVTT timestamp string.
 * @returns The timestamp converted to seconds.
 */
function parseTimestamp(ts: string): number {
	const [h, m, s] = ts.split(':');
	return Number(h) * 3600 + Number(m) * 60 + parseFloat(s);
}

/**
 * Extracts all `start --> end` pairs from a VTT string.
 * @param vtt - WebVTT file content.
 * @returns Parsed cue start and end times.
 */
function parseCueTimes(vtt: string): Array<{ end: number; start: number; }> {
	const pattern = /(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/g;
	const cues: Array<{ end: number; start: number; }> = [];
	let match;
	while ((match = pattern.exec(vtt)) !== null) {
		cues.push({ end: parseTimestamp(match[2]), start: parseTimestamp(match[1]) });
	}
	return cues;
}

/**
 * Asserts that no cue's end time exceeds the following cue's start time.
 * @param vtt - WebVTT file content.
 */
function expectNoCueOverlap(vtt: string): void {
	const cues = parseCueTimes(vtt);
	for (let i = 0; i < cues.length - 1; i++) {
		expect(
			cues[i].end,
			`cue-${i + 1} ends at ${cues[i].end}s but cue-${i + 2} starts at ${cues[i + 1].start}s`
		).toBeLessThanOrEqual(cues[i + 1].start);
	}
}

describe('wrapCueText', () => {
	it('returns short text unchanged', () => {
		expect(wrapCueText('Hello world.')).toBe('Hello world.');
	});

	it('returns text at exactly the limit unchanged', () => {
		const text = 'a'.repeat(65);
		expect(wrapCueText(text)).toBe(text);
	});

	it('wraps 66–130 char text at word boundary near the midpoint', () => {
		// 78 chars total — should split into two lines each ≤ 65 chars
		const text = 'The quick brown fox jumps over the lazy dog and then runs away fast.';
		const result = wrapCueText(text);
		const lines = result.split('\n');
		expect(lines).toHaveLength(2);
		expect(lines[0].length).toBeLessThanOrEqual(65);
		expect(lines[1].length).toBeLessThanOrEqual(65);
	});

	it('caps very long text at exactly 2 lines', () => {
		// 160-char sentence — must produce exactly 2 lines
		const text =
			'And --verbose adds detail: step count, configured voices, and the resolved output path. ' +
			'Useful when checking that a tape is wired up correctly before committing to a full build.';
		const result = wrapCueText(text);
		expect(result.split('\n')).toHaveLength(2);
	});

	it('does not introduce leading or trailing whitespace on any line', () => {
		const text = 'superlongwordthatexceedslimit ' + 'short '.repeat(10).trim();
		const lines = wrapCueText(text).split('\n');
		for (const line of lines) {
			expect(line).not.toMatch(/^\s|\s$/);
		}
	});

	it('handles a single very long word without throwing', () => {
		const text = 'a'.repeat(200);
		expect(() => wrapCueText(text)).not.toThrow();
		expect(wrapCueText(text).split('\n')).toHaveLength(2);
	});
});

describe('generateCaptions', () => {
	beforeEach(() => {
		mockWriteFileSync.mockClear();
	});

	describe('path construction', () => {
		it('returns correct ASS file path', () => {
			const result = generateCaptions(segments, '/output/dir', 'my-episode');
			expect(result.assFile).toBe('/output/dir/my-episode.ass');
		});

		it('returns correct VTT file path', () => {
			const result = generateCaptions(segments, '/output/dir', 'my-episode');
			expect(result.vttFile).toBe('/output/dir/my-episode.vtt');
		});

		it('returns correct SRT file path', () => {
			const result = generateCaptions(segments, '/output/dir', 'my-episode');
			expect(result.srtFile).toBe('/output/dir/my-episode.srt');
		});

		it('writes exactly three files', () => {
			generateCaptions(segments, '/output/dir', 'my-episode');
			expect(mockWriteFileSync).toHaveBeenCalledTimes(3);
		});
	});

	describe('VTT output', () => {
		it('starts with the WEBVTT header', () => {
			generateCaptions(segments, '/output', 'ep');
			expect(capturedContent('.vtt')).toMatch(/^WEBVTT\n/);
		});

		it('includes a cue identifier for each segment', () => {
			generateCaptions(segments, '/output', 'ep');
			const content = capturedContent('.vtt');
			expect(content).toContain('cue-1');
			expect(content).toContain('cue-2');
		});

		it('formats timestamps as HH:MM:SS.mmm', () => {
			generateCaptions(segments, '/output', 'ep');
			const content = capturedContent('.vtt');
			expect(content).toContain('00:00:00.000');
			expect(content).toContain('00:00:03.000');
		});

		it('includes the narration text', () => {
			generateCaptions(segments, '/output', 'ep');
			const content = capturedContent('.vtt');
			expect(content).toContain('Hello world.');
			expect(content).toContain('Second segment.');
		});
	});

	describe('ASS output', () => {
		it('includes the Script Info section header', () => {
			generateCaptions(segments, '/output', 'ep');
			expect(capturedContent('.ass')).toContain('[Script Info]');
		});

		it('includes a Dialogue line for each segment', () => {
			generateCaptions(segments, '/output', 'ep');
			const content = capturedContent('.ass');
			expect(content).toContain('Hello world.');
			expect(content).toContain('Second segment.');
		});

		it('uses ASS timestamp format (H:MM:SS.cc)', () => {
			generateCaptions(segments, '/output', 'ep');
			// startTime 0 → 0:00:00.00; startTime 3.0 → 0:00:03.00
			const content = capturedContent('.ass');
			expect(content).toContain('0:00:00.00');
			expect(content).toContain('0:00:03.00');
		});

		it('Style line ends with Encoding=0', () => {
			generateCaptions(segments, '/output', 'ep');
			// The last field in the Style line is Encoding (0 = ANSI/Unicode).
			// This locks the value so a future change doesn't silently break burn-in.
			expect(capturedContent('.ass')).toMatch(/^Style: Default,.*,0$/m);
		});
	});

	describe('SRT output', () => {
		it('uses a comma as the millisecond separator', () => {
			generateCaptions(segments, '/output', 'ep');
			expect(capturedContent('.srt')).toContain('00:00:00,000');
		});

		it('includes sequence numbers', () => {
			generateCaptions(segments, '/output', 'ep');
			const content = capturedContent('.srt');
			expect(content).toMatch(/^1\n/m);
			expect(content).toMatch(/^2\n/m);
		});

		it('includes the narration text', () => {
			generateCaptions(segments, '/output', 'ep');
			const content = capturedContent('.srt');
			expect(content).toContain('Hello world.');
			expect(content).toContain('Second segment.');
		});
	});

	it('handles an empty segments array without throwing', () => {
		const result = generateCaptions([], '/output', 'ep');
		expect(result.assFile).toBe('/output/ep.ass');
		expect(mockWriteFileSync).toHaveBeenCalledTimes(3);
	});

	describe('line wrapping', () => {
		const longSegment: SynthesisedSegment[] = [
			{
				audioDuration: 8.0,
				audioFile: '/output/long.wav',
				startTime: 0,
				stepIndex: 0,
				text:
					'And --verbose adds detail: step count, configured voices, and the resolved output path. ' +
					'Useful when checking that a tape is wired up correctly before committing to a full build.',
			},
		];

		it('wraps long cue text to at most 2 lines in VTT output', () => {
			generateCaptions(longSegment, '/output', 'ep');
			const lines = capturedContent('.vtt').split('\n');
			const cueTextLine = lines.find(
				(l) => l.includes('resolved') || l.includes('Useful')
			);
			// Text must not be one long line in the VTT file
			expect(cueTextLine).toBeDefined();
			expect(cueTextLine!.length).toBeLessThanOrEqual(90);
		});

		it('uses \\N line breaks in ASS output', () => {
			generateCaptions(longSegment, '/output', 'ep');
			const content = capturedContent('.ass');
			// ASS hard line break
			expect(content).toContain('\\N');
		});

		it('wraps long cue text in SRT output', () => {
			generateCaptions(longSegment, '/output', 'ep');
			const srt = capturedContent('.srt');
			// SRT uses \n — there should be a newline inside the cue text block
			const lines = srt.split('\n');
			const hasWrappedLine = lines.some(
				(l) => l.length > 0 && l.length < 90 && !l.match(/^\d+$/) && !l.includes('-->')
			);
			expect(hasWrappedLine).toBe(true);
		});
	});

	describe('cue overlap', () => {
		it('produces no overlapping cues when segments fit within their gaps', () => {
			// 'Hello world.' → 2 words → narrationDuration = 1.5s (MIN).
			// Next segment starts at 3.0s. Gap of 3.0s > 1.5s → no overlap.
			generateCaptions(segments, '/output', 'ep');
			expectNoCueOverlap(capturedContent('.vtt'));
		});

		it('produces no overlapping cues when narration estimate exceeds the next segment gap', () => {
			// 10 words → narrationDuration estimate = 4 s, but audioDuration (2.5 s) is used.
			// Next segment starts at 3 s → cue ends at 2.5 s → no overlap.
			const tightSegments: SynthesisedSegment[] = [
				{
					audioDuration: 2.5,
					audioFile: '/output/seg-0.wav',
					startTime: 0,
					stepIndex: 0,
					text: 'one two three four five six seven eight nine ten',
				},
				{
					audioDuration: 1.0,
					audioFile: '/output/seg-1.wav',
					startTime: 3.0,
					stepIndex: 1,
					text: 'Done.',
				},
			];
			generateCaptions(tightSegments, '/output', 'ep');
			expectNoCueOverlap(capturedContent('.vtt'));
		});
	});
});
