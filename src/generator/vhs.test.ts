import { describe, it, expect } from 'vitest';
import { generateVhsTape } from './vhs';
import type { ParsedTape } from '../types';

const baseTape: ParsedTape = {
	dir: '/tapes/s1/01-test',
	meta: { title: 'Test Episode', voices: ['northern_english_male'] },
	posterFile: null,
	tape: {
		output: 's1/01-test',
		title: 'Test Tape',
		steps: [{ action: 'run' }],
	},
};

describe('generateVhsTape', () => {
	describe('header', () => {
		it('uses basename of tape.output in the Output directive', () => {
			const result = generateVhsTape(baseTape);
			expect(result).toContain('Output ./01-test.raw.mp4');
		});

		it('prefixes the output filename with ./ to avoid VHS parser issues', () => {
			// Bare filenames starting with digits confuse the VHS parser
			const tape: ParsedTape = {
				...baseTape,
				tape: { ...baseTape.tape, output: 's1/01-numeric-start' },
			};
			expect(generateVhsTape(tape)).toContain('Output ./01-numeric-start.raw.mp4');
		});

		it('sets video dimensions from constants', () => {
			const result = generateVhsTape(baseTape);
			expect(result).toContain('Set Width 1280');
			expect(result).toContain('Set Height 660');
		});

		it('sets framerate, font, and theme', () => {
			const result = generateVhsTape(baseTape);
			expect(result).toContain('Set Framerate 30');
			expect(result).toContain('Set FontFamily "FiraCode Nerd Font Mono"');
			expect(result).toContain("Set Theme '");
		});

		it('sets typing speed', () => {
			const result = generateVhsTape(baseTape);
			expect(result).toContain('Set TypingSpeed 75ms');
		});
	});

	describe('type step', () => {
		it('generates Type, Enter, and Sleep directives', () => {
			const tape: ParsedTape = {
				...baseTape,
				tape: { ...baseTape.tape, steps: [{ action: 'type', command: 'ls' }] },
			};
			const result = generateVhsTape(tape);
			expect(result).toContain('Type "ls"');
			expect(result).toContain('Enter');
			expect(result).toMatch(/Sleep \d+\.\d+s/);
		});

		it('escapes double quotes in commands', () => {
			const tape: ParsedTape = {
				...baseTape,
				tape: {
					...baseTape.tape,
					steps: [{ action: 'type', command: 'echo "hello"' }],
				},
			};
			expect(generateVhsTape(tape)).toContain('Type "echo \\"hello\\""');
		});

		it('escapes backticks in commands', () => {
			const tape: ParsedTape = {
				...baseTape,
				tape: {
					...baseTape.tape,
					steps: [{ action: 'type', command: 'echo `date`' }],
				},
			};
			expect(generateVhsTape(tape)).toContain('Type "echo \\`date\\`"');
		});

		it('deducts typing time from the sleep duration', () => {
			// 'npm install' = 11 chars * 75ms = 825ms typing
			// pause = 0.5s default, no narration
			// sleep = round(max(0.5, 0 - 0.825, 0.1) * 100) / 100 = 0.50
			const tape: ParsedTape = {
				...baseTape,
				tape: {
					...baseTape.tape,
					steps: [{ action: 'type', command: 'npm install' }],
				},
			};
			expect(generateVhsTape(tape)).toContain('Sleep 0.50s');
		});
	});

	describe('run step', () => {
		it('generates only a Sleep directive', () => {
			// baseTape has a single run step with no pause — uses DEFAULT_PAUSE 0.5s
			const result = generateVhsTape(baseTape);
			expect(result).toContain('Sleep 0.50s');
			expect(result).not.toContain('Type');
			expect(result).not.toContain('Enter');
		});

		it('uses narration duration when it exceeds the pause', () => {
			// 10 words → narrationDuration = max(1.5, 10/150*60) = max(1.5, 4) = 4s
			// sleep = round(max(0.5, 4) * 100) / 100 = 4.00
			const tape: ParsedTape = {
				...baseTape,
				tape: {
					...baseTape.tape,
					steps: [
						{
							action: 'run',
							narration:
								'one two three four five six seven eight nine ten',
						},
					],
				},
			};
			expect(generateVhsTape(tape)).toContain('Sleep 4.00s');
		});

		it('honours an explicit pause value', () => {
			const tape: ParsedTape = {
				...baseTape,
				tape: { ...baseTape.tape, steps: [{ action: 'run', pause: 7 }] },
			};
			expect(generateVhsTape(tape)).toContain('Sleep 7.00s');
		});
	});

	describe('comment step', () => {
		it('generates a Sleep directive when pause > 0', () => {
			const tape: ParsedTape = {
				...baseTape,
				tape: { ...baseTape.tape, steps: [{ action: 'comment', pause: 2 }] },
			};
			expect(generateVhsTape(tape)).toContain('Sleep 2.00s');
		});

		it('emits nothing when pause is 0 and there is no narration', () => {
			const tape: ParsedTape = {
				...baseTape,
				tape: { ...baseTape.tape, steps: [{ action: 'comment', pause: 0 }] },
			};
			// The header ends with a blank line; everything after is step output.
			// A zero-sleep comment produces no directives at all.
			const stepLines = generateVhsTape(tape)
				.split('\n')
				.filter((l) => l.startsWith('Type') || l.startsWith('Sleep') || l === 'Enter');
			expect(stepLines).toHaveLength(0);
		});
	});

	describe('sleep rounding', () => {
		it('rounds sleep to two decimal places, not whole seconds', () => {
			// 4-word narration: max(1.5, 4/150*60) = max(1.5, 1.6) = 1.6
			// round(1.6 * 100) / 100 = 1.60 — NOT ceil'd to 2s
			// (Previously Math.ceil produced Sleep 2s, which inflated short steps
			// and caused audio drift on tapes with many sub-second key presses.)
			const tape: ParsedTape = {
				...baseTape,
				tape: {
					...baseTape.tape,
					steps: [{ action: 'run', narration: 'one two three four' }],
				},
			};
			expect(generateVhsTape(tape)).toContain('Sleep 1.60s');
			expect(generateVhsTape(tape)).not.toContain('Sleep 2s');
		});

		it('preserves sub-second pause values without inflating to 1s', () => {
			// A key step with pause: 0.3 must emit Sleep 0.30s, not Sleep 1s.
			// Math.ceil(0.3) = 1 was the old (wrong) behaviour.
			const tape: ParsedTape = {
				...baseTape,
				tape: { ...baseTape.tape, steps: [{ action: 'key', command: 'j', pause: 0.3 }] },
			};
			expect(generateVhsTape(tape)).toContain('Sleep 0.30s');
			expect(generateVhsTape(tape)).not.toContain('Sleep 1s');
		});
	});
});
