import { describe, it, expect } from 'vitest';
import { generateScaffold } from './scaffold';
import type { ParsedTape } from '../types';

/**
 * Creates a minimal ParsedTape for scaffold tests.
 * @param overrides - Partial overrides for meta and tape fields.
 * @param overrides.title - Episode title.
 * @param overrides.version - Semver version string.
 * @param overrides.description - Episode description.
 * @param overrides.voices - Voice identifiers.
 * @param overrides.steps - Tape steps.
 * @returns Minimal parsed tape fixture.
 */
function makeParsed(overrides: {
	description?: string;
	steps?: ParsedTape['tape']['steps'];
	title?: string;
	version?: string;
	voices?: string[];
}): ParsedTape {
	return {
		dir: '/test',
		meta: {
			description: overrides.description,
			title: overrides.title ?? 'Test Video',
			version: overrides.version,
			voices: overrides.voices ?? ['northern_english_male'],
		},
		posterFile: null,
		tape: {
			output: 'test',
			steps: overrides.steps ?? [{ action: 'run', pause: 1 }],
			title: overrides.title ?? 'Test Video',
		},
	};
}

describe('generateScaffold', () => {
	it('produces valid frontmatter with title, version, and duration', () => {
		const parsed = makeParsed({ title: 'My Demo', version: '2.1.0' });
		const content = generateScaffold(parsed, 90);

		expect(content).toContain('title: My Demo');
		expect(content).toContain('version: "2.1.0"');
		expect(content).toContain('duration: ~2 minutes');
	});

	it('falls back to version 1.0.0 when not set in meta', () => {
		const parsed = makeParsed({ title: 'No Version' });
		const content = generateScaffold(parsed, 30);

		expect(content).toContain('version: "1.0.0"');
	});

	it('narration from steps appears in the "What you will see" list', () => {
		const parsed = makeParsed({
			steps: [
				{ action: 'run', narration: 'First, install the package from npm.', pause: 2 },
				{ action: 'comment', narration: 'The output shows the installed files.', pause: 1 },
			],
		});
		const content = generateScaffold(parsed, 60);

		expect(content).toContain('1. First, install the package from npm');
		expect(content).toContain('2. The output shows the installed files');
	});

	it('steps without narration are skipped', () => {
		const parsed = makeParsed({
			steps: [
				{ action: 'run', pause: 1 },
				{ action: 'type', command: 'ls', pause: 1 },
				{ action: 'comment', narration: 'Only this one has narration.', pause: 1 },
			],
		});
		const content = generateScaffold(parsed, 30);

		// Only one narration item should appear
		expect(content).toContain('1. Only this one has narration');
		expect(content).not.toContain('2.');
	});

	it('duration is formatted correctly for singular (1 minute)', () => {
		const parsed = makeParsed({});
		const content = generateScaffold(parsed, 45);

		expect(content).toContain('duration: ~1 minute');
		expect(content).not.toContain('minutes');
	});

	it('duration is formatted correctly for plural (>1 minutes)', () => {
		const parsed = makeParsed({});
		const content = generateScaffold(parsed, 120);

		expect(content).toContain('duration: ~2 minutes');
	});

	it('duration rounds up to the next minute', () => {
		const parsed = makeParsed({});
		const content = generateScaffold(parsed, 61);

		expect(content).toContain('duration: ~2 minutes');
	});

	it('meta description appears in "What this video shows"', () => {
		const parsed = makeParsed({
			description: 'This video explains how to set up the project.',
		});
		const content = generateScaffold(parsed, 60);

		expect(content).toContain('This video explains how to set up the project.');
	});

	it('falls back to TODO placeholder when description is absent', () => {
		const parsed = makeParsed({});
		const content = generateScaffold(parsed, 60);

		expect(content).toContain('<!-- Add a description of what this video shows -->');
	});

	it('truncates narration to 80 characters', () => {
		const longNarration = 'A'.repeat(90) + ' extra words here.';
		const parsed = makeParsed({
			steps: [{ action: 'comment', narration: longNarration, pause: 1 }],
		});
		const content = generateScaffold(parsed, 30);

		// The first sentence is 90 A's, truncated to 79 chars + ellipsis
		const match = content.match(/1\. (.+)/);
		expect(match).not.toBeNull();
		expect(match![1].length).toBeLessThanOrEqual(80);
	});

	it('limits "What you will see" to 8 items', () => {
		const steps: ParsedTape['tape']['steps'] = Array.from({ length: 12 }, (_, i) => ({
			action: 'comment' as const,
			narration: `Step ${i + 1} narration.`,
			pause: 1,
		}));
		const parsed = makeParsed({ steps });
		const content = generateScaffold(parsed, 60);

		// Only items 1–8 should appear
		expect(content).toContain('8.');
		expect(content).not.toContain('9.');
	});

	it('produces the four required section headers', () => {
		const parsed = makeParsed({});
		const content = generateScaffold(parsed, 60);

		expect(content).toContain('## What this video shows');
		expect(content).toContain('## What you will see');
		expect(content).toContain('## What you will need');
		expect(content).toContain('## What comes next');
	});
});
