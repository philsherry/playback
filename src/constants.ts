import { execFileSync } from 'node:child_process';
import type { Step } from './schema/tape';
import { WHITESPACE_SPLIT } from './utilities/regex';

/**
 * Video output dimensions.
 *
 * 1280×720 (16:9) is the final output resolution for all videos. It is
 * broadly compatible with GitHub Pages video embeds, standard video players,
 * and any future hosting.
 *
 * The frame is divided into two areas:
 *   - Terminal area: 1280×660 — recorded by VHS
 *   - Caption bar:   1280×60  — solid black strip added by ffmpeg
 *
 * Keeping captions in a dedicated bar prevents them from overlapping terminal
 * output, which is especially important for text-heavy recordings where
 * commands and output fill most of the frame.
 */
/**
 * Absolute path to the `ffmpeg-full` Homebrew keg's `bin` directory.
 *
 * `ffmpeg-full` is not linked into `/usr/local/bin` by default (it conflicts
 * with the standard `ffmpeg` formula), so its binaries (`ffmpeg`, `ffprobe`,
 * etc.) are only available via the keg path. We prepend this to `PATH` when
 * spawning child processes that need ffmpeg/ffprobe.
 *
 * The Homebrew prefix differs by architecture: `/opt/homebrew` on Apple
 * Silicon, `/usr/local` on Intel. We resolve it at startup via `brew --prefix`.
 */
const HOMEBREW_PREFIX = (() => {
	try {
		return execFileSync('brew', ['--prefix'], { encoding: 'utf8' }).trim();
	} catch {
		return '/usr/local';
	}
})();
export const FFMPEG_FULL_BIN = `${HOMEBREW_PREFIX}/opt/ffmpeg-full/bin`;

export const VIDEO_WIDTH = 1280;
export const VIDEO_HEIGHT = 720;
export const TERMINAL_HEIGHT = 660;
export const CAPTION_BAR_HEIGHT = 60;

/**
 * GIF output dimensions.
 *
 * GIFs are downscaled from the recording resolution for README and docs
 * embedding. A 1280×720 GIF at any reasonable framerate would be tens of
 * megabytes — too large to embed comfortably in a GitHub README. 800×450
 * maintains the 16:9 ratio, stays sharp enough to read terminal output, and
 * produces a manageable file size.
 */
export const GIF_WIDTH = 800;
export const GIF_HEIGHT = 450;

/**
 * Recording framerate.
 *
 * 30fps is the standard for screen recordings. Higher framerates (60fps)
 * would increase file sizes without meaningful benefit for terminal content,
 * which changes relatively slowly compared to motion video.
 */
export const FRAMERATE = 30;

/**
 * Terminal font family for VHS recordings.
 *
 * Fira Code NF (Nerd Font variant) provides ligatures, powerline symbols,
 * and excellent readability at the font sizes used in terminal recordings.
 * Installed via: brew install --cask font-fira-code-nerd-font
 *
 * If the font is not installed, VHS falls back to the system monospace font.
 * Caption font styling is a player concern — apply via ::cue CSS in the
 * Svelte site rather than embedding font instructions in the VTT file.
 */
export const TERMINAL_FONT = 'FiraCode Nerd Font Mono';
export const TERMINAL_FONT_SIZE = 16;
export const TERMINAL_BORDER_RADIUS = 10;
export const TERMINAL_MARGIN = 20;
export const TERMINAL_MARGIN_FILL = '#9ece6a';
export const TERMINAL_WINDOW_BAR = 'Colorful';

/**
 * Caption burn-in styling passed to ffmpeg's subtitles filter via force_style.
 *
 * Colour is ASS format: &HAABBGGRR (alpha, blue, green, red).
 * Alpha: 00 = fully opaque, FF = fully transparent.
 * #FF9900 amber → &H000099FF
 * BackColour &H1A000000 = black at 90% opacity (0x1A ≈ 10% transparent).
 *
 * Alignment 2 = bottom-centre (standard subtitle position, sits in the
 * caption bar added by the pad filter).
 * MarginV controls vertical offset from the bottom of the frame.
 */
export const CAPTION_FONT = 'Arial';
export const CAPTION_FONT_SIZE = 18;
export const CAPTION_COLOUR = '&H00FFFFFF';
export const CAPTION_BACK_COLOUR = '&H1A000000';
export const CAPTION_MARGIN_V = 10;

/**
 * Amber terminal theme for VHS recordings.
 *
 * Evokes a classic amber phosphor CRT monitor. Foreground is #FF9900;
 * background is near-black with a faint warm tint. ANSI colours are mapped
 * to amber/brown variants so syntax highlighting stays coherent.
 *
 * Passed to VHS as `Set Theme <json>`.
 */
export const TERMINAL_THEME = JSON.stringify({
	background: '#1A0F00',
	// ANSI 0–7 (normal)
	color0: '#1A0F00',
	color1: '#CC5500',
	color2: '#CC7700',
	color3: '#FF9900',
	color4: '#FFAA33',
	color5: '#CC6600',
	color6: '#FFBB55',
	color7: '#FFD080',
	// ANSI 8–15 (bright)
	color8: '#3D2200',
	color9: '#FF6600',
	color10: '#FFAA00',
	color11: '#FFB833',
	color12: '#FFC84D',
	color13: '#FF8800',
	color14: '#FFD080',
	color15: '#FFF0CC',
	cursor: '#FF9900',
	foreground: '#FF9900',
	name: 'Amber'
});

/**
 * Typing speed for VHS terminal recordings.
 *
 * TYPING_SPEED is the VHS tape string value.
 * TYPING_SPEED_MS is the numeric equivalent used for timing calculations
 * in the TTS script extractor — allows accurate estimation of how long
 * each `type` step takes before the narration for the next step begins.
 *
 * 75ms per character feels natural — fast enough not to be tedious,
 * slow enough for the viewer to follow what is being typed.
 */
export const TYPING_SPEED = '75ms';
export const TYPING_SPEED_MS = 75;

/**
 * Estimated speech rate and minimum clip duration for narration timing.
 * Used by the TTS extractor, VHS tape generator, and caption generator
 * to ensure consistent timing across all three.
 */
export const WORDS_PER_MINUTE = 150;
export const MIN_NARRATION_DURATION = 1.5;

/**
 * Estimates how long narration text takes to speak, in seconds.
 * Shared between the TTS extractor, VHS generator, and caption generator
 * so all three agree on step durations.
 * @param text - The narration text to estimate duration for.
 * @returns Duration in seconds.
 */
export function narrationDuration(text: string): number {
	const words = text.trim().split(WHITESPACE_SPLIT).length;
	return Math.max(MIN_NARRATION_DURATION, (words / WORDS_PER_MINUTE) * 60);
}

/**
 * Estimates the total duration of a step in seconds.
 *
 * The value mirrors what VHS will actually record:
 * - For `type` steps: typing time + sleep that follows.
 * - For all other steps: sleep alone.
 *
 * **Why this must match `stepSleep` exactly:**
 *
 * `stepDuration` drives the audio start-time calculation in
 * `extractTtsScript`. If it disagrees with what VHS actually records, narration
 * segments are placed at the wrong positions in the timeline and audio drifts
 * relative to the video — even if each individual clip is the right length.
 *
 * Both the sleep value and the typing time component use the same two-decimal-
 * place rounding as `stepSleep` in `generator/vhs.ts`. Rounding at the same
 * precision means accumulated error stays below 0.01 s per step rather than
 * compounding across a long tape.
 *
 * **Why not `Math.ceil` (what we used before):**
 *
 * Ceiling rounding inflated every sub-second pause to at least 1 s. This made
 * VHS record more time than `stepDuration` predicted, so the video advanced
 * faster than the audio timeline calculated here. On `demo-tui`, thirteen
 * key-press steps with `pause: 0.3` each contributed 0.7 s of phantom time,
 * totalling ~9 s of drift before the first narrated section finished.
 *
 * Shared between the TTS extractor and VHS tape generator so both agree on
 * how long each step occupies in the timeline.
 * @param step - The step to estimate duration for.
 * @returns Duration in seconds, rounded to two decimal places.
 */
export function stepDuration(step: Step): number {
	if (step.action === 'chapter') {
		return 0;
	}

	const pause = step.pause ?? 0.5;
	const narration = step.narration ? narrationDuration(step.narration) : 0;

	if (step.action === 'type') {
		// Typing runs first; only the remainder (sleep) follows.
		// Mirror the exact calculation in stepSleep so both functions agree.
		const typingDuration = (step.command.length * TYPING_SPEED_MS) / 1000;
		const sleep = Math.round(Math.max(pause, narration - typingDuration, 0.1) * 100) / 100;
		return Math.round((typingDuration + sleep) * 100) / 100;
	}

	if (step.action === 'narrate') {
		// Commands are spaced evenly across the narration duration.
		// Mirror the slot logic in timeline/index.ts buildVhsAction.
		const slotDuration = narration / step.commands.length;
		let total = 0;
		for (let c = 0; c < step.commands.length; c++) {
			const typingDuration = (step.commands[c].length * TYPING_SPEED_MS) / 1000;
			const sleep = Math.round(Math.max(slotDuration - typingDuration, 0.1) * 100) / 100;
			total += typingDuration + sleep;
		}
		// Last slot uses max(sleep, pause) for the tail.
		const lastTyping = (step.commands[step.commands.length - 1].length * TYPING_SPEED_MS) / 1000;
		const lastSlotSleep = Math.round(Math.max(slotDuration - lastTyping, 0.1) * 100) / 100;
		const tailAdjustment = Math.round(Math.max(0, pause - lastSlotSleep) * 100) / 100;
		return Math.round((total + tailAdjustment) * 100) / 100;
	}

	return Math.round(Math.max(pause, narration) * 100) / 100;
}

/**
 * Converts a 1-indexed step number to the timestamp (in seconds) at the end
 * of that step — i.e. the moment when the step's output is fully visible.
 * Returns 0 if stepNumber is out of range.
 * @param steps - The array of steps from the tape.
 * @param stepNumber - 1-indexed step number to convert.
 * @returns Elapsed time in seconds up to the end of that step.
 */
export function stepToTime(steps: Step[], stepNumber: number): number {
	const count = Math.min(stepNumber, steps.length);
	let t = 0;
	for (let i = 0; i < count; i++) {
		t += stepDuration(steps[i]);
	}
	return t;
}
