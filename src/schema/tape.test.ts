import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import { TapeSchema, StepSchema } from './tape';

describe('StepSchema', () => {
	describe('type step', () => {
		it('accepts a minimal type step', () => {
			const result = v.safeParse(StepSchema, {
				action: 'type',
				command: 'ls -la',
			});
			expect(result.success).toBe(true);
		});

		it('accepts optional narration and pause', () => {
			const result = v.safeParse(StepSchema, {
				action: 'type',
				command: 'npm install',
				narration: 'Installing dependencies.',
				pause: 3,
			});
			expect(result.success).toBe(true);
		});

		it('rejects a type step missing command', () => {
			const result = v.safeParse(StepSchema, { action: 'type' });
			expect(result.success).toBe(false);
		});

		it('rejects a negative pause', () => {
			const result = v.safeParse(StepSchema, {
				action: 'type',
				command: 'ls',
				pause: -1,
			});
			expect(result.success).toBe(false);
		});
	});

	describe('run step', () => {
		it('accepts a minimal run step', () => {
			const result = v.safeParse(StepSchema, { action: 'run' });
			expect(result.success).toBe(true);
		});

		it('accepts optional narration and pause', () => {
			const result = v.safeParse(StepSchema, {
				action: 'run',
				narration: 'The command is running.',
				pause: 5,
			});
			expect(result.success).toBe(true);
		});
	});

	describe('comment step', () => {
		it('accepts a minimal comment step', () => {
			const result = v.safeParse(StepSchema, { action: 'comment' });
			expect(result.success).toBe(true);
		});

		it('accepts a zero pause', () => {
			const result = v.safeParse(StepSchema, { action: 'comment', pause: 0 });
			expect(result.success).toBe(true);
		});
	});

	it('rejects an unknown action', () => {
		const result = v.safeParse(StepSchema, { action: 'unknown' });
		expect(result.success).toBe(false);
	});
});

describe('TapeSchema', () => {
	describe('valid inputs', () => {
		it('accepts a minimal tape', () => {
			const result = v.safeParse(TapeSchema, {
				output: 's1/01-install',
				title: 'Install and Explore',
				steps: [{ action: 'run' }],
			});
			expect(result.success).toBe(true);
		});

		it('accepts a tape with multiple step types', () => {
			const result = v.safeParse(TapeSchema, {
				output: 's1/01-install',
				title: 'Install and Explore',
				steps: [
					{ action: 'type', command: 'npm install' },
					{ action: 'run', narration: 'Installing.', pause: 5 },
					{ action: 'comment', narration: 'Done.' },
				],
			});
			expect(result.success).toBe(true);
		});
	});

	describe('invalid inputs', () => {
		it('rejects a tape missing output', () => {
			const result = v.safeParse(TapeSchema, {
				title: 'Test',
				steps: [{ action: 'run' }],
			});
			expect(result.success).toBe(false);
		});

		it('rejects a tape missing title', () => {
			const result = v.safeParse(TapeSchema, {
				output: 's1/01-install',
				steps: [{ action: 'run' }],
			});
			expect(result.success).toBe(false);
		});

		it('rejects an empty steps array', () => {
			const result = v.safeParse(TapeSchema, {
				output: 's1/01-install',
				title: 'Test',
				steps: [],
			});
			expect(result.success).toBe(false);
		});

		it('rejects a tape missing steps', () => {
			const result = v.safeParse(TapeSchema, {
				output: 's1/01-install',
				title: 'Test',
			});
			expect(result.success).toBe(false);
		});
	});
});
