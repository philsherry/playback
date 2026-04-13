import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config';
import { logError, logInfo, logSuccess } from '../logger';

export interface PlaylistCommandOptions {
	forwardedFlags: string[];
	tapesDir?: string;
}

/**
 * Recursively finds directories containing a `tape.yaml` or `tape.pristine.yaml` file.
 * Directories with only a pristine file have it copied to `tape.yaml` before recording,
 * matching the behaviour of `build-studio.sh`.
 * @param dir - Root directory to search.
 * @returns Array of absolute paths to tape directories, sorted alphabetically.
 */
export function findTapeDirs(dir: string): string[] {
	const entries = readdirSync(dir).sort();
	const results: string[] = [];
	for (const entry of entries) {
		const full = join(dir, entry);
		if (!statSync(full).isDirectory()) continue;
		if (existsSync(join(full, 'tape.yaml')) || existsSync(join(full, 'tape.pristine.yaml'))) {
			results.push(full);
		} else {
			results.push(...findTapeDirs(full));
		}
	}
	return results;
}

/**
 * Runs the full pipeline for every tape found under the configured tapes directory.
 * @param options - Resolved playlist options including forwarded CLI flags and optional tapes directory override.
 */
export async function runPlaylist(options: PlaylistCommandOptions): Promise<void> {
	const config = await loadConfig();
	const projectRoot = process.cwd();
	const tapesDir = options.tapesDir ?? resolve(projectRoot, config.tapesDir);
	const { forwardedFlags } = options;

	// Resolve the CLI entry point.
	// When run via `tsx` (dev), import.meta.url points to the .ts source file;
	// resolve two levels up to reach src/cli.ts.
	// When compiled (dist/), resolve one level up to reach dist/cli.js.
	const moduleFile = fileURLToPath(import.meta.url);
	const isSource = moduleFile.endsWith('.ts');
	const cliPath = isSource
		? resolve(moduleFile, '..', '..', 'cli.ts')
		: resolve(moduleFile, '..', 'cli.js');
	const runner = isSource ? 'tsx' : process.execPath;

	const tapeDirs = findTapeDirs(tapesDir);

	if (tapeDirs.length === 0) {
		logError(`No tape.yaml files found under ${tapesDir}`);
		process.exit(1);
	}

	const flagSuffix = forwardedFlags.length > 0 ? ` (${forwardedFlags.join(' ')})` : '';
	logInfo(`Building ${tapeDirs.length} episodes${flagSuffix}\n`);

	let failed = false;
	let failedDir: string | null = null;
	let attempted = 0;

	for (let i = 0; i < tapeDirs.length; i++) {
		const dir = tapeDirs[i];
		const rel = relative(projectRoot, dir);
		const prefix = `[${i + 1}/${tapeDirs.length}]`;
		attempted = i + 1;

		logInfo(`${prefix} ${rel}`);

		// If the tape directory only has a pristine file, copy it to tape.yaml
		// before recording — matches the behaviour of build-studio.sh.
		const pristineFile = join(dir, 'tape.pristine.yaml');
		const tapeFile = join(dir, 'tape.yaml');
		if (existsSync(pristineFile) && !existsSync(tapeFile)) {
			copyFileSync(pristineFile, tapeFile);
		}

		const result = spawnSync(runner, [cliPath, 'tape', dir, ...forwardedFlags], {
			cwd: projectRoot,
			stdio: 'inherit',
		});

		if (result.signal) {
			logError(`\n✗ Interrupted (${result.signal}). Stopping playlist.`);
			process.exit(1);
		}

		if (result.status !== 0) {
			logError(`  ✗ Failed (exit ${result.status ?? 'unknown'})\n`);
			logError('Stopping playlist at the first failure.');
			failed = true;
			failedDir = rel;
			break;
		}
	}

	logInfo(`\n${'─'.repeat(50)}`);

	if (failed) {
		logError(
			`✗ Playlist stopped after failure in ${failedDir ?? 'an episode'} (${attempted}/${tapeDirs.length} attempted).`
		);
		process.exit(1);
	} else {
		logSuccess(`✓ All ${tapeDirs.length} episodes built successfully.`);
	}
}
