/**
 * @module schema/tape
 *
 * Valibot schema and TypeScript types for `tape.yaml` — the per-episode
 * recording script that drives the VHS terminal recorder.
 *
 * A tape consists of an ordered list of steps. Each step has an `action`
 * discriminant and optional `narration` and `pause` fields:
 *
 * - **`type`** — types a command into the terminal and presses Enter.
 * - **`key`** — sends a keystroke without pressing Enter (for interactive TUIs).
 * - **`run`** — waits for the previous command to complete (no new input).
 * - **`comment`** — pauses for narration without any terminal interaction.
 * - **`chapter`** — inserts a named chapter marker; no terminal interaction or narration.
 *
 * Example `tape.yaml`:
 * ```yaml
 * title: Installing govuk-design-system-skills
 * output: s1-getting-started/01-install-and-explore
 * steps:
 *   - action: type
 *     command: npm install --save-dev govuk-design-system-skills
 *     narration: First, install the package from npm.
 *   - action: run
 *     narration: npm downloads and installs the package.
 *     pause: 3
 * ```
 */

import * as v from 'valibot';

/**
 * Validates that a command string contains no double-quote characters.
 *
 * VHS `Type "..."` strings have no escape sequence for `"` — the parser
 * terminates the string at the first unescaped double quote. Use single
 * quotes inside commands instead.
 */
const noDoubleQuotes = v.pipe(
	v.string(),
	v.check((s) => !s.includes('"'), 'Commands cannot contain double quotes — use single quotes instead.')
);

/**
 * Optional pause duration shared by all step types.
 * Must be a non-negative number of seconds.
 * Defaults to 0.5 s when omitted; see `DEFAULT_PAUSE` in `generator/vhs.ts`.
 */
const pause = v.optional(v.pipe(v.number(), v.minValue(0)));

/**
 * Optional narration text shared by all step types.
 * When present, piper synthesises speech for this segment and the step's
 * sleep duration is extended to cover the estimated speaking time.
 */
const narration = v.optional(v.string());

/**
 * Optional narration offset in seconds, written by the TUI timing editor.
 *
 * Positive values delay the narration start relative to the step's visual
 * start time; negative values start the narration before the step begins
 * (overlapping with the previous step's audio tail).
 *
 * Consumed by `buildTimeline()` when calculating `audioStartTime` for the
 * ffmpeg mix. Ignored by the VHS recording — it only affects audio placement.
 */
const narrationOffset = v.optional(v.number());

/**
 * A `type` step — types a shell command into the terminal and presses Enter.
 *
 * The command is typed at {@link TYPING_SPEED} ms/character so the viewer
 * can follow what is being entered. After Enter, VHS sleeps for `pause`
 * seconds (or the narration duration, whichever is longer).
 */
const TypeStep = v.object({
	action: v.literal('type'),
	/** Shell command to type. Special characters are escaped by `escapeVhs`. Must not contain `"`. */
	command: noDoubleQuotes,
	narration,
	narrationOffset,
	pause,
});

/**
 * A `key` step — sends a keystroke without pressing Enter.
 *
 * Use this for driving interactive TUI applications where individual
 * keystrokes control the interface (e.g. `j` to navigate, `s` to save).
 * Supports special keys via VHS names: `Escape`, `Tab`, `Space`,
 * `Backspace`, `Up`, `Down`, `Left`, `Right`, `Enter`.
 */
const KeyStep = v.object({
	action: v.literal('key'),
	/** Keystroke to send. A single character or a VHS key name. Must not contain `"`. */
	command: noDoubleQuotes,
	narration,
	narrationOffset,
	pause,
});

/**
 * A `run` step — waits for the previously typed command to complete.
 *
 * No new input is sent to the terminal. Use this after a `type` step whose
 * command runs for a non-specified amount of time (e.g. `npm install`).
 */
const RunStep = v.object({
	action: v.literal('run'),
	narration,
	narrationOffset,
	pause,
});

/**
 * A `comment` step — pauses to allow narration without any terminal interaction.
 *
 * Useful for explaining context between commands or summarising what
 * happened on screen. No terminal input or output is produced.
 */
const CommentStep = v.object({
	action: v.literal('comment'),
	narration,
	narrationOffset,
	pause,
});

/**
 * A `chapter` step — inserts a named chapter marker into the video.
 *
 * Produces no terminal input, no narration, and zero duration in the
 * timeline. When any `chapter` step is present, `generateChapters` uses
 * only those steps (with their `title` fields) instead of auto-generating
 * chapter titles from all events.
 */
const ChapterStep = v.object({
	action: v.literal('chapter'),
	/** Chapter title embedded into the FFMETADATA1 chapter file. */
	title: v.string(),
});

/**
 * A `narrate` step — starts narration immediately while firing commands
 * concurrently underneath.
 *
 * Commands are spaced evenly across the estimated narration duration. Each
 * command is typed and entered like a normal `type` step, but the narration
 * audio plays from the start of the step rather than waiting for commands
 * to complete.
 *
 * Use this for "cold open" sequences where you want to explain context
 * while navigating the terminal — e.g. listing a directory and showing
 * file metadata while the voiceover introduces the topic.
 *
 * `narration` is required (a `narrate` step without narration is meaningless).
 * `commands` must contain at least one entry.
 */
const NarrateStep = v.object({
	action: v.literal('narrate'),
	/** Shell commands to type and execute during the narration. Must not contain `"`. */
	commands: v.pipe(v.array(noDoubleQuotes), v.minLength(1)),
	/** Narration text — required for `narrate` steps. */
	narration: v.string(),
	narrationOffset,
	pause,
});

/**
 * Discriminated union of all valid tape step types.
 * The `action` field is the discriminant.
 */
export const StepSchema = v.union([TypeStep, KeyStep, RunStep, CommentStep, NarrateStep, ChapterStep]);

/**
 * Schema for the top-level `tape.yaml` document.
 */
export const TapeSchema = v.object({
	/**
	 * Output path relative to `outputDir` (configured in `playback.config.ts`).
	 *
	 * Used as the subdirectory name for all output files (`.tape`, `.raw.mp4`,
	 * `.mp4`, `.gif`, caption files). Should match the tape's directory path
	 * under `tapes/`, e.g. `"s1-getting-started/01-install-and-explore"`.
	 */
	output: v.string(),
	/** Ordered list of steps to execute. Must contain at least one step. */
	steps: v.pipe(v.array(StepSchema), v.minLength(1)),
	/** Human-readable episode title (also written to the banner in the recording). */
	title: v.string(),
});

/** Validated and inferred type for a single tape step. */
export type Step = v.InferOutput<typeof StepSchema>;

/** Validated and inferred type for a parsed `tape.yaml` document. */
export type Tape = v.InferOutput<typeof TapeSchema>;
