import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { generateVhsTape } from '../generator/vhs';
import { FFMPEG_FULL_BIN } from '../constants';
import type { ParsedTape, VhsResult } from '../types';
import { prepareWorkspaceSandbox } from '../workspace';
import type { ResolvedWorkspace } from '../workspace';

/**
 * Thrown when the VHS process fails or cannot be spawned.
 * @param message - Human-readable description of the failure.
 * @param code - Process exit code, or `null` when VHS could not be started at all.
 */
export class VhsError extends Error {
	constructor(
		message: string,
		public readonly code: number | null
	) {
		super(message);
		this.name = 'VhsError';
	}
}

/**
 * Runs the VHS recording pipeline for a parsed tape.
 *
 * Creates an isolated temporary working directory under `/tmp/playback/` so
 * that tape commands such as `git clone` always start from a clean state,
 * even on re-runs. The generated `.tape` file and the resulting raw `.mp4`
 * are both moved into `distDir/<tape.output>/` on completion.
 * @param parsed - Parsed tape and meta data returned by {@link parseTape}.
 * @param distDir - Absolute path to the output root directory (e.g. `<cwd>/playback`).
 * @param workspace - Resolved workspace config with source paths and mounts.
 * @returns Paths to the generated `.tape` file and the raw `.mp4` recording.
 */
export async function runVhs(
	parsed: ParsedTape,
	distDir: string,
	workspace: ResolvedWorkspace
): Promise<VhsResult> {
	const outputDir = join(distDir, parsed.tape.output);
	mkdirSync(outputDir, { recursive: true });

	// When meta.yaml specifies vhsCwd, use that directory (relative to cwd)
	// instead of the default /tmp/ scratch space. This is needed for tapes
	// that launch project commands (e.g. npm run playback:demo).
	const useProjectCwd = parsed.meta.vhsCwd != null;
	const vhsWorkDir = useProjectCwd
		? resolve(process.cwd(), parsed.meta.vhsCwd!)
		: `/tmp/playback/${parsed.tape.output}`;

	if (!useProjectCwd) {
		// Wipe the VHS working directory so commands like `git clone` always run
		// into a clean state, even on re-runs.
		rmSync(vhsWorkDir, { recursive: true, force: true });
		mkdirSync(vhsWorkDir, { recursive: true });
		if (!clonesWorkspaceSource(parsed, workspace)) {
			prepareWorkspaceSandbox(vhsWorkDir, workspace);
		}
	}

	// Write the generated .tape file
	const tapeContent = generateVhsTape(parsed);
	const slug = basename(parsed.tape.output);
	const tapeFile = join(outputDir, `${slug}.tape`);
	writeFileSync(tapeFile, tapeContent, 'utf8');

	// Run VHS from the clean working directory so tape commands (e.g. git clone)
	// run in an isolated scratch space rather than the project root.
	await spawnVhs(tapeFile, vhsWorkDir);

	// VHS writes the raw mp4 relative to its cwd — move it to the output dir.
	const rawMp4 = join(outputDir, `${slug}.raw.mp4`);
	renameSync(join(vhsWorkDir, `${slug}.raw.mp4`), rawMp4);

	return { rawMp4, tapeFile };
}

/**
 * Detects tapes that clone a workspace source repository themselves.
 * These tapes must run against an empty scratch directory rather than the
 * mounted sandbox, so that `git clone` has a clean target.
 * @param parsed - Parsed tape to inspect.
 * @param workspace - Resolved workspace config.
 * @returns `true` when a tape step clones a URL matching any workspace source name.
 */
function clonesWorkspaceSource(parsed: ParsedTape, workspace: ResolvedWorkspace): boolean {
	if (workspace.sources.length === 0) {
		return false;
	}
	const sourceNames = workspace.sources.map((s) => s.name);
	return parsed.tape.steps.some((step) => {
		if (step.action !== 'type') {
			return false;
		}
		return sourceNames.some((name) => {
			const pattern = new RegExp(`git clone\\s+.+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\.git)?(?:\\s|$)`);
			return pattern.test(step.command);
		});
	});
}

/**
 * Spawns the `vhs` binary with `stdio: 'inherit'` so its progress output is
 * visible in the terminal. Resolves when VHS exits 0; rejects with a
 * {@link VhsError} on non-zero exit or if `vhs` is not on `$PATH`.
 * @param tapeFile - Absolute path to the `.tape` file to record.
 * @param cwd - Working directory for the VHS process (the isolated temp dir).
 * @returns A promise that resolves when recording completes successfully.
 */
function spawnVhs(tapeFile: string, cwd: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const env = {
			...process.env,
			PATH: `${FFMPEG_FULL_BIN}:${process.env.PATH ?? ''}`,
		};
		const child = spawn('vhs', [tapeFile], { cwd, stdio: 'inherit', env });

		child.on('error', (err) => {
			if ((err as Error & { code?: string }).code === 'ENOENT') {
				reject(
					new VhsError(
						'VHS is not installed or not on PATH. Run: brew install charmbracelet/tap/vhs',
						null
					)
				);
			} else {
				reject(new VhsError(`Failed to spawn VHS: ${err.message}`, null));
			}
		});

		child.on('close', (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new VhsError(`VHS exited with code ${code}`, code));
			}
		});
	});
}
