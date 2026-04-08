/**
 * @module timeline
 *
 * Unified timeline model for the playback pipeline.
 *
 * The timeline is the single source of truth for timing — both VHS tape
 * generation and audio mixing read from it. This eliminates the "two-clock
 * problem" where VHS Sleep values and audio start times were calculated
 * independently and could drift.
 *
 * Typical flow:
 * 1. `buildTimeline(parsed)` — create timeline from tape.yaml steps
 * 2. `extractSegments(timeline)` — pull narration segments for Piper
 * 3. Synthesise audio, get real WAV durations
 * 4. `applyAudioDurations(timeline, segments, buffer)` — back-fill
 * 5. `generateVhsFromTimeline(timeline, parsed)` — create .tape file
 * 6. Use timeline for captions, ffmpeg mix, etc.
 */

import { writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import {
	FRAMERATE,
	TERMINAL_BORDER_RADIUS,
	TERMINAL_FONT,
	TERMINAL_FONT_SIZE,
	TERMINAL_HEIGHT,
	TERMINAL_MARGIN,
	TERMINAL_MARGIN_FILL,
	TERMINAL_THEME,
	TERMINAL_WINDOW_BAR,
	TYPING_SPEED,
	TYPING_SPEED_MS,
	VIDEO_WIDTH,
	narrationDuration,
} from '../constants';
import type { Step } from '../schema/tape';
import type { ParsedTape, NarrationSegment, TtsScript, SynthesisedSegment } from '../types';
import { escapeVhs } from '../utilities/escape';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * VHS directives for a single timeline event.
 */
export type VhsAction = {
	/** VHS directive lines (e.g. `['Type "npm install"', 'Enter']`). */
	directives: string[];
	/** The Sleep value in seconds that follows the directives. */
	sleepSeconds: number;
	/**
	 * Total inter-command sleep embedded in directives (`narrate` steps only).
	 * Used by `eventDuration` to calculate the total without parsing directives.
	 */
	embeddedSleepSeconds?: number;
};

/**
 * Narration metadata for a timeline event.
 */
export type TimelineNarration = {
	/** Text to synthesise. */
	text: string;
	/** Offset in seconds from `narrationOffset` in tape.yaml. */
	offset: number;
	/** Absolute start time for the audio clip: `startTime + offset`. */
	audioStartTime: number;
	/** Actual audio duration after synthesis; `null` before synthesis. */
	audioDuration: number | null;
};

/**
 * A single event on the timeline, corresponding to one tape step.
 */
export type TimelineEvent = {
	/** Zero-based index of the originating step in `tape.steps`. */
	stepIndex: number;
	/** Absolute start time in seconds from the beginning of the recording. */
	startTime: number;
	/** Total duration this event occupies in the timeline. */
	duration: number;
	/** VHS directives and sleep value for this event. */
	vhs: VhsAction;
	/** Narration segment, or `null` if this step has no narration. */
	narration: TimelineNarration | null;
};

/**
 * The complete timeline for a tape.
 */
export type Timeline = {
	/** Ordered list of events. */
	events: TimelineEvent[];
	/** Total duration of the recording in seconds. */
	totalDuration: number;
};

// ── Constants ────────────────────────────────────────────────────────────────

/** Default pause when a step has no explicit `pause` value. */
const DEFAULT_PAUSE = 0.5;

/** Minimum sleep to keep VHS happy. */
const MIN_SLEEP = 0.1;

/** Shell for VHS tape header. */
const SHELL = 'zsh';

/** VHS special key names that are commands, not Type arguments. */
const SPECIAL_KEYS = ['Escape', 'Tab', 'Space', 'Backspace', 'Up', 'Down', 'Left', 'Right', 'Enter'];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Rounds a numeric value to two decimal places.
 * @param n - Numeric value to round.
 * @returns Rounded value.
 */
function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

/**
 * Builds VHS directives and calculates sleep for a step.
 * This is the single place where VHS timing is calculated — replaces the
 * separate `stepSleep()` in generator/vhs.ts.
 * @param step - Tape step to convert into VHS actions.
 * @returns VHS directives plus computed sleep values.
 */
function buildVhsAction(step: Step): VhsAction {
	if (step.action === 'chapter') {
		return { directives: [], sleepSeconds: 0 };
	}

	const pause = step.pause ?? DEFAULT_PAUSE;
	const narration = step.narration ? narrationDuration(step.narration) : 0;

	switch (step.action) {
		case 'type': {
			const typingDuration = (step.command.length * TYPING_SPEED_MS) / 1000;
			const sleep = round2(Math.max(pause, narration - typingDuration, MIN_SLEEP));
			return {
				directives: [`Type "${escapeVhs(step.command)}"`, 'Enter'],
				sleepSeconds: sleep,
			};
		}

		case 'key': {
			const sleep = round2(Math.max(pause, narration));
			const directive = SPECIAL_KEYS.includes(step.command)
				? step.command
				: `Type "${escapeVhs(step.command)}"`;
			return {
				directives: [directive],
				sleepSeconds: sleep,
			};
		}

		case 'run': {
			const sleep = round2(Math.max(pause, narration));
			return {
				directives: [],
				sleepSeconds: sleep,
			};
		}

		case 'comment': {
			const sleep = round2(Math.max(pause, narration));
			return {
				directives: [],
				sleepSeconds: sleep > 0 ? sleep : 0,
			};
		}

		case 'narrate': {
			// Commands are spaced evenly across the narration duration.
			// Each command gets a slot; the slot's sleep is whatever remains
			// after the typing animation.
			const slotDuration = narration / step.commands.length;
			const directives: string[] = [];
			let embeddedSleep = 0;

			for (let c = 0; c < step.commands.length; c++) {
				const cmd = step.commands[c];
				const typingDuration = (cmd.length * TYPING_SPEED_MS) / 1000;
				const sleep = round2(Math.max(slotDuration - typingDuration, MIN_SLEEP));

				directives.push(`Type "${escapeVhs(cmd)}"`, 'Enter');

				// Inter-command sleeps are embedded in the directives array.
				// The final command's sleep becomes the tail sleepSeconds.
				if (c < step.commands.length - 1) {
					directives.push(`Sleep ${sleep.toFixed(2)}s`);
					embeddedSleep += sleep;
				} else {
					// Last command — tail sleep is the larger of the slot
					// remainder and the explicit pause.
					const tailSleep = round2(Math.max(sleep, pause));
					return {
						directives,
						sleepSeconds: tailSleep,
						embeddedSleepSeconds: round2(embeddedSleep),
					};
				}
			}

			// Unreachable — commands has minLength(1) — but satisfies TypeScript.
			return { directives, sleepSeconds: 0, embeddedSleepSeconds: 0 };
		}
	}
}

/**
 * Calculates the total duration of an event (typing time + sleep).
 * Must produce identical values to `stepDuration()` in constants.ts.
 * @param step - Tape step being timed.
 * @param vhs - Precomputed VHS action for the step.
 * @returns Total event duration in seconds.
 */
function eventDuration(step: Step, vhs: VhsAction): number {
	if (step.action === 'chapter') {
		return 0;
	}
	if (step.action === 'type') {
		const typingDuration = (step.command.length * TYPING_SPEED_MS) / 1000;
		return round2(typingDuration + vhs.sleepSeconds);
	}
	if (step.action === 'narrate') {
		const totalTyping = step.commands.reduce(
			(sum, cmd) => sum + (cmd.length * TYPING_SPEED_MS) / 1000, 0
		);
		return round2(totalTyping + (vhs.embeddedSleepSeconds ?? 0) + vhs.sleepSeconds);
	}
	return vhs.sleepSeconds;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Builds a timeline from a parsed tape.
 *
 * Walks `parsed.tape.steps` once, producing a `TimelineEvent` for each step.
 * This replaces the scattered timing logic in `extractTtsScript()`,
 * `stepSleep()`, and the cursor-walking in `cli.ts`.
 *
 * Consumes `narrationOffset` from tape.yaml when calculating audio start
 * times — this is the field the TUI editor writes.
 * @param parsed - Parsed tape data.
 * @returns Timeline with per-step timing, VHS, and narration metadata.
 */
export function buildTimeline(parsed: ParsedTape): Timeline {
	const events: TimelineEvent[] = [];
	let cursor = 0;

	for (let i = 0; i < parsed.tape.steps.length; i++) {
		const step = parsed.tape.steps[i];
		const vhs = buildVhsAction(step);
		const duration = eventDuration(step, vhs);
		const offset = step.action !== 'chapter' ? (step.narrationOffset ?? 0) : 0;

		const narrationText = step.action !== 'chapter' ? step.narration : undefined;
		const narration: TimelineNarration | null = narrationText
			? {
					text: narrationText,
					offset,
					audioStartTime: cursor + offset,
					audioDuration: null,
				}
			: null;

		events.push({
			stepIndex: i,
			startTime: cursor,
			duration,
			vhs,
			narration,
		});

		cursor += duration;
	}

	return { events, totalDuration: cursor };
}

/**
 * Applies real audio durations to the timeline after synthesis.
 *
 * For each synthesised segment, extends the event's sleep if the audio
 * (plus buffer) is longer than the current duration. Then recalculates
 * all start times and resolves narration overlaps.
 *
 * Mutates and returns the same timeline object.
 * @param timeline - Timeline to update in place.
 * @param segments - Synthesised narration segments keyed by step index.
 * @param audioBuffer - Extra silence to preserve after each narration clip.
 * @returns The updated timeline.
 */
export function applyAudioDurations(
	timeline: Timeline,
	segments: SynthesisedSegment[],
	audioBuffer: number
): Timeline {
	// Map synthesised segments by step index for lookup.
	const segByStep = new Map<number, SynthesisedSegment>();
	for (const seg of segments) {
		segByStep.set(seg.stepIndex, seg);
	}

	// Back-fill: extend sleep where audio is longer than the event.
	for (const event of timeline.events) {
		const seg = segByStep.get(event.stepIndex);
		if (!seg || !event.narration) continue;

		event.narration.audioDuration = seg.audioDuration;

		const minDuration = seg.audioDuration + audioBuffer;
		if (event.duration < minDuration) {
			const delta = round2(minDuration - event.duration);
			event.vhs.sleepSeconds = round2(event.vhs.sleepSeconds + delta);
			event.duration = round2(event.duration + delta);
		}
	}

	// Recalculate start times (cascade).
	let cursor = 0;
	for (const event of timeline.events) {
		event.startTime = cursor;
		if (event.narration) {
			event.narration.audioStartTime = cursor + event.narration.offset;
		}
		cursor += event.duration;
	}
	timeline.totalDuration = cursor;

	// Resolve narration overlaps: ensure a minimum gap between audio clips.
	resolveNarrationOverlaps(timeline);

	return timeline;
}

/**
 * Minimum gap in seconds between consecutive narration audio clips.
 * Applied at the audio mixing stage, not at the VHS recording stage.
 */
const NARRATION_GAP = 0.25;

/**
 * Ensures no two narration clips overlap in the audio mix.
 *
 * Walks narrated events in order. If a clip's audio end time bleeds into
 * the next clip's audio start time, pushes the next start time back.
 * Only adjusts `audioStartTime` — does not change VHS timing.
 * @param timeline - Timeline whose narration audio positions should be deconflicted.
 */
function resolveNarrationOverlaps(timeline: Timeline): void {
	const narrated = timeline.events.filter((e) => e.narration !== null);

	for (let i = 1; i < narrated.length; i++) {
		const prev = narrated[i - 1].narration!;
		const curr = narrated[i].narration!;

		if (prev.audioDuration !== null) {
			const minStart = prev.audioStartTime + prev.audioDuration + NARRATION_GAP;
			if (curr.audioStartTime < minStart) {
				curr.audioStartTime = minStart;
			}
		}
	}
}

/**
 * Extracts narration segments from the timeline for Piper synthesis.
 *
 * Also writes a human-readable `script.txt` to `outputDir`.
 * Replaces `extractTtsScript()` from `extractor/tts.ts`.
 * @param timeline - Timeline containing narration events.
 * @param outputDir - Directory where `script.txt` is written.
 * @returns Synthesiser script metadata and extracted narration segments.
 */
export function extractSegments(
	timeline: Timeline,
	outputDir: string
): TtsScript {
	const segments: NarrationSegment[] = [];

	for (const event of timeline.events) {
		if (event.narration) {
			segments.push({
				stepIndex: event.stepIndex,
				startTime: event.narration.audioStartTime,
				text: event.narration.text,
			});
		}
	}

	const scriptFile = join(outputDir, 'script.txt');
	writeFileSync(scriptFile, formatScript(segments), 'utf8');

	return { scriptFile, segments };
}

/**
 * Formats narration segments as a human-readable reference file.
 * @param segments - Narration segments to render.
 * @returns Plain-text script contents.
 */
function formatScript(segments: NarrationSegment[]): string {
	if (segments.length === 0) {
		return '(no narration)\n';
	}
	return (
		segments
			.map((s) => `[${s.startTime.toFixed(2)}s] ${s.text}`)
			.join('\n') + '\n'
	);
}

/**
 * Generates a VHS `.tape` file from the timeline.
 *
 * Replaces `generateVhsTape()` from `generator/vhs.ts`. Reads VHS
 * directives and sleep values directly from timeline events — no
 * parallel calculation needed.
 * @param timeline - Timeline containing authoritative VHS actions.
 * @param parsed - Parsed tape metadata used to build the VHS header.
 * @returns VHS tape contents.
 */
export function generateVhsFromTimeline(
	timeline: Timeline,
	parsed: ParsedTape
): string {
	const { tape } = parsed;
	const vhsOverrides = parsed.meta.vhs;
	const lines: string[] = [];

	// ── Header ───────────────────────────────────────────────────────────────

	lines.push(`Output ./${basename(tape.output)}.raw.mp4`);
	lines.push('');
	lines.push(`Set Width ${VIDEO_WIDTH}`);
	lines.push(`Set Height ${vhsOverrides?.height ?? TERMINAL_HEIGHT}`);
	lines.push(`Set Framerate ${FRAMERATE}`);
	lines.push(`Set FontSize ${vhsOverrides?.fontSize ?? TERMINAL_FONT_SIZE}`);
	lines.push(`Set FontFamily "${TERMINAL_FONT}"`);
	lines.push(`Set Theme '${vhsOverrides?.theme ?? TERMINAL_THEME}'`);
	lines.push(`Set WindowBar ${TERMINAL_WINDOW_BAR}`);
	lines.push(`Set BorderRadius ${TERMINAL_BORDER_RADIUS}`);
	lines.push(`Set Margin ${TERMINAL_MARGIN}`);
	lines.push(`Set MarginFill "${TERMINAL_MARGIN_FILL}"`);
	lines.push(`Set Shell "${SHELL}"`);
	lines.push(`Set TypingSpeed ${vhsOverrides?.typingSpeed ?? TYPING_SPEED}`);
	lines.push('');

	// ── Events ───────────────────────────────────────────────────────────────

	for (const event of timeline.events) {
		const step = parsed.tape.steps[event.stepIndex];
		if (step.action === 'chapter') continue;

		const { directives, sleepSeconds } = event.vhs;
		for (const d of directives) {
			lines.push(d);
		}
		if (sleepSeconds > 0 || directives.length === 0) {
			lines.push(`Sleep ${sleepSeconds.toFixed(2)}s`);
		}
		lines.push('');
	}

	return lines.join('\n');
}

/**
 * Converts synthesised segments so their start times match the timeline.
 *
 * After back-fill, the timeline has the authoritative start times. This
 * function updates synthesised segment start times to match, and resolves
 * any remaining audio overlaps.
 * @param timeline - Timeline containing authoritative narration start times.
 * @param segments - Synthesised narration segments to realign.
 * @returns Segments with start times synchronized to the timeline.
 */
export function syncSegmentsToTimeline(
	timeline: Timeline,
	segments: SynthesisedSegment[]
): SynthesisedSegment[] {
	const narrated = timeline.events.filter((e) => e.narration !== null);
	return segments.map((seg, i) => ({
		...seg,
		startTime: narrated[i].narration!.audioStartTime,
	}));
}
