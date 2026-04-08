/**
 * @module types
 *
 * Shared TypeScript types for the playback pipeline.
 *
 * Each section corresponds to a pipeline stage. Types flow downstream:
 * `ParsedTape` is produced by the parser and consumed by every subsequent
 * stage; `SynthesisedSegment` extends `NarrationSegment` with audio data
 * added by the piper runner.
 *
 * This module contains only type declarations — no runtime values.
 */

import type * as v from 'valibot';
import type { Meta, Tape } from '../schema';

// ── Parser ─────────────────────────────────────────────────────────────────

/**
 * The result of parsing a tape directory.
 *
 * Produced by {@link parseTape} and passed to every downstream pipeline stage.
 */
export type ParsedTape = {
	/** Absolute path to the tape's source directory. */
	dir: string;
	/** Validated metadata from `meta.yaml`. */
	meta: Meta;
	/**
	 * Absolute path to a `poster.png` provided in the tape directory,
	 * or `null` if none is present. Takes precedence over the auto-generated poster.
	 */
	posterFile: string | null;
	/** Validated tape definition from `tape.yaml`. */
	tape: Tape;
};

/** Valibot issue array from a failed schema parse — used in {@link ParseError}. */
export type ParseErrorIssues = v.BaseIssue<unknown>[];

// ── VHS runner ─────────────────────────────────────────────────────────────

/**
 * Paths produced by {@link runVhs} after a successful recording.
 */
export type VhsResult = {
	/** Absolute path to the raw `.mp4` recording written by VHS. */
	rawMp4: string;
	/** Absolute path to the generated `.tape` file passed to VHS. */
	tapeFile: string;
};

// ── TTS extractor ──────────────────────────────────────────────────────────

/**
 * A single narration segment extracted from a tape step.
 *
 * Start times are estimated from {@link stepDuration} before synthesis.
 * After synthesis, times may be adjusted by `resolveStartTimes` to prevent
 * audio segments from overlapping.
 */
export type NarrationSegment = {
	/** Zero-based index of the originating step within `tape.steps`. */
	stepIndex: number;
	/** Estimated start time in seconds from the beginning of the video. */
	startTime: number;
	/** Narration text to synthesise, before phonetic substitutions are applied. */
	text: string;
};

/**
 * The TTS script produced by {@link extractTtsScript}.
 */
export type TtsScript = {
	/** Extracted narration segments with estimated start times. */
	segments: NarrationSegment[];
	/** Absolute path to the human-readable `script.txt` reference file. */
	scriptFile: string;
};

// ── Piper runner ───────────────────────────────────────────────────────────

/**
 * A narration segment after audio synthesis by {@link runPiper}.
 *
 * Extends {@link NarrationSegment} with the resulting audio file path and its
 * measured duration. `startTime` may be adjusted by `resolveStartTimes` after
 * synthesis if the previous segment's audio runs longer than estimated.
 */
export type SynthesisedSegment = NarrationSegment & {
	/** Absolute path to the generated `.wav` file for this segment. */
	audioFile: string;
	/**
	 * Actual duration of the synthesised audio in seconds, measured by
	 * `ffprobe` after synthesis — not the estimated value from `narrationDuration`.
	 */
	audioDuration: number;
};

// ── Caption generator ──────────────────────────────────────────────────────

/**
 * Paths to the three caption files written by {@link generateCaptions}.
 *
 * - `assFile` — burned into the video by ffmpeg's `subtitles` filter.
 * - `vttFile` — served alongside the video for accessible in-player captions.
 * - `srtFile` — compatibility fallback for players without WebVTT support.
 */
export type CaptionFiles = {
	/** Absolute path to the ASS subtitle file. */
	assFile: string;
	/** Absolute path to the SRT subtitle file. */
	srtFile: string;
	/** Absolute path to the WebVTT subtitle file. */
	vttFile: string;
};

// ── Video metadata ────────────────────────────────────────────────────────

/**
 * Metadata tags embedded into the final `.mp4` via ffmpeg `-metadata` flags.
 *
 * Values come from `meta.yaml` fields. The `artist` tag defaults to
 * `"Created by Playback"` when not overridden.
 */
export type VideoMetadata = {
	/** Episode title (`meta.yaml` → `title`). */
	title: string;
	/** Episode description (`meta.yaml` → `description`). */
	comment?: string;
	/** Creator credit — defaults to `"Created by Playback"`. */
	artist: string;
	/** Series name (`meta.yaml` → `series`). */
	album?: string;
	/** Episode number (`meta.yaml` → `episode`). */
	track?: number;
	/** BCP-47 locale (`meta.yaml` → `locale`). */
	language?: string;
};

// ── ffmpeg runner ──────────────────────────────────────────────────────────

/**
 * Output paths produced by {@link runFfmpeg} after a successful render.
 */
export type FfmpegResult = {
	/** Absolute path to the animated `.gif` for README/docs embedding. */
	gifFile: string;
	/** Absolute path to the final `.mp4` with audio and subtitles. */
	mp4File: string;
	/**
	 * Absolute path to the poster `.png`, or `null` if no poster step was
	 * specified in `meta.yaml` and no `poster.png` was present in the tape directory.
	 */
	posterFile: string | null;
	/** Absolute path to the `.mkv` file, if `--mkv` was requested. */
	mkvFile?: string;
};
