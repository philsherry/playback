/**
 * @module audit/timings
 *
 * Compares synthesised WAV durations against tape.yaml pause values and
 * prints a timing audit table. Optionally writes corrected pause values
 * back to tape.yaml on disk.
 *
 * This is the library version of `scripts/debug/timings.ts`. The standalone
 * script is a thin wrapper around this module; the pipeline uses it via the
 * `--audit` and `--audit-fix` flags.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import type { Timeline } from '../timeline';
import type { SynthesisedSegment } from '../types';

// ── Formatting helpers ───────────────────────────────────────────────────────

/**
 * Truncates narration text to fit the audit table.
 * @param text - Source narration text.
 * @param n - Maximum output length.
 * @returns Collapsed single-line text, truncated with an ellipsis if needed.
 */
function truncate(text: string, n: number): string {
	const s = text.replace(/\s+/g, ' ').trim();
	return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/**
 * Pads a table cell to a fixed width.
 * @param v - Cell value.
 * @param w - Column width.
 * @returns Right-aligned cell string.
 */
function cell(v: string, w: number): string {
	return v.padStart(w);
}

/**
 * Formats a numeric delta with an explicit sign.
 * @param n - Numeric delta in seconds.
 * @returns Signed decimal string.
 */
function sign(n: number): string {
	return n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Fix {
	stepIndex: number;
	oldPause: number;
	newPause: number;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Prints a timing audit table comparing WAV durations against pause values.
 *
 * When `fix` is `true` and shortfalls are found, writes corrected pause
 * values back to `tapeYamlPath` on disk. Only lines with a shortfall are
 * touched; the rest of the file is preserved exactly.
 * @param timeline - The timeline (after applyAudioDurations if available).
 * @param segments - Synthesised segments with real audio durations.
 * @param tapeYamlPath - Absolute path to tape.yaml (for --fix writes).
 * @param audioBuffer - Seconds of silence after each narration clip.
 * @param fix - When true, write corrected pauses to tape.yaml.
 */
export function auditTimings(
	timeline: Timeline,
	segments: SynthesisedSegment[],
	tapeYamlPath: string,
	audioBuffer: number,
	fix: boolean
): void {
	// Index segments by step for lookup.
	const segByStep = new Map<number, SynthesisedSegment>();
	for (const seg of segments) {
		segByStep.set(seg.stepIndex, seg);
	}

	const COL = { step: 5, narration: 46, wav: 8, pause: 7, delta: 8, rec: 8 };
	const header = [
		'Step'.padEnd(COL.step),
		'Narration'.padEnd(COL.narration),
		cell('WAV (s)', COL.wav),
		cell('pause', COL.pause),
		cell('delta', COL.delta),
		cell('rec.', COL.rec),
	].join('  ');
	const rule = '-'.repeat(header.length);

	console.log(`\nTiming audit: ${tapeYamlPath}\n`);
	console.log(header);
	console.log(rule);

	let totalWav = 0;
	let shortfalls = 0;
	const fixes: Fix[] = [];

	for (const event of timeline.events) {
		if (!event.narration) continue;

		const seg = segByStep.get(event.stepIndex);
		const wavDur = seg?.audioDuration ?? null;
		const pause = event.duration;
		const rec = wavDur !== null ? wavDur + audioBuffer : null;
		const delta = wavDur !== null ? pause - wavDur : null;

		if (wavDur !== null) totalWav += wavDur;
		if (delta !== null && delta < 0) {
			shortfalls++;
			if (fix && rec !== null) {
				fixes.push({
					stepIndex: event.stepIndex,
					oldPause: Math.round(pause * 100) / 100,
					newPause: Math.round(rec * 100) / 100,
				});
			}
		}

		const wavStr = wavDur !== null ? wavDur.toFixed(3) : '  n/a  ';
		const deltaStr = delta !== null ? sign(delta) : '  n/a  ';
		const recStr = rec !== null ? rec.toFixed(2) : '  n/a  ';
		const flag = delta !== null && delta < 0 ? ' !' : '  ';

		console.log(
			[
				String(event.stepIndex).padEnd(COL.step),
				truncate(event.narration.text, COL.narration).padEnd(COL.narration),
				cell(wavStr, COL.wav),
				cell(String(Math.round(pause * 100) / 100), COL.pause),
				cell(deltaStr, COL.delta) + flag,
				cell(recStr, COL.rec),
			].join('  ')
		);
	}

	console.log(rule);
	console.log(`WAV total: ${totalWav.toFixed(3)}s   Shortfalls: ${shortfalls}`);

	if (shortfalls > 0) {
		console.log(
			'\n! = pause is shorter than the WAV duration — video will drift ahead of narration.'
		);
		console.log(
			`  rec. = minimum recommended pause (WAV duration + ${audioBuffer}s buffer)`
		);
	}

	// ── Apply fixes ──────────────────────────────────────────────────────────

	if (fix) {
		if (fixes.length === 0) {
			console.log('\nNo shortfalls to fix.');
		} else {
			const fixMap = new Map<number, number>(
				fixes.map((f) => [f.stepIndex, f.newPause])
			);
			let currentStep = -1;
			const patchedLines = readFileSync(tapeYamlPath, 'utf8')
				.split('\n')
				.map((line) => {
					if (/^ {2}- action:/.test(line)) currentStep++;
					const newPause = fixMap.get(currentStep);
					if (newPause !== undefined && /^ {4}pause:/.test(line)) {
						return `    pause: ${newPause}`;
					}
					return line;
				});

			for (const f of fixes) {
				console.log(`  step ${f.stepIndex}: pause ${f.oldPause} → ${f.newPause}`);
			}

			writeFileSync(tapeYamlPath, patchedLines.join('\n'), 'utf8');
			console.log(`\nWrote ${fixes.length} fix(es) to ${tapeYamlPath}`);
			console.log('Re-run without --fix to confirm all shortfalls are resolved.');
		}
	}

	console.log('');
}
