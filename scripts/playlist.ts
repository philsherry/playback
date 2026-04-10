#!/usr/bin/env tsx
/**
 * playlist.mjs — Run the full playback pipeline for every episode in order.
 *
 * Discovers all tape directories under tapes/ that contain a tape.yaml,
 * sorted by their path (which follows the s<n>-<slug>/<nn>-<slug>/ naming
 * convention), and runs `playback tape <dir>` for each one sequentially.
 * Stops at the first failure so missing prerequisites do not produce a long
 * stream of duplicate errors.
 *
 * Any extra flags passed after `--` are forwarded to every episode:
 *   npm run playlist:build -- --vhs-only
 *
 * Usage:
 *   npm run playlist:build
 *   npm run playlist:build -- --vhs-only
 *   npm run playlist:build -- --tapes-dir /path/to/tapes
 *   npm run playlist:build -- --tapes-dir /path/to/tapes --web
 */

import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config';

const __filename = fileURLToPath(import.meta.url);
const root = resolve(__filename, '..', '..');
const config = await loadConfig();
const cliPath = join(root, 'src', 'cli.ts');

// Parse --tapes-dir <path> from argv, then forward the rest to each tape invocation.
const rawArgs = process.argv.slice(2);
const tapesDirIdx = rawArgs.indexOf('--tapes-dir');
let tapesDir: string;
let forwardedFlags: string[];

if (tapesDirIdx !== -1) {
	const tapesDirArg = rawArgs[tapesDirIdx + 1];
	if (!tapesDirArg || tapesDirArg.startsWith('--')) {
		console.error('Error: --tapes-dir requires a path argument.');
		process.exit(1);
	}
	tapesDir = resolve(tapesDirArg);
	forwardedFlags = rawArgs.filter((_, i) => i !== tapesDirIdx && i !== tapesDirIdx + 1);
} else {
	tapesDir = resolve(root, config.tapesDir);
	forwardedFlags = rawArgs;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Recursively discovers episode directories (those containing a tape.yaml),
 * returning absolute paths sorted lexicographically (s1→s6, 01→03, etc.).
 * @param dir - Absolute path of the directory to search within.
 * @returns Sorted list of absolute paths to directories containing a tape.yaml.
 */
function findTapeDirs(dir: string): string[] {
	const entries = readdirSync(dir).sort();
	const results: string[] = [];

	for (const entry of entries) {
		const full = join(dir, entry);
		if (!statSync(full).isDirectory()) continue;

		if (existsSync(join(full, 'tape.yaml'))) {
			results.push(full);
		} else {
			// Recurse one level deeper (series → episode)
			results.push(...findTapeDirs(full));
		}
	}

	return results;
}

// ── Validate prerequisites ────────────────────────────────────────────────────

if (!existsSync(cliPath)) {
	console.error('Error: src/cli.ts not found.');
	process.exit(1);
}

// ── Discover episodes ─────────────────────────────────────────────────────────

const tapeDirs = findTapeDirs(tapesDir);

if (tapeDirs.length === 0) {
	console.error(`No tape.yaml files found under ${tapesDir}`);
	process.exit(1);
}

const flagSuffix =
	forwardedFlags.length > 0 ? ` (${forwardedFlags.join(' ')})` : '';
console.log(`Building ${tapeDirs.length} episodes${flagSuffix}\n`);

// ── Run each episode ──────────────────────────────────────────────────────────

let failed = false;
let failedDir: string | null = null;
let attempted = 0;

for (let i = 0; i < tapeDirs.length; i++) {
	const dir = tapeDirs[i];
	const rel = relative(root, dir);
	const prefix = `[${i + 1}/${tapeDirs.length}]`;
	attempted = i + 1;

	console.log(`${prefix} ${rel}`);

	const result = spawnSync(
		'tsx',
		[cliPath, 'tape', dir, ...forwardedFlags],
		{ cwd: root, stdio: 'inherit' },
	);

	// If the child was killed by a signal (e.g. ctrl+c), stop the entire
	// playlist — don't start the next episode.
	if (result.signal) {
		console.error(`\n✗ Interrupted (${result.signal}). Stopping playlist.`);
		process.exit(1);
	}

	if (result.status !== 0) {
		console.error(`  ✗ Failed (exit ${result.status ?? 'unknown'})\n`);
		console.error('Stopping playlist at the first failure.');
		failed = true;
		failedDir = rel;
		break;
	}
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(50));

if (!failed) {
	console.log(`✓ All ${tapeDirs.length} episodes built successfully.`);
} else {
	console.log(
		`✗ Playlist stopped after failure in ${failedDir ?? 'an episode'} (${attempted}/${tapeDirs.length} attempted).`
	);
	process.exit(1);
}
