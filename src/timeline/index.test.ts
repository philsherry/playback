import { describe, it, expect } from 'vitest';
import { buildTimeline, applyAudioDurations, extractSegments, generateVhsFromTimeline, syncSegmentsToTimeline } from './index';
import { generateVhsTape } from '../generator/vhs';
import { stepDuration } from '../constants';
import type { ParsedTape, SynthesisedSegment } from '../types';
import type { Step } from '../schema/tape';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a minimal parsed tape for timeline tests.
 * @param steps - Tape steps to include in the fixture.
 * @returns Minimal parsed tape fixture.
 */
function makeParsed(steps: Step[]): ParsedTape {
	return {
		dir: '/test',
		meta: { title: 'Test', voices: ['test_voice'] },
		posterFile: null,
		tape: { output: 'test', steps, title: 'Test Tape' },
	};
}

// ── buildTimeline ────────────────────────────────────────────────────────────

describe('buildTimeline', () => {
	it('produces one event per step', () => {
		const parsed = makeParsed([
			{ action: 'run', pause: 1 },
			{ action: 'run', pause: 2 },
		]);
		const tl = buildTimeline(parsed);
		expect(tl.events).toHaveLength(2);
	});

	it('calculates correct start times', () => {
		const parsed = makeParsed([
			{ action: 'run', pause: 1 },
			{ action: 'run', pause: 2 },
			{ action: 'run', pause: 3 },
		]);
		const tl = buildTimeline(parsed);
		expect(tl.events[0].startTime).toBe(0);
		expect(tl.events[1].startTime).toBe(1);
		expect(tl.events[2].startTime).toBe(3);
		expect(tl.totalDuration).toBe(6);
	});

	it('produces durations matching stepDuration()', () => {
		const steps: Step[] = [
			{ action: 'type', command: 'npm install' },
			{ action: 'run', narration: 'one two three four five' },
			{ action: 'key', command: 'j', pause: 0.3 },
			{ action: 'comment', pause: 2 },
		];
		const parsed = makeParsed(steps);
		const tl = buildTimeline(parsed);

		for (let i = 0; i < steps.length; i++) {
			expect(tl.events[i].duration).toBe(stepDuration(steps[i]));
		}
	});

	it('sets narration fields for narrated steps', () => {
		const parsed = makeParsed([
			{ action: 'run', narration: 'Hello world', pause: 3 },
		]);
		const tl = buildTimeline(parsed);
		expect(tl.events[0].narration).not.toBeNull();
		expect(tl.events[0].narration!.text).toBe('Hello world');
		expect(tl.events[0].narration!.audioDuration).toBeNull();
	});

	it('sets narration to null for non-narrated steps', () => {
		const parsed = makeParsed([{ action: 'run', pause: 1 }]);
		const tl = buildTimeline(parsed);
		expect(tl.events[0].narration).toBeNull();
	});

	it('applies narrationOffset to audioStartTime', () => {
		const parsed = makeParsed([
			{ action: 'run', narration: 'Delayed', narrationOffset: 1.5, pause: 5 },
		]);
		const tl = buildTimeline(parsed);
		expect(tl.events[0].narration!.offset).toBe(1.5);
		expect(tl.events[0].narration!.audioStartTime).toBe(1.5);
	});

	it('handles negative narrationOffset', () => {
		const parsed = makeParsed([
			{ action: 'run', pause: 2 },
			{ action: 'run', narration: 'Early', narrationOffset: -1, pause: 3 },
		]);
		const tl = buildTimeline(parsed);
		// Step 1 starts at t=2, offset is -1, so audioStartTime = 1
		expect(tl.events[1].narration!.audioStartTime).toBe(1);
	});

	it('generates correct VHS directives for type steps', () => {
		const parsed = makeParsed([
			{ action: 'type', command: 'ls' },
		]);
		const tl = buildTimeline(parsed);
		expect(tl.events[0].vhs.directives).toEqual(['Type "ls"', 'Enter']);
	});

	it('generates correct VHS directives for key steps', () => {
		const parsed = makeParsed([
			{ action: 'key', command: 'j', pause: 0.3 },
		]);
		const tl = buildTimeline(parsed);
		expect(tl.events[0].vhs.directives).toEqual(['Type "j"']);
		expect(tl.events[0].vhs.sleepSeconds).toBe(0.3);
	});

	it('uses VHS command name for special keys', () => {
		const parsed = makeParsed([
			{ action: 'key', command: 'Escape', pause: 0.5 },
		]);
		const tl = buildTimeline(parsed);
		expect(tl.events[0].vhs.directives).toEqual(['Escape']);
	});

	it('generates empty directives for run and comment steps', () => {
		const parsed = makeParsed([
			{ action: 'run', pause: 2 },
			{ action: 'comment', pause: 1 },
		]);
		const tl = buildTimeline(parsed);
		expect(tl.events[0].vhs.directives).toEqual([]);
		expect(tl.events[1].vhs.directives).toEqual([]);
	});

	it('chapter step has zero duration', () => {
		const parsed = makeParsed([
			{ action: 'chapter', title: 'My Chapter' },
		]);
		const tl = buildTimeline(parsed);
		expect(tl.events[0].duration).toBe(0);
	});

	it('chapter step has null narration', () => {
		const parsed = makeParsed([
			{ action: 'chapter', title: 'My Chapter' },
		]);
		const tl = buildTimeline(parsed);
		expect(tl.events[0].narration).toBeNull();
	});

	it('chapter step does not affect start times of surrounding steps', () => {
		const parsed = makeParsed([
			{ action: 'run', pause: 2 },
			{ action: 'chapter', title: 'Marker' },
			{ action: 'run', pause: 3 },
		]);
		const tl = buildTimeline(parsed);
		// Chapter has zero duration, so step at index 2 starts at same time as if chapter wasn't there
		expect(tl.events[0].startTime).toBe(0);
		expect(tl.events[1].startTime).toBe(2);
		expect(tl.events[2].startTime).toBe(2);
		expect(tl.totalDuration).toBe(5);
	});
});

// ── applyAudioDurations ──────────────────────────────────────────────────────

describe('applyAudioDurations', () => {
	it('extends events when audio is longer than the step duration', () => {
		const parsed = makeParsed([
			{ action: 'run', narration: 'Short text', pause: 1 },
		]);
		const tl = buildTimeline(parsed);
		const segments: SynthesisedSegment[] = [{
			audioDuration: 5, // much longer than pause
			audioFile: '/tmp/seg.wav',
			startTime: 0,
			stepIndex: 0,
			text: 'Short text',
		}];

		applyAudioDurations(tl, segments, 0.5);
		expect(tl.events[0].duration).toBeGreaterThanOrEqual(5.5);
		expect(tl.events[0].narration!.audioDuration).toBe(5);
	});

	it('does not shrink events when audio is shorter', () => {
		const parsed = makeParsed([
			{ action: 'run', narration: 'one two three four five six seven eight nine ten', pause: 10 },
		]);
		const tl = buildTimeline(parsed);
		const originalDuration = tl.events[0].duration;

		const segments: SynthesisedSegment[] = [{
			audioDuration: 2, // shorter than step
			audioFile: '/tmp/seg.wav',
			startTime: 0,
			stepIndex: 0,
			text: 'test',
		}];

		applyAudioDurations(tl, segments, 0.5);
		expect(tl.events[0].duration).toBe(originalDuration);
	});

	it('recalculates start times after back-fill', () => {
		const parsed = makeParsed([
			{ action: 'run', narration: 'First', pause: 1 },
			{ action: 'run', narration: 'Second', pause: 1 },
		]);
		const tl = buildTimeline(parsed);

		const segments: SynthesisedSegment[] = [
			{ audioDuration: 5, audioFile: '/tmp/0.wav', startTime: 0, stepIndex: 0, text: 'First' },
			{ audioDuration: 1, audioFile: '/tmp/1.wav', startTime: 1, stepIndex: 1, text: 'Second' },
		];

		applyAudioDurations(tl, segments, 0.5);
		// First event extended to at least 5.5s, so second starts at >= 5.5
		expect(tl.events[1].startTime).toBeGreaterThanOrEqual(5.5);
	});

	it('resolves narration overlaps', () => {
		const parsed = makeParsed([
			{ action: 'run', narration: 'First', pause: 2 },
			{ action: 'run', pause: 0.1 }, // short gap step
			{ action: 'run', narration: 'Second', pause: 2 },
		]);
		const tl = buildTimeline(parsed);

		const segments: SynthesisedSegment[] = [
			{ audioDuration: 3, audioFile: '/tmp/0.wav', startTime: 0, stepIndex: 0, text: 'First' },
			{ audioDuration: 1, audioFile: '/tmp/2.wav', startTime: 2.1, stepIndex: 2, text: 'Second' },
		];

		applyAudioDurations(tl, segments, 0.5);

		const firstEnd = tl.events[0].narration!.audioStartTime + tl.events[0].narration!.audioDuration!;
		const secondStart = tl.events[2].narration!.audioStartTime;
		// Gap should be at least 0.25s
		expect(secondStart - firstEnd).toBeGreaterThanOrEqual(0.25);
	});
});

// ── extractSegments ──────────────────────────────────────────────────────────

describe('extractSegments', () => {
	it('returns only narrated steps', () => {
		const parsed = makeParsed([
			{ action: 'run', narration: 'First', pause: 1 },
			{ action: 'run', pause: 1 },
			{ action: 'run', narration: 'Third', pause: 1 },
		]);
		const tl = buildTimeline(parsed);

		const script = extractSegments(tl, '/tmp');
		expect(script.segments).toHaveLength(2);
		expect(script.segments[0].text).toBe('First');
		expect(script.segments[1].text).toBe('Third');
	});

	it('uses audioStartTime from timeline', () => {
		const parsed = makeParsed([
			{ action: 'run', narration: 'Offset', narrationOffset: 1, pause: 3 },
		]);
		const tl = buildTimeline(parsed);

		const script = extractSegments(tl, '/tmp');
		expect(script.segments[0].startTime).toBe(1); // 0 + offset 1
	});
});

// ── generateVhsFromTimeline ──────────────────────────────────────────────────

describe('generateVhsFromTimeline', () => {
	it('generates a valid tape with header and events', () => {
		const parsed = makeParsed([
			{ action: 'type', command: 'ls' },
			{ action: 'run', pause: 2 },
		]);
		const tl = buildTimeline(parsed);
		const tape = generateVhsFromTimeline(tl, parsed);

		expect(tape).toContain('Output ./test.raw.mp4');
		expect(tape).toContain('Set Width 1280');
		expect(tape).toContain('Type "ls"');
		expect(tape).toContain('Enter');
		expect(tape).toContain('Sleep 2.00s');
	});

	it('matches generateVhsTape output for identical input', () => {
		const steps: Step[] = [
			{ action: 'type', command: 'npm install' },
			{ action: 'run', pause: 3 },
			{ action: 'key', command: 'j', pause: 0.3 },
			{ action: 'comment', pause: 2 },
		];
		const parsed = makeParsed(steps);
		const tl = buildTimeline(parsed);

		const oldTape = generateVhsTape(parsed);
		const newTape = generateVhsFromTimeline(tl, parsed);

		expect(newTape).toBe(oldTape);
	});

	it('skips chapter steps entirely — no Sleep line emitted', () => {
		const parsed = makeParsed([
			{ action: 'run', pause: 1 },
			{ action: 'chapter', title: 'A Chapter' },
			{ action: 'run', pause: 2 },
		]);
		const tl = buildTimeline(parsed);
		const tape = generateVhsFromTimeline(tl, parsed);

		// Should contain Sleep for the run steps
		expect(tape).toContain('Sleep 1.00s');
		expect(tape).toContain('Sleep 2.00s');
		// Chapter title should not appear in VHS tape
		expect(tape).not.toContain('A Chapter');
		// Should not contain a Sleep 0.00s for the chapter
		expect(tape).not.toContain('Sleep 0.00s');
	});

	it('uses back-filled sleep values after applyAudioDurations', () => {
		const parsed = makeParsed([
			{ action: 'run', narration: 'Long narration text', pause: 1 },
		]);
		const tl = buildTimeline(parsed);

		const segments: SynthesisedSegment[] = [{
			audioDuration: 8,
			audioFile: '/tmp/seg.wav',
			startTime: 0,
			stepIndex: 0,
			text: 'Long narration text',
		}];

		applyAudioDurations(tl, segments, 0.5);
		const tape = generateVhsFromTimeline(tl, parsed);

		// Sleep should be at least 8.5s (audio + buffer)
		expect(tape).toContain('Sleep 8.50s');
	});
});

// ── syncSegmentsToTimeline ───────────────────────────────────────────────────

describe('syncSegmentsToTimeline', () => {
	it('updates segment start times from timeline narration', () => {
		const parsed = makeParsed([
			{ action: 'run', narration: 'First', pause: 1 },
			{ action: 'run', narration: 'Second', pause: 1 },
		]);
		const tl = buildTimeline(parsed);

		// Simulate back-fill changing start times
		tl.events[0].startTime = 0;
		tl.events[0].narration!.audioStartTime = 0;
		tl.events[1].startTime = 5;
		tl.events[1].narration!.audioStartTime = 5;

		const segments: SynthesisedSegment[] = [
			{ audioDuration: 3, audioFile: '/tmp/0.wav', startTime: 0, stepIndex: 0, text: 'First' },
			{ audioDuration: 2, audioFile: '/tmp/1.wav', startTime: 1, stepIndex: 1, text: 'Second' },
		];

		const synced = syncSegmentsToTimeline(tl, segments);
		expect(synced[0].startTime).toBe(0);
		expect(synced[1].startTime).toBe(5);
	});
});
