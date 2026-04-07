import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
	mkdirSync: vi.fn(),
	readdirSync: vi.fn(),
	symlinkSync: vi.fn(),
}));

import { existsSync, readFileSync } from 'node:fs';
import {
	WorkspaceError,
	loadWorkspace,
	resolveWorkspaceSources,
	getWorkspaceConstants,
	getRequiredSourceNames,
	validateWorkspaceReferences,
} from './index';
import type { WorkspaceConfig, ResolvedWorkspace } from './schema';
import type { ParsedTape } from '../types';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

const PROJECT_ROOT = '/projects/playback';

const VALID_WORKSPACE_YAML = `
sources:
  my-skills:
    path: ../my-skills
    required:
      - agents
      - components
mounts:
  - source: my-skills/agents
    sandbox: my-skills/agents
  - source: my-skills/components
    sandbox: my-skills/components
constants:
  SKILLS_ROOT: my-skills
  SKILLS_AGENTS_DIR: my-skills/agents
`.trim();

/**
 * Creates a minimal ParsedTape with `type` steps from the given commands.
 * @param commands - Shell commands for each `type` step.
 * @returns A ParsedTape fixture.
 */
function makeParsedTape(commands: string[]): ParsedTape {
	return {
		dir: '/tapes/test',
		meta: { title: 'Test', voices: ['northern_english_male'] },
		posterFile: null,
		tape: {
			output: 'test',
			title: 'Test',
			steps: commands.map((command) => ({
				action: 'type' as const,
				command,
				pause: 1,
			})),
		},
	};
}

/**
 * Creates a minimal WorkspaceConfig with one source, two mounts, and two constants.
 * @returns A WorkspaceConfig fixture.
 */
function makeConfig(): WorkspaceConfig {
	return {
		sources: {
			'my-skills': {
				path: '../my-skills',
				required: ['agents', 'components'],
			},
		},
		mounts: [
			{ source: 'my-skills/agents', sandbox: 'my-skills/agents' },
			{ source: 'my-skills/components', sandbox: 'my-skills/components' },
		],
		constants: {
			SKILLS_ROOT: 'my-skills',
			SKILLS_AGENTS_DIR: 'my-skills/agents',
		},
	};
}

beforeEach(() => {
	vi.resetAllMocks();
});

// ── loadWorkspace ─────────────────────────────────────────────────────────────

describe('loadWorkspace', () => {
	it('returns empty config when workspace.yaml is absent', () => {
		mockExistsSync.mockReturnValue(false);

		const config = loadWorkspace(PROJECT_ROOT);

		expect(config.sources).toEqual({});
		expect(config.mounts).toEqual([]);
		expect(config.constants).toEqual({});
	});

	it('parses a valid workspace.yaml', () => {
		mockExistsSync.mockReturnValue(true);
		mockReadFileSync.mockReturnValue(VALID_WORKSPACE_YAML);

		const config = loadWorkspace(PROJECT_ROOT);

		expect(config.sources['my-skills']).toBeDefined();
		expect(config.sources['my-skills'].path).toBe('../my-skills');
		expect(config.sources['my-skills'].required).toEqual(['agents', 'components']);
		expect(config.mounts).toHaveLength(2);
		expect(config.constants.SKILLS_ROOT).toBe('my-skills');
	});

	it('throws WorkspaceError for invalid YAML', () => {
		mockExistsSync.mockReturnValue(true);
		mockReadFileSync.mockReturnValue(': : invalid');

		expect(() => loadWorkspace(PROJECT_ROOT)).toThrow(WorkspaceError);
	});

	it('throws WorkspaceError for invalid schema', () => {
		mockExistsSync.mockReturnValue(true);
		mockReadFileSync.mockReturnValue('sources: "not-an-object"');

		expect(() => loadWorkspace(PROJECT_ROOT)).toThrow(WorkspaceError);
	});
});

// ── getWorkspaceConstants ─────────────────────────────────────────────────────

describe('getWorkspaceConstants', () => {
	it('returns a copy of the constants', () => {
		const config = makeConfig();
		const constants = getWorkspaceConstants(config);

		expect(constants).toEqual({
			SKILLS_ROOT: 'my-skills',
			SKILLS_AGENTS_DIR: 'my-skills/agents',
		});

		constants.EXTRA = 'should not mutate config';
		expect(config.constants).not.toHaveProperty('EXTRA');
	});

	it('returns empty object when no constants defined', () => {
		const config = makeConfig();
		config.constants = {};

		expect(getWorkspaceConstants(config)).toEqual({});
	});
});

// ── getRequiredSourceNames ────────────────────────────────────────────────────

describe('getRequiredSourceNames', () => {
	it('returns empty set when tape has no type steps', () => {
		const parsed: ParsedTape = {
			dir: '/tapes/test',
			meta: { title: 'Test', voices: ['northern_english_male'] },
			posterFile: null,
			tape: {
				output: 'test',
				title: 'Test',
				steps: [
					{ action: 'run', pause: 0.5 },
					{ action: 'key', command: 'j', pause: 0.3 },
				],
			},
		};

		const needed = getRequiredSourceNames(parsed, makeConfig());
		expect(needed.size).toBe(0);
	});

	it('returns empty set when tape commands do not reference any mounts', () => {
		const parsed = makeParsedTape(['ls -la', 'mkdir src', 'echo hello']);
		const needed = getRequiredSourceNames(parsed, makeConfig());
		expect(needed.size).toBe(0);
	});

	it('identifies sources referenced by tape commands', () => {
		const parsed = makeParsedTape([
			'cat my-skills/agents/README.md',
			'ls src',
		]);

		const needed = getRequiredSourceNames(parsed, makeConfig());
		expect(needed).toEqual(new Set(['my-skills']));
	});

	it('does not duplicate source names for multiple mount references', () => {
		const parsed = makeParsedTape([
			'cat my-skills/agents/README.md',
			'cat my-skills/components/button/SKILLS.md',
		]);

		const needed = getRequiredSourceNames(parsed, makeConfig());
		expect(needed.size).toBe(1);
		expect(needed.has('my-skills')).toBe(true);
	});
});

// ── resolveWorkspaceSources ───────────────────────────────────────────────────

describe('resolveWorkspaceSources', () => {
	it('resolves all sources when no filter is given', () => {
		mockExistsSync.mockReturnValue(true);

		const config = makeConfig();
		const workspace = resolveWorkspaceSources(config, PROJECT_ROOT);

		expect(workspace.sources).toHaveLength(1);
		expect(workspace.sources[0].name).toBe('my-skills');
		expect(workspace.mounts).toHaveLength(2);
	});

	it('skips sources not in the required set', () => {
		mockExistsSync.mockReturnValue(true);

		const config = makeConfig();
		const workspace = resolveWorkspaceSources(config, PROJECT_ROOT, new Set());

		expect(workspace.sources).toHaveLength(0);
		expect(workspace.mounts).toHaveLength(0);
	});

	it('only resolves sources in the required set', () => {
		mockExistsSync.mockReturnValue(true);

		const config: WorkspaceConfig = {
			sources: {
				'repo-a': { path: '../repo-a', required: [] },
				'repo-b': { path: '../repo-b', required: [] },
			},
			mounts: [
				{ source: 'repo-a/docs', sandbox: 'repo-a/docs' },
				{ source: 'repo-b/docs', sandbox: 'repo-b/docs' },
			],
			constants: {},
		};

		const workspace = resolveWorkspaceSources(config, PROJECT_ROOT, new Set(['repo-a']));

		expect(workspace.sources).toHaveLength(1);
		expect(workspace.sources[0].name).toBe('repo-a');
		expect(workspace.mounts).toHaveLength(1);
		expect(workspace.mounts[0].sandbox).toBe('repo-a/docs');
	});

	it('throws when a required source directory is missing', () => {
		mockExistsSync.mockImplementation((p) => {
			if (String(p).endsWith('my-skills')) return true;
			return false; // required subdirectories missing
		});

		expect(() => resolveWorkspaceSources(makeConfig(), PROJECT_ROOT)).toThrow(
			/missing required directory: agents/
		);
	});

	it('throws when the source root does not exist', () => {
		mockExistsSync.mockReturnValue(false);

		expect(() => resolveWorkspaceSources(makeConfig(), PROJECT_ROOT)).toThrow(
			/not found/
		);
	});

	it('does not throw for missing sources when they are filtered out', () => {
		mockExistsSync.mockReturnValue(false);

		const config = makeConfig();
		const workspace = resolveWorkspaceSources(config, PROJECT_ROOT, new Set());

		expect(workspace.sources).toHaveLength(0);
	});
});

// ── validateWorkspaceReferences ───────────────────────────────────────────────

describe('validateWorkspaceReferences', () => {
	it('passes when tape has no workspace path references', () => {
		const parsed = makeParsedTape(['ls', 'echo hello']);
		const workspace: ResolvedWorkspace = {
			sources: [],
			mounts: [],
			constants: {},
		};

		expect(() => validateWorkspaceReferences(parsed, workspace)).not.toThrow();
	});

	it('passes when referenced paths exist', () => {
		mockExistsSync.mockReturnValue(true);

		const parsed = makeParsedTape(['cat my-skills/agents/README.md']);
		const workspace: ResolvedWorkspace = {
			sources: [{ name: 'my-skills', absolutePath: '/ext/my-skills', required: [] }],
			mounts: [{ source: 'my-skills/agents', sandbox: 'my-skills/agents' }],
			constants: {},
		};

		expect(() => validateWorkspaceReferences(parsed, workspace)).not.toThrow();
	});

	it('throws when a referenced workspace path does not exist', () => {
		mockExistsSync.mockReturnValue(false);

		const parsed = makeParsedTape(['cat my-skills/agents/MISSING.md']);
		const workspace: ResolvedWorkspace = {
			sources: [{ name: 'my-skills', absolutePath: '/ext/my-skills', required: [] }],
			mounts: [{ source: 'my-skills/agents', sandbox: 'my-skills/agents' }],
			constants: {},
		};

		expect(() => validateWorkspaceReferences(parsed, workspace)).toThrow(
			/Missing workspace path/
		);
	});
});
