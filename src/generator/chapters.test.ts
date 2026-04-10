import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
	writeFileSync: vi.fn(),
}));

import { writeFileSync } from 'node:fs';
import { generateChapters } from './chapters';
import type { Timeline } from '../timeline';
import type { Step } from '../schema/tape';

const mockWriteFileSync = vi.mocked(writeFileSync);

/**
 * Returns the mocked file content written to `chapters.txt`.
 * @returns The captured file content.
 */
function capturedContent(): string {
	const call = mockWriteFileSync.mock.calls.find(([path]) =>
		String(path).endsWith('chapters.txt')
	);
	expect(call, 'no chapters.txt write call found').toBeDefined();
	return String(call![1]);
}

/**
 * Builds a minimal Timeline for testing.
 * @param events - Timeline events to include.
 * @param totalDuration - Total duration in seconds.
 * @returns Minimal timeline fixture.
 */
function makeTimeline(
	events: Timeline['events'],
	totalDuration: number
): Timeline {
	return { events, totalDuration };
}

describe('generateChapters', () => {
	beforeEach(() => {
		mockWriteFileSync.mockClear();
	});

	describe('with no chapter steps', () => {
		it('returns hasExplicit: false', () => {
			const steps: Step[] = [
				{ action: 'run', narration: 'Hello world', pause: 2 },
				{ action: 'comment', narration: 'Next step', pause: 1 },
			];
			const timeline = makeTimeline([
				{ duration: 2, narration: null, startTime: 0, stepIndex: 0, vhs: { directives: [], sleepSeconds: 2 } },
				{ duration: 1, narration: null, startTime: 2, stepIndex: 1, vhs: { directives: [], sleepSeconds: 1 } },
			], 3);

			const result = generateChapters(timeline, steps, '/output');
			expect(result.hasExplicit).toBe(false);
		});

		it('returns the path to chapters.txt', () => {
			const steps: Step[] = [{ action: 'run', pause: 1 }];
			const timeline = makeTimeline([
				{ duration: 1, narration: null, startTime: 0, stepIndex: 0, vhs: { directives: [], sleepSeconds: 1 } },
			], 1);

			const result = generateChapters(timeline, steps, '/output');
			expect(result.path).toBe('/output/chapters.txt');
		});

		it('FFMETADATA1 contains all steps', () => {
			const steps: Step[] = [
				{ action: 'run', narration: 'First narration', pause: 2 },
				{ action: 'comment', narration: 'Second narration', pause: 1 },
			];
			const timeline = makeTimeline([
				{ duration: 2, narration: { audioDuration: null, audioStartTime: 0, offset: 0, text: 'First narration' }, startTime: 0, stepIndex: 0, vhs: { directives: [], sleepSeconds: 2 } },
				{ duration: 1, narration: { audioDuration: null, audioStartTime: 2, offset: 0, text: 'Second narration' }, startTime: 2, stepIndex: 1, vhs: { directives: [], sleepSeconds: 1 } },
			], 3);

			generateChapters(timeline, steps, '/output');
			const content = capturedContent();
			expect(content).toContain(';FFMETADATA1');
			expect(content).toContain('[CHAPTER]');
			// Both steps should appear
			expect(content.match(/\[CHAPTER\]/g)?.length).toBe(2);
		});
	});

	describe('with explicit chapter steps', () => {
		it('returns hasExplicit: true', () => {
			const steps: Step[] = [
				{ action: 'chapter', title: 'Introduction' },
				{ action: 'run', pause: 2 },
			];
			const timeline = makeTimeline([
				{ duration: 0, narration: null, startTime: 0, stepIndex: 0, vhs: { directives: [], sleepSeconds: 0 } },
				{ duration: 2, narration: null, startTime: 0, stepIndex: 1, vhs: { directives: [], sleepSeconds: 2 } },
			], 2);

			const result = generateChapters(timeline, steps, '/output');
			expect(result.hasExplicit).toBe(true);
		});

		it('FFMETADATA1 contains only chapter steps with their titles', () => {
			const steps: Step[] = [
				{ action: 'chapter', title: 'Getting Started' },
				{ action: 'run', pause: 2 },
				{ action: 'chapter', title: 'Advanced Usage' },
				{ action: 'comment', pause: 1 },
			];
			const timeline = makeTimeline([
				{ duration: 0, narration: null, startTime: 0, stepIndex: 0, vhs: { directives: [], sleepSeconds: 0 } },
				{ duration: 2, narration: null, startTime: 0, stepIndex: 1, vhs: { directives: [], sleepSeconds: 2 } },
				{ duration: 0, narration: null, startTime: 2, stepIndex: 2, vhs: { directives: [], sleepSeconds: 0 } },
				{ duration: 1, narration: null, startTime: 2, stepIndex: 3, vhs: { directives: [], sleepSeconds: 1 } },
			], 3);

			generateChapters(timeline, steps, '/output');
			const content = capturedContent();
			expect(content).toContain('title=Getting Started');
			expect(content).toContain('title=Advanced Usage');
			// Non-chapter steps should not generate chapter entries
			expect(content.match(/\[CHAPTER\]/g)?.length).toBe(2);
		});

		it('uses next chapter start time as previous chapter end time', () => {
			const steps: Step[] = [
				{ action: 'chapter', title: 'Part One' },
				{ action: 'run', pause: 5 },
				{ action: 'chapter', title: 'Part Two' },
			];
			const timeline = makeTimeline([
				{ duration: 0, narration: null, startTime: 0, stepIndex: 0, vhs: { directives: [], sleepSeconds: 0 } },
				{ duration: 5, narration: null, startTime: 0, stepIndex: 1, vhs: { directives: [], sleepSeconds: 5 } },
				{ duration: 0, narration: null, startTime: 5, stepIndex: 2, vhs: { directives: [], sleepSeconds: 0 } },
			], 5);

			generateChapters(timeline, steps, '/output');
			const content = capturedContent();
			// Part One starts at 0ms, ends at 5000ms (where Part Two starts)
			expect(content).toContain('START=0');
			expect(content).toContain('END=5000');
			// Part Two starts at 5000ms, ends at totalDuration (5000ms)
			expect(content).toContain('START=5000');
		});

		it('last chapter ends at totalDuration', () => {
			const steps: Step[] = [
				{ action: 'chapter', title: 'Only Chapter' },
				{ action: 'run', pause: 10 },
			];
			const timeline = makeTimeline([
				{ duration: 0, narration: null, startTime: 0, stepIndex: 0, vhs: { directives: [], sleepSeconds: 0 } },
				{ duration: 10, narration: null, startTime: 0, stepIndex: 1, vhs: { directives: [], sleepSeconds: 10 } },
			], 10);

			generateChapters(timeline, steps, '/output');
			const content = capturedContent();
			expect(content).toContain('END=10000');
		});
	});

	describe('mixed steps', () => {
		it('only chapter steps appear when hasExplicit is true', () => {
			const steps: Step[] = [
				{ action: 'run', narration: 'Non-chapter narration', pause: 1 },
				{ action: 'chapter', title: 'Section One' },
				{ action: 'comment', narration: 'Another non-chapter', pause: 2 },
			];
			const timeline = makeTimeline([
				{ duration: 1, narration: { audioDuration: null, audioStartTime: 0, offset: 0, text: 'Non-chapter narration' }, startTime: 0, stepIndex: 0, vhs: { directives: [], sleepSeconds: 1 } },
				{ duration: 0, narration: null, startTime: 1, stepIndex: 1, vhs: { directives: [], sleepSeconds: 0 } },
				{ duration: 2, narration: { audioDuration: null, audioStartTime: 1, offset: 0, text: 'Another non-chapter' }, startTime: 1, stepIndex: 2, vhs: { directives: [], sleepSeconds: 2 } },
			], 3);

			const result = generateChapters(timeline, steps, '/output');
			expect(result.hasExplicit).toBe(true);

			const content = capturedContent();
			expect(content).toContain('title=Section One');
			expect(content).not.toContain('Non-chapter narration');
			expect(content).not.toContain('Another non-chapter');
			expect(content.match(/\[CHAPTER\]/g)?.length).toBe(1);
		});
	});
});
