/**
 * @module workspace
 *
 * Loads and resolves `workspace.yaml` — a project-level config that defines
 * which external content is mounted into each VHS recording session.
 *
 * The workspace system replaces the earlier hardcoded GOV.UK skills setup
 * with a generic mechanism: define your sources, mounts, and placeholder
 * constants in one YAML file and any tape can use them.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import * as v from 'valibot';
import { WorkspaceSchema } from './schema';
import type { WorkspaceConfig, ResolvedWorkspace, ResolvedSource } from './schema';
import type { ParsedTape } from '../types';

export type { WorkspaceConfig, ResolvedWorkspace, ResolvedSource } from './schema';

/** Named placeholders available inside `tape.yaml` commands as `{{KEY}}`. */
export type TapeConstants = Record<string, string>;

/**
 * Thrown when the workspace config is invalid or a referenced path is missing.
 */
export class WorkspaceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'WorkspaceError';
	}
}

/**
 * Reads and validates `workspace.yaml` from the project root.
 * Returns an empty config when the file is absent — tapes with no
 * placeholders work fine without a workspace config.
 * @param projectRoot - Absolute path to the project root directory.
 * @returns Validated workspace configuration.
 */
export function loadWorkspace(projectRoot: string): WorkspaceConfig {
	const configPath = join(projectRoot, 'workspace.yaml');

	if (!existsSync(configPath)) {
		return { sources: {}, mounts: [], constants: {} };
	}

	let raw: unknown;
	try {
		raw = parseYaml(readFileSync(configPath, 'utf8'));
	} catch {
		throw new WorkspaceError(`Failed to parse workspace.yaml: ${configPath}`);
	}

	const result = v.safeParse(WorkspaceSchema, raw);
	if (!result.success) {
		const lines = result.issues.map((issue) => {
			const path = v.getDotPath(issue) ?? '(root)';
			return `  ${path}: ${issue.message}`;
		});
		throw new WorkspaceError(`Invalid workspace.yaml:\n${lines.join('\n')}`);
	}

	return result.output;
}

/**
 * Returns the set of source names that a parsed tape actually references.
 *
 * Inspects `type` step commands against the workspace mount sandbox paths.
 * Only sources that back a referenced mount need to be present on disk.
 * @param parsed - Parsed tape whose commands will be inspected.
 * @param config - Parsed workspace config.
 * @returns Set of source names the tape needs.
 */
export function getRequiredSourceNames(parsed: ParsedTape, config: WorkspaceConfig): Set<string> {
	const needed = new Set<string>();

	for (const step of parsed.tape.steps) {
		if (step.action !== 'type') {
			continue;
		}

		for (const mount of config.mounts) {
			if (step.command.includes(mount.sandbox)) {
				const sourceName = mount.source.split('/')[0];
				needed.add(sourceName);
			}
		}
	}

	return needed;
}

/**
 * Resolves source paths to absolute and validates that required directories
 * exist within each source.
 *
 * When `requiredSources` is provided, only sources in that set are resolved
 * and validated. Sources the tape does not reference are skipped so that
 * builds succeed even when unrelated external repos are absent.
 * @param config - Parsed workspace config from {@link loadWorkspace}.
 * @param projectRoot - Absolute path to the project root directory.
 * @param requiredSources - Optional set of source names to validate. When omitted, all sources are validated.
 * @returns Workspace with all paths resolved and validated.
 */
export function resolveWorkspaceSources(
	config: WorkspaceConfig,
	projectRoot: string,
	requiredSources?: Set<string>
): ResolvedWorkspace {
	const sources: ResolvedSource[] = [];

	for (const [name, source] of Object.entries(config.sources)) {
		if (requiredSources && !requiredSources.has(name)) {
			continue;
		}

		const absolutePath = resolve(projectRoot, source.path);

		if (!existsSync(absolutePath)) {
			throw new WorkspaceError(
				`Workspace source "${name}" not found: ${absolutePath}\nSet the correct path in workspace.yaml.`
			);
		}

		for (const req of source.required) {
			if (!existsSync(join(absolutePath, req))) {
				throw new WorkspaceError(
					`Workspace source "${name}" is missing required directory: ${req}\nExpected at: ${join(absolutePath, req)}`
				);
			}
		}

		sources.push({ name, absolutePath, required: source.required });
	}

	const resolvedNames = new Set(sources.map((s) => s.name));
	const mounts = config.mounts.filter((mount) => {
		const sourceName = mount.source.split('/')[0];
		return resolvedNames.has(sourceName);
	});

	return {
		sources,
		mounts,
		constants: config.constants,
	};
}

/**
 * Returns the named placeholders available inside `tape.yaml` commands.
 * @param config - Parsed workspace config.
 * @returns Mapping from placeholder name to sandbox-relative path.
 */
export function getWorkspaceConstants(config: WorkspaceConfig): TapeConstants {
	return { ...config.constants };
}

/**
 * Mounts workspace sources into the VHS scratch directory via symlinks.
 *
 * Each mount entry creates a symlink from a source directory into the
 * sandbox. The sandbox path is relative to `workDir`, so tape commands
 * see stable paths regardless of where the real source lives on disk.
 * @param workDir - VHS scratch working directory.
 * @param workspace - Resolved workspace config with absolute source paths.
 */
export function prepareWorkspaceSandbox(workDir: string, workspace: ResolvedWorkspace): void {
	for (const mount of workspace.mounts) {
		const sourcePath = resolveSourceMount(workspace.sources, mount.source);
		if (sourcePath == null) {
			throw new WorkspaceError(
				`Workspace mount references unknown source: ${mount.source}`
			);
		}

		const sandboxPath = join(workDir, mount.sandbox);
		const sandboxParent = dirname(sandboxPath);
		mkdirSync(sandboxParent, { recursive: true });

		if (!existsSync(sandboxPath)) {
			symlinkSync(sourcePath, sandboxPath, 'dir');
		}
	}
}

/**
 * Validates that sandbox paths referenced in tape commands map to real
 * source files. Runs before recording starts so builds fail fast.
 * @param parsed - Parsed tape whose `type` commands will be inspected.
 * @param workspace - Resolved workspace config.
 */
export function validateWorkspaceReferences(parsed: ParsedTape, workspace: ResolvedWorkspace): void {
	if (workspace.mounts.length === 0) {
		return;
	}

	for (const [index, step] of parsed.tape.steps.entries()) {
		if (step.action !== 'type') {
			continue;
		}

		for (const token of extractPathTokens(step.command)) {
			const sourcePath = mapSandboxPathToSource(workspace, token);
			if (sourcePath == null) {
				continue;
			}

			if (!sourcePathExists(sourcePath)) {
				throw new WorkspaceError(
					`Missing workspace path in tape step ${index + 1}: ${token}`
				);
			}
		}
	}
}

/**
 * Resolves a mount source string to an absolute path.
 *
 * Mount sources are formatted as `<source-name>/<relative-path>`. The
 * source name is matched against resolved sources and the relative path
 * is appended to the source's absolute path.
 * @param sources - Resolved workspace sources.
 * @param mountSource - Mount source string in `<name>/<path>` format.
 * @returns Absolute path to the source directory, or `null` if unmatched.
 */
function resolveSourceMount(sources: ResolvedSource[], mountSource: string): string | null {
	for (const source of sources) {
		if (mountSource === source.name) {
			return source.absolutePath;
		}
		if (mountSource.startsWith(`${source.name}/`)) {
			return join(source.absolutePath, mountSource.slice(source.name.length + 1));
		}
	}
	return null;
}

/**
 * Maps a sandbox path from a tape command back to its real source path.
 *
 * Checks each mount: if the token matches or is a child of a mount's
 * sandbox path, the corresponding source path is resolved.
 * @param workspace - Resolved workspace config.
 * @param sandboxPath - Path token extracted from a tape command.
 * @returns Absolute source path, or `null` if the path does not match any mount.
 */
function mapSandboxPathToSource(workspace: ResolvedWorkspace, sandboxPath: string): string | null {
	const normalised = sandboxPath.replace(/\/+$/, '');

	for (const mount of workspace.mounts) {
		if (normalised === mount.sandbox) {
			const resolved = resolveSourceMount(workspace.sources, mount.source);
			return resolved;
		}

		if (normalised.startsWith(`${mount.sandbox}/`)) {
			const resolved = resolveSourceMount(workspace.sources, mount.source);
			if (resolved != null) {
				return join(resolved, normalised.slice(mount.sandbox.length + 1));
			}
		}
	}

	return null;
}

/**
 * Extracts path-like tokens from a shell command.
 * @param command - Shell command from a `type` step.
 * @returns Tokens that may refer to file-system paths.
 */
function extractPathTokens(command: string): string[] {
	return command
		.split(/\s+/)
		.map((token) => token.replace(/^['"]|['"]$/g, ''))
		.filter((token) => token.includes('/'));
}

/**
 * Checks whether a source path or glob resolves to at least one real entry.
 * @param sourcePath - Absolute path or simple glob.
 * @returns `true` when the path exists or the glob matches at least one entry.
 */
function sourcePathExists(sourcePath: string): boolean {
	if (!sourcePath.includes('*')) {
		return existsSync(sourcePath);
	}

	const parentDir = dirname(sourcePath);
	if (!existsSync(parentDir)) {
		return false;
	}

	const pattern = wildcardToRegExp(basename(sourcePath));
	return readdirSync(parentDir).some((entry) => pattern.test(entry));
}

/**
 * Converts a simple `*` wildcard pattern into a regular expression.
 * @param pattern - File-name pattern using `*` wildcards.
 * @returns Regular expression that matches the same pattern.
 */
function wildcardToRegExp(pattern: string): RegExp {
	const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
}
