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
 * ```
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { generateScaffold } from './generator/scaffold';
import { parseTape, ParseError } from './parser/index';
import { buildTimeline, applyAudioDurations, extractSegments, syncSegmentsToTimeline } from './timeline';
import { auditTimings } from './audit/timings';
import { buildOverlayFilter } from './audit/overlay';
import { runVhs, VhsError } from './runner/vhs';
import { runPiper, PiperError } from './runner/piper';
import { generateCaptions } from './generator/captions';
import { generateChapters } from './generator/chapters';
import { runFfmpeg, FfmpegError } from './runner/ffmpeg';
import { generateManifest } from './generator/manifest';
import type { VoiceOutput } from './generator/manifest';
import { stepToTime, VIDEO_HEIGHT } from './constants';
import { loadConfig } from './config';
import type { SynthesisedSegment, VideoMetadata } from './types';
import type { Voice } from './schema/meta';
import {
	WorkspaceError,
	loadWorkspace,
	resolveWorkspaceSources,
	getWorkspaceConstants,
	getRequiredSourceNames,
	validateWorkspaceReferences,
} from './workspace';

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

/** When `true` and command is `scaffold`, overwrite an existing PROMPT.md. */
const scaffoldForce = command === 'scaffold' && flags.has('--force');

// ── Help ──────────────────────────────────────────────────────────────────────

/**
 * Prints the CLI help text to stdout.
 *
 * Applies ANSI colour codes when stdout is a TTY and the `NO_COLOR`
 * environment variable is not set. Otherwise outputs plain text.
 */
function printHelp(): void {
	const useColour = process.stdout.isTTY && !process.env['NO_COLOR'];

	const bold = (s: string) => useColour ? `\x1b[1m${s}\x1b[0m` : s;
	const cyan = (s: string) => useColour ? `\x1b[1m\x1b[36m${s}\x1b[0m` : s;
	const white = (s: string) => useColour ? `\x1b[1;37m${s}\x1b[0m` : s;
	const yellow = (s: string) => useColour ? `\x1b[33m${s}\x1b[0m` : s;
	const dim = (s: string) => useColour ? `\x1b[2m${s}\x1b[0m` : s;

	void bold; // referenced via cyan/white/dim

	console.log(`
${cyan('playback')} ${dim('—')} ${cyan('accessible terminal demo video creation tool')}

${cyan('Usage:')}
  ${white('playback validate <dir>')}              ${dim('Parse and validate a tape without recording')}
  ${white('playback tape <dir>')}                  ${dim('Run the full pipeline')}
  ${white('playback tape <dir>')} ${yellow('--vhs-only')}       ${dim('Record terminal only, skip audio and captions')}
  ${white('playback tape <dir>')} ${yellow('--captions-only')}  ${dim('Regenerate captions from an existing tape')}
  ${white('playback tape <dir>')} ${yellow('--web')}            ${dim('Also export standalone audio + manifest.json')}
  ${white('playback tape <dir>')} ${yellow('--audit')}          ${dim('Print timing audit table after synthesis')}
  ${white('playback tape <dir>')} ${yellow('--audit-fix')}      ${dim('Audit + fix shortfalls in tape.yaml')}
  ${white('playback tape <dir>')} ${yellow('--debug-overlay')}  ${dim('Burn command labels into the final video')}
  ${white('playback tape <dir>')} ${yellow('--mkv')}            ${dim('Also produce a .mkv with embedded SRT subtitles')}
  ${white('playback scaffold <dir>')}              ${dim('Generate a PROMPT.md scaffold from tape.yaml and meta.yaml')}
  ${white('playback scaffold <dir>')} ${yellow('--force')}      ${dim('Overwrite an existing PROMPT.md')}

${cyan('Options:')}
  ${yellow('-h, --help')}    ${dim('Show this help message')}
`);
}

if (!command || command === '--help' || command === '-h') {
	printHelp();
	process.exit(0);
}

// ── Validation ─────────────────────────────────────────────────────────────────

if (command !== 'tape' && command !== 'validate' && command !== 'scaffold') {
	console.error(`Unknown command: ${command}`);
	console.error('Run playback --help for usage.');
	process.exit(1);
}

if (!tapePath) {
	console.error(`Missing tape directory. Usage: playback ${command} <dir>`);
	process.exit(1);
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

/**
 * How many seconds of silence to leave after narration audio ends before the
 * next step begins. Applied when back-filling step pause values from real WAV
 * durations so the VHS recording gives every clip enough room to finish.
 */
const AUDIO_BUFFER = 0.5;

/**
 *
 */
async function run(): Promise<void> {
	const config = await loadConfig();
	const DIST_DIR = resolve(process.cwd(), config.outputDir);
	const projectRoot = process.cwd();
	const workspaceConfig = loadWorkspace(projectRoot);

	const parsed = parseTape(tapePath, getWorkspaceConstants(workspaceConfig));
	const requiredSources = getRequiredSourceNames(parsed, workspaceConfig);
	const workspace = resolveWorkspaceSources(workspaceConfig, projectRoot, requiredSources);
	const { meta, tape } = parsed;
	const outputDir = join(DIST_DIR, tape.output);
	const outputSlug = basename(tape.output);

	console.log(`▶ ${meta.title}`);
	console.log('  Validating workspace paths…');
	validateWorkspaceReferences(parsed, workspace);

	if (command === 'validate') {
		console.log(`\n✓ Valid. Tape: ${parsed.dir}`);
		return;
	}

	if (command === 'scaffold') {
		const promptPath = join(parsed.dir, 'PROMPT.md');
		if (existsSync(promptPath) && !scaffoldForce) {
			console.error(`✗ PROMPT.md already exists: ${promptPath}`);
			console.error('  Use --force to overwrite.');
			process.exit(1);
		}
		const timeline = buildTimeline(parsed);
		const content = generateScaffold(parsed, timeline.totalDuration);
		writeFileSync(promptPath, content, 'utf8');
		console.log(`✓ Scaffold written: ${promptPath}`);
		return;
	}

	const posterTime = meta.poster != null
		? stepToTime(tape.steps, meta.poster)
		: null;

	// When VHS records at full VIDEO_HEIGHT (no caption bar), captions
	// overlay the content. Increase the margin so they clear the VHS
	// border decoration and sit visibly above the bottom edge.
	const vhsHeight = meta.vhs?.height;
	const captionMarginV = (vhsHeight != null && vhsHeight >= VIDEO_HEIGHT) ? 40 : undefined;

	const videoMetadata: VideoMetadata = {
		album: meta.series,
		artist: meta.artist ?? 'Created by Playback',
		comment: meta.description,
		language: meta.locale,
		title: meta.title,
		track: meta.episode,
	};

	const voices = (meta.voices ?? config.defaultVoices) as Voice[];
	const webEnabled = webFlag || config.webOutput;

	// vhsOnly: record terminal only, no audio processing.
	if (vhsOnly) {
		console.log('  Recording terminal…');
		const { rawMp4 } = await runVhs(parsed, DIST_DIR, workspace);
		console.log(`\n✓ Done. Raw recording: ${rawMp4}`);
		return;
	}

	// Ensure the output directory exists before writing script.txt or WAV files.
	mkdirSync(outputDir, { recursive: true });

	// For fixedTiming tapes, clear narration from the in-memory steps before
	// building the timeline. This ensures stepDuration() and stepSleep() both
	// use the author's pause values — not the word-count narration estimate.
	// The narration text is preserved in a lookup for the timeline builder.
	const narrationByStep = new Map<number, string>();
	if (meta.fixedTiming) {
		for (let i = 0; i < parsed.tape.steps.length; i++) {
			const step = parsed.tape.steps[i];
			// Skip narrate steps — their narration drives command spacing
			// and must not be stripped even in fixedTiming mode.
			// Skip chapter steps — they have no narration field.
			if (step.action === 'narrate' || step.action === 'chapter') continue;
			if (step.narration) {
				narrationByStep.set(i, step.narration);
				step.narration = undefined;
			}
		}
	}

	// Step 1 — Build the timeline (single source of truth for all timing).
	console.log('  Building timeline…');
	const timeline = buildTimeline(parsed);

	// For fixedTiming, restore narration onto the timeline events so audio
	// extraction and captions still work. The steps stay narration-free so
	// the VHS generator uses pause values directly.
	if (meta.fixedTiming) {
		for (const event of timeline.events) {
			const text = narrationByStep.get(event.stepIndex);
			if (text) {
				event.narration = {
					audioDuration: null,
					audioStartTime: event.startTime,
					offset: 0,
					text,
				};
			}
		}
	}

	const script = extractSegments(timeline, outputDir);

	if (script.segments.length === 0) {
		// No narration — record and mix without audio.
		console.log('  Generating chapters…');
		const chaptersNoNarr = generateChapters(timeline, parsed.tape.steps, outputDir);
		console.log('  Recording terminal…');
		const { rawMp4 } = await runVhs(parsed, DIST_DIR, workspace);
		console.log('  No narration found — skipping audio and captions.');
		await runFfmpeg(rawMp4, [], { assFile: '', srtFile: '', vttFile: '' }, outputDir, outputSlug, posterTime, parsed.posterFile, videoMetadata, undefined, chaptersNoNarr.hasExplicit ? chaptersNoNarr.path : undefined);
		console.log(`\n✓ Done. Output: ${outputDir}`);
		return;
	}

	// Step 2 — Pre-synthesise the primary voice to get real audio durations.
	//
	// Back-fill the timeline with real WAV durations so VHS Sleep values and
	// audio start times are accurate. The timeline is mutated in-memory —
	// tape.yaml on disk is not modified.
	const primaryVoice = voices[0];
	let primarySynthesised: SynthesisedSegment[] | null = null;

	if (!captionsOnly) {
		console.log(`  Synthesising audio (${voices.join(', ')})…`);
		console.log(`  Voice: ${primaryVoice}`);
		primarySynthesised = await runPiper(script.segments, outputDir, primaryVoice, config.voicesDir);

		// Back-fill timeline with real durations, recalculate start times,
		// and resolve narration overlaps — unless fixedTiming is set, in
		// which case the author's pause values are authoritative (used for
		// choreographed tapes where actions fire during narration).
		if (!meta.fixedTiming) {
			applyAudioDurations(timeline, primarySynthesised, AUDIO_BUFFER);

			// Also update the in-memory parsed.tape.steps so that runVhs (which
			// calls generateVhsTape internally) uses the corrected pause values.
			// The pause must beat BOTH the original pause AND the word-count
			// estimate from narrationDuration(), since stepSleep() takes
			// max(pause, narrationDuration). Real audio duration is the
			// authoritative value after synthesis.
			for (const event of timeline.events) {
				if (event.narration?.audioDuration != null) {
					const step = parsed.tape.steps[event.stepIndex];
					if (step.action === 'chapter') continue;
					step.pause = Math.max(step.pause ?? 0.5, event.narration.audioDuration + AUDIO_BUFFER);
					// Clear narration text from the step so stepSleep() won't
					// override the corrected pause with a word-count estimate.
					// The narration text is preserved in the timeline and
					// synthesised segments for captions and the audio mix.
					step.narration = undefined;
				}
			}
		} else {
			console.log('  Fixed timing — skipping back-fill.');
			// Still record audio durations on the timeline for audit/overlay,
			// but don't extend step durations or recalculate start times.
			const segByStep = new Map(primarySynthesised.map((s) => [s.stepIndex, s]));
			for (const event of timeline.events) {
				const seg = segByStep.get(event.stepIndex);
				if (seg && event.narration) {
					event.narration.audioDuration = seg.audioDuration;
				}
			}
		}

		// Re-write script.txt with corrected start times from the timeline.
		extractSegments(timeline, outputDir);

		// Sync synthesised segment start times to the corrected timeline.
		primarySynthesised = syncSegmentsToTimeline(timeline, primarySynthesised);

		// Timing audit — print comparison table after synthesis.
		if (auditFlag || auditFixFlag) {
			auditTimings(
				timeline,
				primarySynthesised,
				join(parsed.dir, 'tape.yaml'),
				AUDIO_BUFFER,
				auditFixFlag
			);
		}
	}

	// Generate chapter metadata from the finalised timeline.
	// The chapters.txt file is always written for benchmarking (ffprobe
	// diffing). It is only embedded into the MP4 when tape steps contain
	// explicit `chapter` steps — when hasExplicit is true, the chapter file
	// is passed to runFfmpeg for embedding.
	console.log('  Generating chapters…');
	const chaptersResult = generateChapters(timeline, parsed.tape.steps, outputDir);

	// Build debug overlay filter if requested (before VHS so it's ready for ffmpeg).
	const overlayFilter = debugOverlayFlag ? buildOverlayFilter(timeline) : undefined;

	// Step 3 — Record VHS. Pauses are now guaranteed to fit the audio.
	console.log('  Recording terminal…');
	const { rawMp4 } = await runVhs(parsed, DIST_DIR, workspace);

	// Step 4 — Process each voice: captions + ffmpeg mix.
	const voiceOutputs: VoiceOutput[] = [];
	let lastPosterFile: string | null = null;
	let lastCardFile: string | null = null;
	let lastOgFile: string | null = null;

	// For non-primary voices, extract segments from the back-filled timeline
	// so they get the corrected start times.
	const activeScript = extractSegments(timeline, outputDir);

	for (const voice of voices) {
		if (voice !== primaryVoice) {
			console.log(`  Voice: ${voice}`);
		}

		// Reuse already-synthesised WAV files for the primary voice; synthesise
		// fresh for any additional voices.
		const synthesised = resolveStartTimes(
			primarySynthesised !== null && voice === primaryVoice
				? primarySynthesised
				: await runPiper(activeScript.segments, outputDir, voice, config.voicesDir)
		);

		if (!captionsOnly) {
			console.log('  Generating captions…');
		}
		const captions = generateCaptions(synthesised, outputDir, outputSlug, captionMarginV);

		if (captionsOnly) {
			console.log(`  ✓ Captions: ${captions.vttFile}`);
			continue;
		}

		// ffmpeg stitch
		console.log('  Stitching video…');
		const result = await runFfmpeg(
			rawMp4,
			synthesised,
			captions,
			outputDir,
			outputSlug,
			posterTime,
			parsed.posterFile,
			videoMetadata,
			overlayFilter || undefined,
			chaptersResult.hasExplicit ? chaptersResult.path : undefined,
			mkvFlag
		);

		console.log(`  ✓ ${result.mp4File}`);
		console.log(`  ✓ ${result.gifFile}`);
		if (result.mkvFile) console.log(`  ✓ ${result.mkvFile}`);
		if (result.posterFile) console.log(`  ✓ ${result.posterFile}`);
		if (result.cardFile) console.log(`  ✓ ${result.cardFile}`);
		if (result.ogFile) console.log(`  ✓ ${result.ogFile}`);
		lastPosterFile = result.posterFile;
		lastCardFile = result.cardFile;
		lastOgFile = result.ogFile;

		// Collect voice output for manifest generation.
		if (webEnabled) {
			voiceOutputs.push({
				mp4File: result.mp4File,
				srtFile: captions.srtFile,
				voice,
				vttFile: captions.vttFile,
			});
		}
	}

	// Web output — generate manifest
	if (webEnabled && voiceOutputs.length > 0) {
		console.log('  Generating manifest…');
		const manifestFile = generateManifest(parsed, outputDir, lastPosterFile, lastCardFile, lastOgFile, voiceOutputs);
		console.log(`  ✓ ${manifestFile}`);
	}

	console.log(`\n✓ Done. Output: ${outputDir}`);
}

/**
 * Ensures no two synthesised segments overlap in the mix.
 *
 * Start times are estimated before synthesis; actual piper audio can run
 * slightly longer than the estimate. This function walks the segments in
 * order and, where an actual audio duration would bleed into the next
 * segment's start time, pushes that start time back enough to clear it.
 * The adjustment cascades so later segments are shifted consistently.
 * @param segments - Synthesised segments whose start times may overlap.
 * @returns A new array of segments with start times adjusted to prevent overlap.
 */
function resolveStartTimes(
	segments: import('./types').SynthesisedSegment[]
): import('./types').SynthesisedSegment[] {
	const GAP = 0.25;
	const result = segments.map((s) => ({ ...s }));

	for (let i = 1; i < result.length; i++) {
		const prev = result[i - 1];
		const minStart = prev.startTime + prev.audioDuration + GAP;
		if (result[i].startTime < minStart) {
			result[i].startTime = minStart;
		}
	}

	return result;
}

run().catch((err: unknown) => {
	if (
		err instanceof ParseError ||
		err instanceof WorkspaceError ||
		err instanceof VhsError ||
		err instanceof PiperError ||
		err instanceof FfmpegError
	) {
		console.error(`\n✗ ${err.message}`);
	} else {
		console.error('\n✗ Unexpected error:', err);
	}

	process.exit(1);
});
