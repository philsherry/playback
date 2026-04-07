#!/usr/bin/env tsx
/**
 * debug-timings.ts — Standalone timing audit script.
 *
 * Thin wrapper around `src/audit/timings.ts` for use outside the pipeline.
 * Reads tape.yaml directly and probes WAV files in the blockbuster output
 * directory.
 *
 * Usage:
 *   tsx scripts/debug-timings.ts [tape-dir] [--fix]
 *
 * Examples:
 *   tsx scripts/debug-timings.ts studio/demo-tui
 *   tsx scripts/debug-timings.ts studio/demo-tui --fix
 *   tsx scripts/debug-timings.ts studio/demo-accessible --fix
 *
 * Defaults to studio/demo-tui when no argument is given.
 *
 * For pipeline-integrated usage, prefer `playback tape <dir> --audit` or
 * `playback tape <dir> --audit-fix` instead.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseTape } from '../src/parser/index';
import { buildTimeline, applyAudioDurations } from '../src/timeline';
import { auditTimings } from '../src/audit/timings';
import type { SynthesisedSegment } from '../src/types';

const __filename = fileURLToPath(import.meta.url);
const root = resolve(__filename, '..', '..');

const AUDIO_BUFFER = 0.5;

// ── Helpers ──────────────────────────────────────────────────────────────────

function ffprobeDuration(wavPath: string): number | null {
	const result = spawnSync(
		'ffprobe',
		['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wavPath],
		{ encoding: 'utf8' }
	);
	const v = parseFloat(result.stdout?.trim() ?? '');
	return isNaN(v) ? null : v;
}

// ── Parse args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const fixMode = args.includes('--fix');
const positional = args.find((a) => !a.startsWith('--'));
const tapeDir = resolve(root, positional ?? 'studio/demo-tui');
const tapeYaml = join(tapeDir, 'tape.yaml');

if (!existsSync(tapeYaml)) {
	console.error(`tape.yaml not found: ${tapeYaml}`);
	process.exit(1);
}

// ── Parse tape and build timeline ─────────────────────────────────────────────

const parsed = parseTape(tapeDir);
const timeline = buildTimeline(parsed);

// ── Find blockbuster output dir and probe WAV files ───────────────────────────

const outputDir = join(root, 'blockbuster', parsed.tape.output);

if (!existsSync(outputDir)) {
	console.error(`blockbuster output not found: ${outputDir}`);
	console.error('Run the pipeline first: tsx src/cli.ts tape <tape-dir>');
	process.exit(1);
}

// Build fake SynthesisedSegment[] from probed WAV files.
const segments: SynthesisedSegment[] = [];
const wavFiles = readdirSync(outputDir);

for (const event of timeline.events) {
	if (!event.narration) continue;
	const wavFile = wavFiles.find((f) => f.match(new RegExp(`^segment-${event.stepIndex}-.*\\.wav$`)));
	if (!wavFile) continue;

	const wavPath = join(outputDir, wavFile);
	const duration = ffprobeDuration(wavPath);
	if (duration === null) continue;

	segments.push({
		stepIndex: event.stepIndex,
		startTime: event.narration.audioStartTime,
		text: event.narration.text,
		audioFile: wavPath,
		audioDuration: duration,
	});
}

// Apply durations to timeline so the audit sees real values.
applyAudioDurations(timeline, segments, AUDIO_BUFFER);

// Run the audit.
auditTimings(timeline, segments, tapeYaml, AUDIO_BUFFER, fixMode);
