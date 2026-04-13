/**
 * @module schema/meta
 *
 * Valibot schema and TypeScript types for `meta.yaml` — the per-episode
 * metadata file that sits alongside every `tape.yaml`.
 *
 * `meta.yaml` is optional but strongly recommended: it provides the episode
 * title, voice selection, poster frame, and series metadata used by the
 * playlist and the downstream video site.
 */

import * as v from 'valibot';
import { getVoiceIds } from '../voices';

/** Union of valid voice identifiers. */
export type Voice = string;

/** Re-export for use in tests and other modules. */
export { getVoiceIds };

/**
 * Valibot schema for `meta.yaml`.
 *
 * All fields are optional except `title`. Unrecognised fields are stripped
 * by valibot during parsing.
 */
export const MetaSchema = v.object({
	/** Creator credit embedded in video metadata. Defaults to `"Created by Playback"`. */
	artist: v.optional(v.string()),
	/** Human-readable description of the episode, used in video metadata. */
	description: v.optional(v.string()),
	/** 1-indexed episode number within the series. Used for ordering and display. */
	episode: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	/**
	 * Working directory for VHS recording, relative to the project root.
	 *
	 * When set, `runVhs()` runs VHS from this directory instead of the
	 * default isolated `/tmp/playback/` scratch space. Use `"."` for
	 * tapes that launch project commands (e.g. `npm run playback:demo`).
	 *
	 * Workspace sandbox symlinks are still created in the working directory
	 * when applicable.
	 */
	/**
	 * When `true`, the pipeline skips the audio back-fill step — the author's
	 * `pause` values in tape.yaml are authoritative and will not be extended
	 * to fit synthesised audio durations.
	 *
	 * Use this for choreographed tapes (like the TUI demo) where actions
	 * must fire during narration, not after it. Normal tapes should leave
	 * this unset so the pipeline automatically adjusts timing.
	 */
	fixedTiming: v.optional(v.boolean()),
	/** BCP-47 locale tag for the episode (e.g. `"en-GB"`). Defaults to the voice locale. */
	locale: v.optional(v.string()),
	/**
	 * 1-indexed step number to use as the auto-generated poster frame.
	 *
	 * The frame is captured at the end of that step — after its output is
	 * visible on screen — so the poster shows a meaningful terminal state.
	 * Ignored if a `poster.png` file is present in the tape directory.
	 */
	poster: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	/** Series slug — matches the directory prefix (e.g. `"s1-getting-started"`). */
	series: v.optional(v.string()),
	/** Taxonomy tags for the episode (e.g. `["accessibility", "components"]`). */
	tags: v.optional(v.array(v.string())),
	/** Human-readable episode title. Displayed in the video player and playlist. */
	title: v.string(),
	/** Semantic version of the skills file used in this recording (e.g. `"1.2.0"`). */
	version: v.optional(v.string()),
	/**
	 * Optional VHS recording overrides.
	 *
	 * These override the default constants from `src/constants.ts` for this
	 * tape only. Useful for tapes that record a full-screen TUI and need
	 * more vertical space, a smaller font, or a different theme.
	 */
	vhs: v.optional(v.object({
		/** Font size in pixels. Default: 16 (TERMINAL_FONT_SIZE). */
		fontSize: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
		/** Recording height in pixels. Default: 660 (TERMINAL_HEIGHT). */
		height: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
		/** Shell for the VHS terminal session (e.g. `"bash"`). Default: `"zsh"`. Must not contain double-quote characters. */
		shell: v.optional(v.pipe(v.string(), v.check((s) => !s.includes('"'), 'vhs.shell cannot contain double-quote characters — use a shell path without quotes'))),
		/** JSON theme string for VHS `Set Theme`. Default: Amber theme. */
		theme: v.optional(v.string()),
		/** Typing speed (e.g. `"50ms"`). Default: `"75ms"`. */
		typingSpeed: v.optional(v.string()),
	})),
	vhsCwd: v.optional(v.string()),
	/**
	 * Voice models to use for narration synthesis.
	 *
	 * One output video is generated per voice. Useful for producing both a
	 * male and female-narrated version of the same episode. Must contain at
	 * least one entry. Defaults to `['northern_english_male']` if omitted.
	 */
	voices: v.optional(
		v.pipe(
			v.array(
				v.pipe(
					v.string(),
					v.check(
						(val) => getVoiceIds().includes(val),
						'Must be a voice from voices.yaml',
					),
				),
			),
			v.minLength(1),
		),
		['northern_english_male'],
	),
});

/** Validated and inferred type for a parsed `meta.yaml` file. */
export type Meta = v.InferOutput<typeof MetaSchema>;
