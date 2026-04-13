import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	CAPTION_BACK_COLOUR,
	CAPTION_BAR_HEIGHT,
	CAPTION_COLOUR,
	CAPTION_FONT,
	CAPTION_FONT_SIZE,
	CAPTION_MARGIN_V,
	CAPTION_MAX_LINE_WIDTH,
	CAPTION_MAX_LINES,
	VIDEO_HEIGHT,
	VIDEO_WIDTH,
} from '../constants';
import type { CaptionFiles, SynthesisedSegment } from '../types';

/**
 * Vertical position of captions as a percentage of video height.
 *
 * Captions sit in the dedicated caption bar at the bottom of the frame.
 * The bar is CAPTION_BAR_HEIGHT px tall; the line position places the
 * caption at the top of that bar so text doesn't clip at the very bottom.
 *
 * (VIDEO_HEIGHT - CAPTION_BAR_HEIGHT) / VIDEO_HEIGHT = ~91.7%, rounded to 92.
 */
const CAPTION_LINE = Math.round(
	((VIDEO_HEIGHT - CAPTION_BAR_HEIGHT) / VIDEO_HEIGHT) * 100
);


/**
 * Formats a duration in seconds as a WebVTT/SRT timestamp (`HH:MM:SS.mmm`).
 * @param seconds - Duration in seconds.
 * @returns Timestamp string in `HH:MM:SS.mmm` format.
 */
function formatTimestamp(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
}

/** A single caption cue with start and end times and display text. */
type Cue = {
	end: number;
	start: number;
	text: string;
};

/**
 * Converts synthesised segments to caption cues.
 *
 * End time for each cue is derived from the segment's measured `audioDuration`
 * (recorded by ffprobe after synthesis) so cues never exceed the actual audio.
 * @param segments - Synthesised narration segments with start times.
 * @returns Array of cues ready for VTT, ASS, and SRT serialisation.
 */
function buildCues(segments: SynthesisedSegment[]): Cue[] {
	return segments.map((segment) => ({
		end: segment.startTime + segment.audioDuration,
		start: segment.startTime,
		text: wrapCueText(segment.text),
	}));
}

/**
 * Serialises caption cues to WebVTT format.
 *
 * Each cue includes a `line:%` position so captions sit in the dedicated
 * caption bar at the bottom of the frame rather than overlapping terminal
 * output. The VTT file is suitable for use in HTML `<track>` elements.
 * @param cues - Caption cues produced by {@link buildCues}.
 * @returns WebVTT file contents as a string.
 */
function generateVtt(cues: Cue[]): string {
	const lines = ['WEBVTT', ''];

	cues.forEach((cue, i) => {
		lines.push(`cue-${i + 1}`);
		lines.push(
			`${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)} line:${CAPTION_LINE}% position:50% align:center`
		);
		lines.push(cue.text);
		lines.push('');
	});

	return lines.join('\n');
}

/**
 * Formats a duration in seconds as an ASS timestamp (H:MM:SS.cc).
 * @param seconds - Duration in seconds to format.
 * @returns ASS-formatted timestamp string.
 */
function formatAssTimestamp(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	const cs = Math.round((seconds % 1) * 100);
	return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Serialises caption cues to Advanced SubStation Alpha (ASS) format.
 *
 * ASS is used for subtitle burn-in via ffmpeg’s `subtitles` filter. All
 * styling (font, colour, background box) lives in the ASS style header so
 * no escaping is needed in ffmpeg filter arguments. BorderStyle=3 renders
 * an opaque background box; Alignment=2 centres text at the bottom of frame.
 * @param cues - Caption cues produced by {@link buildCues}.
 * @param marginV - Optional vertical caption margin override.
 * @returns ASS file contents as a string.
 */
function generateAss(cues: Cue[], marginV?: number): string {
	const effectiveMarginV = marginV ?? CAPTION_MARGIN_V;
	const lines = [
		'[Script Info]',
		'ScriptType: v4.00+',
		`PlayResX: ${VIDEO_WIDTH}`,
		`PlayResY: ${VIDEO_HEIGHT}`,
		'',
		'[V4+ Styles]',
		'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
		// BorderStyle=3: opaque box behind text.
		//   OutlineColour = box background fill.
		//   Outline = box padding around text (in pixels).
		//   Shadow = 0 (no drop shadow).
		// Alignment=2: bottom-centre.
		`Style: Default,${CAPTION_FONT},${CAPTION_FONT_SIZE},${CAPTION_COLOUR},&H000000FF,${CAPTION_BACK_COLOUR},&H00000000,0,0,0,0,100,100,0,0,3,4,0,2,10,10,${effectiveMarginV},0`,
		'',
		'[Events]',
		'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
	];

	for (const cue of cues) {
		lines.push(
			`Dialogue: 0,${formatAssTimestamp(cue.start)},${formatAssTimestamp(cue.end)},Default,,0,0,0,,${cue.text.replaceAll('\n', '\\N')}`
		);
	}

	return lines.join('\n') + '\n';
}

/**
 * Serialises caption cues to SubRip (SRT) format.
 *
 * SRT is included alongside VTT and ASS as a compatibility fallback for
 * players that do not support WebVTT. SRT milliseconds use a comma separator
 * rather than a period (e.g. `00:00:01,500` not `00:00:01.500`).
 * @param cues - Caption cues produced by {@link buildCues}.
 * @returns SRT file contents as a string.
 */
function generateSrt(cues: Cue[]): string {
	return cues
		.map((cue, i) => {
			// SRT uses commas for milliseconds, not dots
			const start = formatTimestamp(cue.start).replaceAll('.', ',');
			const end = formatTimestamp(cue.end).replaceAll('.', ',');
			return `${i + 1}\n${start} --> ${end}\n${cue.text}\n`;
		})
		.join('\n');
}

/**
 * Word-wraps narration text to fit the caption bar.
 *
 * - Text at or under `CAPTION_MAX_LINE_WIDTH` chars: returned unchanged.
 * - Text up to `CAPTION_MAX_LINE_WIDTH × CAPTION_MAX_LINES` chars: wrapped at
 *   the nearest word boundary to the midpoint.
 * - Longer text: wrapped to exactly `CAPTION_MAX_LINES` lines at a wider
 *   per-line width so the bar never overflows.
 *
 * Line separator is `\n` — callers that need ASS hard breaks should
 * substitute `\N` before embedding in a Dialogue line.
 * @param text - The narration text to wrap.
 * @returns Wrapped text with `\n` between lines.
 */
export function wrapCueText(text: string): string {
	if (text.length <= CAPTION_MAX_LINE_WIDTH) return text;

	// Allow wider lines when needed to stay within CAPTION_MAX_LINES.
	const targetWidth = Math.max(
		CAPTION_MAX_LINE_WIDTH,
		Math.ceil(text.length / CAPTION_MAX_LINES)
	);

	const words = text.split(/\s+/);
	const lines: string[] = [];
	let current = '';

	for (const word of words) {
		if (!current) {
			current = word;
		} else if (current.length + 1 + word.length <= targetWidth) {
			current += ' ' + word;
		} else if (lines.length < CAPTION_MAX_LINES - 1) {
			lines.push(current);
			current = word;
		} else {
			// At the last line — append rather than overflow.
			current += ' ' + word;
		}
	}

	if (current) lines.push(current);

	// If a single oversized token produced only one line, hard-split at midpoint
	// so the result always has exactly 2 lines (CAPTION_MAX_LINES).
	if (lines.length === 1 && lines[0].length > CAPTION_MAX_LINE_WIDTH) {
		const mid = Math.ceil(lines[0].length / 2);
		return [lines[0].slice(0, mid), lines[0].slice(mid)].join('\n');
	}

	return lines.join('\n');
}

export type { CaptionFiles } from '../types';

/**
 * Generates all three caption formats (ASS, VTT, SRT) from synthesised
 * narration segments and writes them to `outputDir`.
 *
 * - **ASS** — burned into the video by ffmpeg’s `subtitles` filter.
 * - **VTT** — served alongside the video for accessible in-player captions.
 * - **SRT** — compatibility fallback for players that do not support WebVTT.
 * @param segments - Synthesised narration segments with timing and text.
 * @param outputDir - Absolute path to the directory where caption files are written.
 * @param outputName - Base name for output files (used as the filename stem).
 * @param captionMarginV - Optional vertical caption margin override for ASS output.
 * @returns Paths to the written `.ass`, `.vtt`, and `.srt` files.
 */
export function generateCaptions(
	segments: SynthesisedSegment[],
	outputDir: string,
	outputName: string,
	captionMarginV?: number
): CaptionFiles {
	const cues = buildCues(segments);

	const assFile = join(outputDir, `${outputName}.ass`);
	const vttFile = join(outputDir, `${outputName}.vtt`);
	const srtFile = join(outputDir, `${outputName}.srt`);

	writeFileSync(assFile, generateAss(cues, captionMarginV), 'utf8');
	writeFileSync(vttFile, generateVtt(cues), 'utf8');
	writeFileSync(srtFile, generateSrt(cues), 'utf8');

	return { assFile, srtFile, vttFile };
}
