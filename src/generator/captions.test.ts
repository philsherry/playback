import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
	writeFileSync: vi.fn(),
}));

import { writeFileSync } from 'node:fs';
import { generateCaptions } from './captions';
import type { SynthesisedSegment } from '../types';

const mockWriteFileSync = vi.mocked(writeFileSync);

const segments: SynthesisedSegment[] = [
	{
		stepIndex: 0,
		startTime: 0,
		text: 'Hello world.',
		audioFile: '/output/segment-00-northern_english_male.wav',
		audioDuration: 1.5,
	},
	{
		stepIndex: 2,
		startTime: 3.0,
		text: 'Second segment.',
		audioFile: '/output/segment-02-northern_english_male.wav',
		audioDuration: 2.0,
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
function parseCueTimes(vtt: string): Array<{ start: number; end: number }> {
	const pattern = /(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/g;
	const cues: Array<{ start: number; end: number }> = [];
	let match;
	while ((match = pattern.exec(vtt)) !== null) {
		cues.push({ start: parseTimestamp(match[1]), end: parseTimestamp(match[2]) });
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

	describe('cue overlap', () => {
		it('produces no overlapping cues when segments fit within their gaps', () => {
			// 'Hello world.' → 2 words → narrationDuration = 1.5s (MIN).
			// Next segment starts at 3.0s. Gap of 3.0s > 1.5s → no overlap.
			generateCaptions(segments, '/output', 'ep');
			expectNoCueOverlap(capturedContent('.vtt'));
		});

		// This test documents the known cue-overlap bug (see VOICE.md §subtitle cue overlap).
		// narrationDuration uses a word-count estimate that can exceed the gap to the next
		// segment. When it does, the generated VTT cues overlap.
		//
		// The test FAILS with the current implementation: buildCues() uses
		// narrationDuration(text) as the end time, which here produces 4 s for a 10-word
		// segment while the next segment starts at only 3 s.
		//
		// The fix should cap each cue's end time at min(estimate, nextSegment.startTime)
		// or derive end times from the real audioDuration instead of the estimate.
		it('produces no overlapping cues when narration estimate exceeds the next segment gap', () => {
			// 10 words → narrationDuration = 10/150*60 = 4 s.
			// Next segment starts at 3 s → estimate overshoots by 1 s.
			// audioDuration (2.5 s) would fit, but buildCues() ignores it.
			const tightSegments: SynthesisedSegment[] = [
				{
					stepIndex: 0,
					startTime: 0,
					text: 'one two three four five six seven eight nine ten',
					audioFile: '/output/seg-0.wav',
					audioDuration: 2.5,
				},
				{
					stepIndex: 1,
					startTime: 3.0,
					text: 'Done.',
					audioFile: '/output/seg-1.wav',
					audioDuration: 1.0,
				},
			];
			generateCaptions(tightSegments, '/output', 'ep');
			expectNoCueOverlap(capturedContent('.vtt'));
		});
	});
});
