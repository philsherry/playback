import { describe, it, expect } from 'vitest';
import {
	narrationDuration,
	stepDuration,
	stepToTime,
	MIN_NARRATION_DURATION,
} from './constants';
import type { Step } from './schema/tape';

describe('narrationDuration', () => {
	it('returns MIN_NARRATION_DURATION for a single word', () => {
		// 1 word / 150 wpm * 60 = 0.4s < 1.5 minimum
		expect(narrationDuration('Hello.')).toBe(MIN_NARRATION_DURATION);
	});

	it('returns MIN_NARRATION_DURATION for three words', () => {
		// 3 / 150 * 60 = 1.2s < 1.5
		expect(narrationDuration('one two three')).toBe(MIN_NARRATION_DURATION);
	});

	it('returns calculated duration when it exceeds the minimum', () => {
		// 4 words: 4/150*60 = 1.6s > 1.5
		expect(narrationDuration('one two three four')).toBeCloseTo(1.6, 5);
	});

	it('returns 60s for exactly 150 words', () => {
		const text = Array.from({ length: 150 }, (_, i) => `word${i}`).join(' ');
		expect(narrationDuration(text)).toBe(60);
	});

	it('trims leading/trailing whitespace before counting words', () => {
		expect(narrationDuration('  hello  ')).toBe(MIN_NARRATION_DURATION);
	});
});

describe('stepDuration', () => {
	it('returns default pause for a run step with no narration', () => {
		const step: Step = { action: 'run' };
		expect(stepDuration(step)).toBe(0.5);
	});

	it('honours custom pause for a run step', () => {
		const step: Step = { action: 'run', pause: 2 };
		expect(stepDuration(step)).toBe(2);
	});

	it('returns narration duration when it exceeds pause for a run step', () => {
		// 4 words → 1.6s > 0.5 pause
		const step: Step = { action: 'run', narration: 'one two three four' };
		expect(stepDuration(step)).toBeCloseTo(1.6, 5);
	});

	it('returns default pause for a comment step with no narration', () => {
		const step: Step = { action: 'comment' };
		expect(stepDuration(step)).toBe(0.5);
	});

	it('includes typing time for a type step', () => {
		// 'ls' = 2 chars * 75ms = 150ms + 500ms pause = 650ms = 0.65s
		const step: Step = { action: 'type', command: 'ls' };
		expect(stepDuration(step)).toBeCloseTo(0.65, 5);
	});

	it('uses narration duration for a type step when it exceeds the typing time', () => {
		// 'ls' typing = 0.65s; 4-word narration = 1.6s → 1.6s wins
		const step: Step = {
			action: 'type',
			command: 'ls',
			narration: 'one two three four',
		};
		expect(stepDuration(step)).toBeCloseTo(1.6, 5);
	});

	it('uses typing time for a type step when it exceeds the narration duration', () => {
		// 'npm install --save-dev' = 22 chars → 22*0.075 + 0.5 = 2.15s
		const step: Step = {
			action: 'type',
			command: 'npm install --save-dev',
			narration: 'Install it.',
		};
		// narrationDuration('Install it.') = max(1.5, 2/150*60) = 1.5
		// typing = 22 * 0.075 + 0.5 = 2.15
		// max(2.15, 1.5) = 2.15
		expect(stepDuration(step)).toBeCloseTo(2.15, 5);
	});
});

describe('stepToTime', () => {
	const steps: Step[] = [
		{ action: 'run', pause: 1 },
		{ action: 'run', pause: 2 },
		{ action: 'run', pause: 3 },
	];

	it('returns 0 for stepNumber 0', () => {
		expect(stepToTime(steps, 0)).toBe(0);
	});

	it('returns duration of first step for stepNumber 1', () => {
		expect(stepToTime(steps, 1)).toBe(1);
	});

	it('returns cumulative duration for stepNumber 2', () => {
		expect(stepToTime(steps, 2)).toBe(3);
	});

	it('returns cumulative duration for stepNumber 3', () => {
		expect(stepToTime(steps, 3)).toBe(6);
	});

	it('clamps to total duration for an out-of-range stepNumber', () => {
		expect(stepToTime(steps, 100)).toBe(6);
	});

	it('returns 0 for an empty steps array', () => {
		expect(stepToTime([], 1)).toBe(0);
	});
});
