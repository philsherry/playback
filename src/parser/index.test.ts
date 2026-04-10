import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
}));

import { existsSync, readFileSync } from 'node:fs';
import { parseTape, ParseError } from './index';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

const TAPE_DIR = '/tapes/s1/01-test';

const VALID_TAPE_YAML = `
output: s1/01-test
title: Test Tape
steps:
  - action: run
`.trim();

const VALID_META_YAML = `
title: Test Episode
`.trim();

/**
 * Configures mocked filesystem responses for parser tests.
 * @param root0 - Optional filesystem state overrides.
 * @param root0.dirExists - Whether the tape directory exists.
 * @param root0.tapeExists - Whether `tape.yaml` exists.
 * @param root0.metaExists - Whether `meta.yaml` exists.
 * @param root0.posterExists - Whether `poster.png` exists.
 * @param root0.tapeContent - Mock file contents for `tape.yaml`.
 * @param root0.metaContent - Mock file contents for `meta.yaml`.
 */
function setupFs({
	dirExists = true,
	metaContent = VALID_META_YAML,
	metaExists = true,
	posterExists = false,
	tapeContent = VALID_TAPE_YAML,
	tapeExists = true,
}: {
	dirExists?: boolean;
	metaContent?: string;
	metaExists?: boolean;
	posterExists?: boolean;
	tapeContent?: string;
	tapeExists?: boolean;
} = {}) {
	mockExistsSync.mockImplementation((p) => {
		const path = String(p);
		if (path === TAPE_DIR) return dirExists;
		if (path.endsWith('/tape.yaml')) return tapeExists;
		if (path.endsWith('/meta.yaml')) return metaExists;
		if (path.endsWith('/poster.png')) return posterExists;
		return false;
	});

	mockReadFileSync.mockImplementation((p) => {
		const path = String(p);
		if (path.endsWith('/tape.yaml')) return tapeContent;
		if (path.endsWith('/meta.yaml')) return metaContent;
		throw new Error(`Unexpected readFileSync call: ${path}`);
	});
}

describe('parseTape', () => {
	beforeEach(() => {
		mockExistsSync.mockReset();
		mockReadFileSync.mockReset();
	});

	describe('happy path', () => {
		it('returns a ParsedTape with the correct dir', () => {
			setupFs();
			const result = parseTape(TAPE_DIR);
			expect(result.dir).toBe(TAPE_DIR);
		});

		it('returns parsed tape steps', () => {
			setupFs();
			const result = parseTape(TAPE_DIR);
			expect(result.tape.steps).toHaveLength(1);
			expect(result.tape.steps[0].action).toBe('run');
		});

		it('returns parsed meta title', () => {
			setupFs();
			const result = parseTape(TAPE_DIR);
			expect(result.meta.title).toBe('Test Episode');
		});

		it('sets posterFile to null when poster.png is absent', () => {
			setupFs({ posterExists: false });
			const result = parseTape(TAPE_DIR);
			expect(result.posterFile).toBeNull();
		});

		it('sets posterFile when poster.png is present', () => {
			setupFs({ posterExists: true });
			const result = parseTape(TAPE_DIR);
			expect(result.posterFile).toBe(`${TAPE_DIR}/poster.png`);
		});

		it('replaces known tape constants in type commands', () => {
			setupFs({
				tapeContent: [
					'output: s1/01-test',
					'title: Test Tape',
					'steps:',
					'  - action: type',
					'    command: ls {{GDS_SKILLS_COMPONENTS_DIR}}',
				].join('\n'),
			});

			const result = parseTape(TAPE_DIR, {
				GDS_SKILLS_COMPONENTS_DIR: 'govuk-design-system-skills/components',
			});

			expect(result.tape.steps[0]).toEqual({
				action: 'type',
				command: 'ls govuk-design-system-skills/components',
			});
		});

		it('replaces known tape constants in narrate commands', () => {
			setupFs({
				tapeContent: [
					'output: s1/01-test',
					'title: Test Tape',
					'steps:',
					'  - action: narrate',
					'    narration: Some context for the viewer.',
					'    commands:',
					'      - ls {{GDS_SKILLS_COMPONENTS_DIR}}',
					'      - cat {{GDS_SKILLS_PATTERNS_DIR}}/README.md',
				].join('\n'),
			});

			const result = parseTape(TAPE_DIR, {
				GDS_SKILLS_COMPONENTS_DIR: 'govuk-design-system-skills/components',
				GDS_SKILLS_PATTERNS_DIR: 'govuk-design-system-skills/patterns',
			});

			const step = result.tape.steps[0];
			expect(step.action).toBe('narrate');
			if (step.action === 'narrate') {
				expect(step.commands).toEqual([
					'ls govuk-design-system-skills/components',
					'cat govuk-design-system-skills/patterns/README.md',
				]);
			}
		});
	});

	describe('path normalisation', () => {
		it('strips a trailing /tape.yaml from the input path', () => {
			setupFs();
			const result = parseTape(`${TAPE_DIR}/tape.yaml`);
			expect(result.dir).toBe(TAPE_DIR);
		});

		it('strips a trailing /tape.yml from the input path', () => {
			setupFs();
			const result = parseTape(`${TAPE_DIR}/tape.yml`);
			expect(result.dir).toBe(TAPE_DIR);
		});
	});

	describe('error handling', () => {
		it('throws ParseError when the directory does not exist', () => {
			setupFs({ dirExists: false });
			expect(() => parseTape(TAPE_DIR)).toThrow(ParseError);
		});

		it('throws ParseError when tape.yaml is missing', () => {
			setupFs({ tapeExists: false });
			expect(() => parseTape(TAPE_DIR)).toThrow(ParseError);
		});

		it('throws ParseError when meta.yaml is missing', () => {
			setupFs({ metaExists: false });
			expect(() => parseTape(TAPE_DIR)).toThrow(ParseError);
		});

		it('throws ParseError when tape.yaml fails schema validation', () => {
			// Missing required `output` field
			setupFs({ tapeContent: 'title: Test\nsteps:\n  - action: run\n' });
			expect(() => parseTape(TAPE_DIR)).toThrow(ParseError);
		});

		it('includes valibot issues on a schema validation failure', () => {
			setupFs({ tapeContent: 'title: Test\nsteps:\n  - action: run\n' });
			try {
				parseTape(TAPE_DIR);
				expect.fail('should have thrown');
			} catch (err) {
				expect(err).toBeInstanceOf(ParseError);
				expect((err as ParseError).issues).toBeDefined();
				expect((err as ParseError).issues?.length).toBeGreaterThan(0);
			}
		});

		it('throws ParseError when meta.yaml fails schema validation', () => {
			// Missing required `title` field
			setupFs({ metaContent: 'voices:\n  - northern_english_male\n' });
			expect(() => parseTape(TAPE_DIR)).toThrow(ParseError);
		});

		it('throws ParseError when tape.yaml contains unparseable YAML', () => {
			// Make readFileSync throw to simulate an IO or parse error
			setupFs();
			mockReadFileSync.mockImplementation((p) => {
				if (String(p).endsWith('/tape.yaml')) throw new Error('EACCES');
				return VALID_META_YAML;
			});
			expect(() => parseTape(TAPE_DIR)).toThrow(ParseError);
		});

		it('includes the file path on a ParseError', () => {
			setupFs({ tapeExists: false });
			try {
				parseTape(TAPE_DIR);
				expect.fail('should have thrown');
			} catch (err) {
				expect(err).toBeInstanceOf(ParseError);
				expect((err as ParseError).file).toContain('tape.yaml');
			}
		});

		it('throws ParseError for an unknown tape constant', () => {
			setupFs({
				tapeContent: [
					'output: s1/01-test',
					'title: Test Tape',
					'steps:',
					'  - action: type',
					'    command: ls {{MISSING_CONSTANT}}',
				].join('\n'),
			});

			expect(() => parseTape(TAPE_DIR, {})).toThrow(ParseError);
		});
	});
});
