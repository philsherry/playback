/**
 * @module generator/vhs
 *
 * Generates a VHS `.tape` file from a {@link ParsedTape}.
 *
 * A `.tape` file is a plain-text script for the
 * [VHS](https://github.com/charmbracelet/vhs) terminal recorder. This module
 * translates the structured `tape.yaml` step definitions into the VHS DSL,
 * applying all visual settings (font, theme, dimensions) from `constants.ts`.
 *
 * The generated tape is written to disk by {@link runVhs} and then passed to
 * the `vhs` binary — this module only produces the file content as a string.
 */

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
	narrationDuration
} from '../constants';
import { basename } from 'node:path';
import type { ParsedTape } from '../types';
import type { Step } from '../schema';
import { escapeVhs } from '../utilities/escape';

/**
 * Default pause in seconds applied when a step has no explicit `pause` value.
 *
 * Short enough not to feel slow, long enough for the viewer to read the
 * terminal output before the next step begins.
 */
const DEFAULT_PAUSE = 0.5;

/**
 * Shell used for the VHS terminal session.
 * zsh is the default macOS shell from Catalina onwards.
 */
const SHELL = 'zsh';

/**
 * Generates the full contents of a VHS `.tape` file for the given parsed tape.
 *
 * The tape sets up all visual properties (dimensions, font, theme, window
 * style) in a header block, then emits one or more VHS commands per step.
 * The `Output` directive uses only the filename — no directory — because VHS
 * writes relative to its working directory, which {@link runVhs} sets to an
 * isolated temp directory.
 * @param parsed - Validated tape and meta data returned by {@link parseTape}.
 * @returns The complete `.tape` file contents as a string.
 */
export function generateVhsTape(parsed: ParsedTape): string {
	const { tape } = parsed;
	const lines: string[] = [];

	// ── Header ────────────────────────────────────────────────────────────────

	// Use ./ prefix so VHS treats it as a valid file path — bare filenames
	// starting with digits confuse the VHS parser. VHS writes relative to its
	// cwd (the isolated temp dir); the runner moves the file after recording.
	const vhsOverrides = parsed.meta.vhs;

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

	// ── Steps ─────────────────────────────────────────────────────────────────

	for (const step of tape.steps) {
		lines.push(...generateStep(step));
		lines.push('');
	}

	return lines.join('\n');
}

/**
 * Calculates the `Sleep` duration in seconds for a tape step.
 *
 * The sleep must be at least as long as the estimated speaking time so the
 * video doesn't outrun the audio narration. For `type` steps the typing
 * animation itself consumes part of that time, so only the remainder needs
 * to be slept. The result is always at least 0.1 s to keep VHS happy.
 *
 * **Why fractional seconds, not `Math.ceil`?**
 *
 * The original implementation used `Math.ceil` to round sleep values up to
 * the nearest whole second. This seemed safe — surely more time is better
 * than less? In practice it caused systematic drift. A step with `pause: 0.3`
 * rounded up to `Sleep 1s`; thirteen such key-press steps in `demo-tui`
 * accumulated ~9 extra seconds of video time before the audio timeline caught
 * up, pushing narration 9 seconds behind the matching on-screen action.
 *
 * VHS accepts fractional durations (`Sleep 0.30s`) via Go's
 * `time.ParseDuration`, so there is no minimum-integer constraint. We round
 * to two decimal places to keep the generated `.tape` file readable while
 * preserving sub-second precision.
 *
 * `stepDuration` in `constants.ts` uses the same rounding so that audio
 * start times computed from that function agree exactly with the real VHS
 * timeline — no compounding error over many steps.
 * @param step - The tape step to calculate sleep for.
 * @returns Sleep duration in seconds, rounded to two decimal places.
 */
function stepSleep(step: Step): number {
	const pause = step.pause ?? DEFAULT_PAUSE;
	const narration = step.narration ? narrationDuration(step.narration) : 0;

	if (step.action === 'type') {
		// Typing animation runs concurrently with the first part of the pause,
		// so subtract it from the narration floor before taking the max.
		const typingDuration = (step.command.length * TYPING_SPEED_MS) / 1000;
		return Math.round(Math.max(pause, narration - typingDuration, 0.1) * 100) / 100;
	}

	// narrate steps are handled entirely by generateStep — stepSleep is not
	// called for them, but return 0 for safety.
	if (step.action === 'narrate') return 0;

	// For run / key / comment steps the full pause is the sleep.
	return Math.round(Math.max(pause, narration) * 100) / 100;
}

/**
 * Translates a single tape step into one or more VHS tape directives.
 *
 * - `type` → `Type "<command>"`, `Enter`, `Sleep <n>s`
 * - `key`  → `Type "<keystroke>"`, `Sleep <n>s` (no Enter — for interactive TUIs)
 * - `run`  → `Sleep <n>s` (command was already entered by the preceding `type` step)
 * - `comment` → `Sleep <n>s`, or nothing if the sleep would be zero
 * @param step - A validated tape step.
 * @returns Array of VHS directive lines for this step.
 */
function generateStep(step: Step): string[] {
	const sleep = stepSleep(step);

	switch (step.action) {
		case 'type':
			return [`Type "${escapeVhs(step.command)}"`, 'Enter', `Sleep ${sleep.toFixed(2)}s`];

		case 'key': {
			// Send a keystroke without Enter — for interactive TUI control.
			// Special keys (Escape, Tab, etc.) are VHS commands, not Type.
			const special = ['Escape', 'Tab', 'Space', 'Backspace', 'Up', 'Down', 'Left', 'Right', 'Enter'];
			if (special.includes(step.command)) {
				return [step.command, `Sleep ${sleep.toFixed(2)}s`];
			}
			return [`Type "${escapeVhs(step.command)}"`, `Sleep ${sleep.toFixed(2)}s`];
		}

		case 'run':
			return [`Sleep ${sleep.toFixed(2)}s`];

		case 'comment':
			// No terminal action — just a pause to give the voiceover room.
			return sleep > 0 ? [`Sleep ${sleep.toFixed(2)}s`] : [];

		case 'narrate': {
			// Commands fire during the narration, evenly spaced.
			const narration = step.narration ? narrationDuration(step.narration) : 0;
			const slotDuration = narration / step.commands.length;
			const lines: string[] = [];
			const pause = step.pause ?? DEFAULT_PAUSE;

			for (let c = 0; c < step.commands.length; c++) {
				const cmd = step.commands[c];
				const typingDuration = (cmd.length * TYPING_SPEED_MS) / 1000;
				const slotSleep = Math.round(Math.max(slotDuration - typingDuration, 0.1) * 100) / 100;

				lines.push(`Type "${escapeVhs(cmd)}"`, 'Enter');

				if (c < step.commands.length - 1) {
					lines.push(`Sleep ${slotSleep.toFixed(2)}s`);
				} else {
					const tailSleep = Math.round(Math.max(slotSleep, pause) * 100) / 100;
					lines.push(`Sleep ${tailSleep.toFixed(2)}s`);
				}
			}
			return lines;
		}
	}

	// Exhaustiveness guard — should never reach here with valid steps.
	return [];
}

