#!/usr/bin/env node
/**
 * @file cli.ts
 * @module playback/cli
 *
 * Entry point for the `playback` command-line tool.
 *
 * Runs the full pipeline for a single tape directory:
 *   1. Parse `tape.yaml` and `meta.yaml`
 *   2. Build a unified timeline from tape steps (single source of truth)
 *   3. Extract narration segments and synthesise audio via Piper TTS
 *   4. Back-fill timeline with real WAV durations
 *   5. Record VHS terminal session (Sleep values now fit the audio)
 *   6. Generate captions and mix audio + video with ffmpeg
 *
 * Usage:
 * ```sh
 * playback validate <dir>              # parse and validate tape paths only
 * playback tape <dir>                  # full pipeline
 * playback tape <dir> --vhs-only       # terminal recording only
 * playback tape <dir> --captions-only  # regenerate captions from existing tape
 * playback playlist                    # batch-build all tapes in tapesDir
 * ```
 */

import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { generateScaffold } from './generator/scaffold';
import { parseTape, ParseError } from './parser/index';
import { buildTimeline } from './timeline';
import { VhsError } from './runner/vhs';
import { PiperError } from './runner/piper';
import { FfmpegError } from './runner/ffmpeg';
import { loadConfig } from './config';
import { loadXdgConfig, xdgThemeOverridePath } from './config/xdg';
import { loadTheme } from './theme';
import {
	WorkspaceError,
	loadWorkspace,
	resolveWorkspaceSources,
	getWorkspaceConstants,
	getRequiredSourceNames,
	validateWorkspaceReferences,
} from './workspace';
import { configureLogger, logError, logInfo, logSuccess, logVerbose } from './logger';
import { runTape } from './commands/tape';
import { runPlaylist } from './commands/playlist';

// ── Argument parsing ───────────────────────────────────────────────────────────

/** Raw CLI arguments, minus the node/script prefix. */
const args = process.argv.slice(2);

/** The sub-command to run, e.g. `tape`. */
const command = args[0];

/** Path to the tape directory passed as the first positional argument. */
const tapePath = args[1];

/** Set of flag arguments (e.g. `--vhs-only`, `--captions-only`). */
const flags = new Set(args.slice(2));

/** When `true`, skip audio synthesis, caption generation, and ffmpeg mixing. */
const vhsOnly = flags.has('--vhs-only');

/** When `true`, skip the VHS recording step and regenerate captions only. */
const captionsOnly = flags.has('--captions-only');

/** When `true`, generate web-friendly output (standalone audio + manifest). */
const webFlag = flags.has('--web');

/** When `true`, print a timing audit table after synthesis. */
const auditFlag = flags.has('--audit');

/** When `true`, print the audit table and fix shortfalls in tape.yaml. */
const auditFixFlag = flags.has('--audit-fix');

/** When `true`, burn a debug command overlay into the final video. */
const debugOverlayFlag = flags.has('--debug-overlay');

/** When `true`, also produce a `.mkv` with an embedded SRT subtitle track. */
const mkvFlag = flags.has('--mkv');

/** When `true`, regenerate the manifest.json from existing output files without re-running the pipeline. */
const manifestOnly = flags.has('--manifest-only');

/** When `true`, suppress all output except warnings and errors. */
const quietFlag = flags.has('--quiet');

/** When `true`, show verbose output including subprocess logs. */
const verboseFlag = flags.has('--verbose');

// ── Logger bootstrap ──────────────────────────────────────────────────────────

// Configure the logger level from CLI flags immediately so all subsequent
// output respects the user's choice. Theme is applied later after the XDG
// config and project config are loaded.
configureLogger({
	level: verboseFlag ? 'verbose' : quietFlag ? 'warn' : 'info',
});

// ── Help ──────────────────────────────────────────────────────────────────────

/**
 * Prints the CLI help text to stdout.
 *
 * Applies ANSI colour codes when stdout is a TTY and the `NO_COLOR`
 * environment variable is not set. Otherwise outputs plain text.
 */
function printHelp(): void {
	const useColour = process.stdout.isTTY && !process.env.NO_COLOR;

	const bold = (s: string) => useColour ? `\x1b[1m${s}\x1b[0m` : s;
	const cyan = (s: string) => useColour ? `\x1b[1m\x1b[36m${s}\x1b[0m` : s;
	const white = (s: string) => useColour ? `\x1b[1;37m${s}\x1b[0m` : s;
	const yellow = (s: string) => useColour ? `\x1b[33m${s}\x1b[0m` : s;
	const dim = (s: string) => useColour ? `\x1b[2m${s}\x1b[0m` : s;

	void bold; // referenced via cyan/white/dim

	process.stdout.write(`
${cyan('playback')} ${dim('—')} ${cyan('accessible terminal demo video creation tool')}

${cyan('Usage:')}
  ${white('playback validate <dir>')}              ${dim('Parse and validate a tape without recording')}
  ${white('playback tape <dir>')}                  ${dim('Run the full pipeline')}
  ${white('playback tape <dir>')} ${yellow('--vhs-only')}       ${dim('Record terminal only, skip audio and captions')}
  ${white('playback tape <dir>')} ${yellow('--captions-only')}   ${dim('Regenerate captions from an existing tape')}
  ${white('playback tape <dir>')} ${yellow('--manifest-only')}  ${dim('Regenerate manifest.json from existing output files')}
  ${white('playback tape <dir>')} ${yellow('--web')}            ${dim('Also export standalone audio + manifest.json')}
  ${white('playback tape <dir>')} ${yellow('--audit')}          ${dim('Print timing audit table after synthesis')}
  ${white('playback tape <dir>')} ${yellow('--audit-fix')}      ${dim('Audit + fix shortfalls in tape.yaml')}
  ${white('playback tape <dir>')} ${yellow('--debug-overlay')}  ${dim('Burn command labels into the final video')}
  ${white('playback tape <dir>')} ${yellow('--mkv')}            ${dim('Also produce a .mkv with embedded SRT subtitles')}
  ${white('playback scaffold <dir>')}              ${dim('Generate a PROMPT.md scaffold from tape.yaml and meta.yaml')}
  ${white('playback scaffold <dir>')} ${yellow('--force')}      ${dim('Overwrite an existing PROMPT.md')}
  ${white('playback playlist')}                        ${dim('Batch-build all tapes in tapesDir')}
  ${white('playback playlist')} ${yellow('--tapes-dir <dir>')}  ${dim('Override the tapes directory')}
  ${white('playback playlist')} ${yellow('-- <flags>')}         ${dim('Forward flags to each tape invocation')}

${cyan('Options:')}
  ${yellow('--quiet')}       ${dim('Suppress progress output; show warnings and errors only')}
  ${yellow('--verbose')}     ${dim('Show all output including subprocess logs')}
  ${yellow('-h, --help')}    ${dim('Show this help message')}
`);
}

if (!command || command === '--help' || command === '-h') {
	printHelp();
	process.exit(0);
}

// ── Validation ─────────────────────────────────────────────────────────────────

if (!['tape', 'validate', 'scaffold', 'playlist'].includes(command)) {
	logError(`Unknown command: ${command}`);
	logError('Run playback --help for usage.');
	process.exit(1);
}

if (command !== 'playlist' && !tapePath) {
	logError(`Missing tape directory. Usage: playback ${command} <dir>`);
	process.exit(1);
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

/**
 *
 */
async function run(): Promise<void> {
	// playlist: dispatch immediately, no tape setup needed
	if (command === 'playlist') {
		const rawPlaylistArgs = args.slice(1);
		const tapesDirIdx = rawPlaylistArgs.indexOf('--tapes-dir');
		let tapesDir: string | undefined;
		let forwardedFlags: string[];
		if (tapesDirIdx !== -1) {
			const val = rawPlaylistArgs[tapesDirIdx + 1];
			if (!val || val.startsWith('--')) {
				logError('Error: --tapes-dir requires a path argument.');
				process.exit(1);
			}
			tapesDir = resolve(val);
			forwardedFlags = rawPlaylistArgs.filter((_, i) => i !== tapesDirIdx && i !== tapesDirIdx + 1);
		} else {
			forwardedFlags = rawPlaylistArgs.filter((f) => f !== '--');
		}
		await runPlaylist({ forwardedFlags, tapesDir });
		return;
	}

	// tape: runTape is self-contained
	if (command === 'tape') {
		await runTape({ auditFixFlag, auditFlag, captionsOnly, debugOverlayFlag, manifestOnly, mkvFlag, tapePath, vhsOnly, webFlag });
		return;
	}

	// validate and scaffold: shared setup
	const xdgConfig = loadXdgConfig();
	const config = await loadConfig();
	configureLogger({ theme: loadTheme(xdgConfig?.theme ?? 'default', xdgThemeOverridePath()) });
	const projectRoot = process.cwd();
	const workspaceConfig = loadWorkspace(projectRoot);
	const parsed = parseTape(tapePath, getWorkspaceConstants(workspaceConfig));
	const requiredSources = getRequiredSourceNames(parsed, workspaceConfig);
	const workspace = resolveWorkspaceSources(workspaceConfig, projectRoot, requiredSources);
	const { meta, tape } = parsed;
	const DIST_DIR = resolve(projectRoot, config.outputDir);
	const outputDir = join(DIST_DIR, tape.output);

	logInfo(`▶ ${meta.title}`);
	logInfo('  Validating workspace paths…');
	validateWorkspaceReferences(parsed, workspace);

	if (command === 'validate') {
		logVerbose(`  Steps: ${tape.steps.length}`);
		logVerbose(`  Voices: ${meta.voices.join(', ')}`);
		logVerbose(`  Output: ${outputDir}`);
		if (meta.fixedTiming) logVerbose('  Fixed timing: true');
		logSuccess(`\n✓ Valid. Tape: ${parsed.dir}`);
		return;
	}

	// command === 'scaffold'
	const scaffoldForce = flags.has('--force');
	const promptPath = join(parsed.dir, 'PROMPT.md');
	if (existsSync(promptPath) && !scaffoldForce) {
		logError(`✗ PROMPT.md already exists: ${promptPath}`);
		logError('  Use --force to overwrite.');
		process.exit(1);
	}
	const timeline = buildTimeline(parsed);
	const content = generateScaffold(parsed, timeline.totalDuration);
	writeFileSync(promptPath, content, 'utf8');
	logSuccess(`✓ Scaffold written: ${promptPath}`);
}

run().catch((err: unknown) => {
	if (
		err instanceof ParseError ||
		err instanceof WorkspaceError ||
		err instanceof VhsError ||
		err instanceof PiperError ||
		err instanceof FfmpegError
	) {
		logError(`\n✗ ${(err as Error).message}`);
	} else {
		logError(`\n✗ Unexpected error: ${String(err)}`);
	}

	process.exit(1);
});
