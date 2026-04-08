#!/usr/bin/env tsx
/**
 * overlay.ts — Standalone debug overlay filter generator.
 *
 * Thin wrapper around `src/audit/overlay.ts` for use outside the pipeline.
 * Parses a tape directory (not a .tape file) and generates an ffmpeg drawtext
 * filter chain from the timeline.
 *
 * Usage:
 *   tsx scripts/debug/overlay.ts [tape-dir]
 *
 * Examples:
 *   tsx scripts/debug/overlay.ts studio/demo-tui
 *   DRAWTEXT=$(tsx scripts/debug/overlay.ts studio/demo-tui)
 *   DRAWTEXT=$(npm exec -- tsx scripts/debug/overlay.ts studio/demo-tui)
 *
 * Defaults to studio/demo-tui when no argument is given.
 *
 * This script stays in TypeScript because it is user-run tooling, not a CI/CD
 * entrypoint. Run it via an npm script or `npm exec -- tsx ...` if `tsx` is
 * not on your shell PATH.
 *
 * For pipeline-integrated usage, prefer `playback tape <dir> --debug-overlay`
 * which burns the overlay directly into the final video.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTape } from '../../src/parser/index';
import { buildTimeline } from '../../src/timeline';
import { buildOverlayFilter } from '../../src/audit/overlay';

const __filename = fileURLToPath(import.meta.url);
const root = resolve(__filename, '..', '..', '..');

const positional = process.argv[2];
const tapeDir = resolve(root, positional ?? 'studio/demo-tui');

const parsed = parseTape(tapeDir);
const timeline = buildTimeline(parsed);
const filter = buildOverlayFilter(timeline);

process.stdout.write(filter + '\n');
