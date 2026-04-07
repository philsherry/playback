import { describe, it, expect } from 'vitest';
import { buildOverlayFilter } from './overlay';
import { buildTimeline } from '../timeline';
import type { ParsedTape } from '../types';
import type { Step } from '../schema/tape';

/**
 * Creates a minimal parsed tape for overlay tests.
 * @param steps - Tape steps to include in the parsed tape.
 * @returns Minimal parsed tape fixture.
 */
function makeParsed(steps: Step[]): ParsedTape {
	return {
		dir: '/test',
		meta: { title: 'Test', voices: ['test_voice'] },
		posterFile: null,
		tape: { output: 'test', title: 'Test Tape', steps },
	};
}

describe('buildOverlayFilter', () => {
	it('returns empty string for tapes with no commands', () => {
		const tl = buildTimeline(makeParsed([
			{ action: 'run', pause: 2 },
			{ action: 'comment', pause: 1 },
		]));
		expect(buildOverlayFilter(tl)).toBe('');
	});

	it('generates drawtext filter for type steps', () => {
		const tl = buildTimeline(makeParsed([
			{ action: 'type', command: 'ls -la' },
		]));
		const filter = buildOverlayFilter(tl);
		expect(filter).toContain("drawtext=text='command ls -la'");
		expect(filter).toContain('fontsize=24');
		expect(filter).toContain('enable=');
	});

	it('generates drawtext filter for key steps', () => {
		const tl = buildTimeline(makeParsed([
			{ action: 'key', command: 'j', pause: 0.3 },
		]));
		const filter = buildOverlayFilter(tl);
		expect(filter).toContain("drawtext=text='command j'");
	});

	it('uses special key names directly', () => {
		const tl = buildTimeline(makeParsed([
			{ action: 'key', command: 'Escape', pause: 0.5 },
		]));
		const filter = buildOverlayFilter(tl);
		expect(filter).toContain("drawtext=text='command Escape'");
	});

	it('produces comma-separated filters for multiple commands', () => {
		const tl = buildTimeline(makeParsed([
			{ action: 'type', command: 'ls' },
			{ action: 'key', command: 'j', pause: 0.3 },
		]));
		const filter = buildOverlayFilter(tl);
		expect(filter.split(',drawtext=').length).toBe(2);
	});

	it('uses timeline start times for enable ranges', () => {
		const tl = buildTimeline(makeParsed([
			{ action: 'run', pause: 5 },
			{ action: 'type', command: 'pwd' },
		]));
		const filter = buildOverlayFilter(tl);
		// The type step starts at t=5
		expect(filter).toContain('between(t,5.000');
	});
});
