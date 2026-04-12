import { statSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import {
	FFMPEG_FULL_BIN,
	GIF_HEIGHT,
	GIF_WIDTH,
	VIDEO_HEIGHT,
	VIDEO_WIDTH,
} from '../constants';
import type { CaptionFiles, FfmpegResult, SynthesisedSegment, VideoMetadata } from '../types';
import { escapeAssPath } from '../utilities/escape';
import { isVerbose, logVerbose, logWarn } from '../logger';

/**
 * Thrown when ffmpeg fails or is not installed.
 * @param message - Human-readable description of the failure.
 */
export class FfmpegError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'FfmpegError';
	}
}

/**
 * Warning patterns surfaced from ffmpeg stderr in default and quiet modes.
 * Lines matching any of these patterns are emitted via `logWarn`; all other
 * lines are suppressed unless `--verbose` is active.
 */
const FFMPEG_WARN_PATTERNS = [
	'Guessed Channel Layout',
	'does not contain an image sequence pattern',
	'Too many bits',
	'Warning:',
	'Error:',
];

/**
 * Returns `true` when an ffmpeg stderr line should be surfaced as a warning
 * in default/quiet modes (i.e. it matches a known warning pattern and is not
 * part of the version banner).
 * @param line - A single line from ffmpeg's stderr output.
 * @returns `true` if the line matches a known warning pattern.
 */
function isWarningLine(line: string): boolean {
	if (line.startsWith('ffmpeg version')) return false;
	return FFMPEG_WARN_PATTERNS.some((p) => line.includes(p));
}

/**
 * Spawns `ffmpeg -y` with captured stderr and the provided argument list.
 *
 * The `-y` flag overwrites existing output files without prompting.
 * In verbose mode all stderr passes through via `logVerbose`. In default and
 * quiet modes only lines matching {@link FFMPEG_WARN_PATTERNS} are surfaced
 * via `logWarn`; the rest (version banner, encoding stats, stream maps) is
 * suppressed. Resolves when ffmpeg exits 0; rejects with {@link FfmpegError}
 * on non-zero exit or if `ffmpeg` is not on `$PATH`.
 * @param args - ffmpeg argument list, excluding the leading `ffmpeg -y`.
 * @returns A promise that resolves when ffmpeg completes successfully.
 */
function spawnFfmpeg(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(`${FFMPEG_FULL_BIN}/ffmpeg`, ['-y', ...args], {
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		const verbose = isVerbose();
		let stderrBuf = '';

		child.stdout?.on('data', (chunk: Buffer) => {
			const text = chunk.toString();
			if (verbose) logVerbose(text.trimEnd());
		});

		child.stderr?.on('data', (chunk: Buffer) => {
			const text = chunk.toString();
			stderrBuf += text;
			if (verbose) {
				// Stream line-by-line in verbose mode so output appears live.
				const lines = stderrBuf.split('\n');
				stderrBuf = lines.pop() ?? '';
				for (const line of lines) {
					if (line.trim()) logVerbose(line);
				}
			}
		});

		child.on('error', (err) => {
			if ((err as { code?: string }).code === 'ENOENT') {
				reject(
					new FfmpegError(
						'ffmpeg is not installed or not on PATH. Run: brew install ffmpeg'
					)
				);
			} else {
				reject(new FfmpegError(`Failed to spawn ffmpeg: ${err.message}`));
			}
		});

		child.on('close', (code) => {
			// Flush any remaining stderr buffer.
			if (stderrBuf.trim()) {
				if (verbose) {
					logVerbose(stderrBuf.trimEnd());
				} else {
					for (const line of stderrBuf.split('\n')) {
						if (isWarningLine(line)) logWarn(line.trimEnd());
					}
				}
			}

			// In non-verbose mode, scan buffered stderr for warning lines.
			// (Already streamed live in verbose mode above.)

			if (code !== 0) {
				reject(new FfmpegError(`ffmpeg exited with code ${code}`));
				return;
			}
			resolve();
		});
	});
}

/**
 * Builds the -vf string for video: pad the terminal recording to VIDEO_HEIGHT
 * and burn in subtitles from the ASS file.
 *
 * Using an ASS file (rather than SRT + force_style) avoids all filter-string
 * escaping issues — styling lives in the ASS header, not in the ffmpeg args.
 * @param assFile - Absolute path to the ASS subtitle file.
 * @returns The `-vf` filter string for ffmpeg.
 */
function buildVideoFilter(assFile: string): string {
	const escapedAss = escapeAssPath(assFile);

	return [
		`pad=w=${VIDEO_WIDTH}:h=${VIDEO_HEIGHT}:x=0:y=0:color=black`,
		`subtitles=${escapedAss}`,
	].join(',');
}

/**
 * Builds the -filter_complex string for audio only: delay each segment to its
 * start time, normalise loudness, then mix into a single track.
 * @param segments - Synthesised segments with start times and audio file paths.
 * @returns The `-filter_complex` string for ffmpeg.
 */
function buildAudioFilterComplex(segments: SynthesisedSegment[]): string {
	const audioFilters = segments.map((seg, i) => {
		const delayMs = Math.round(seg.startTime * 1000);
		// Delay each segment to its start time in the mix.
		// Piper WAV files are already at a consistent volume, so no
		// loudness normalisation is needed. (loudnorm caused DTS overflow
		// when combined with adelay + amix in ffmpeg 8.x.)
		return `[${i + 1}:a]adelay=${delayMs}|${delayMs}[a${i}]`;
	});

	const audioInputs = segments.map((_, i) => `[a${i}]`).join('');
	// normalize=0 keeps each stream at constant volume throughout the mix.
	// The default (normalize=1) divides by active input count, so volume rises
	// as earlier segments finish — the "shouting" effect.
	const mixFilter = `${audioInputs}amix=inputs=${segments.length}:duration=longest:normalize=0[aout]`;

	return [...audioFilters, mixFilter].join('; ');
}

/**
 * Maps a BCP-47 language tag to its ISO 639-2/B three-letter code.
 *
 * ffmpeg's stream-level `language` tag expects ISO 639-2/B (e.g. `eng`),
 * not BCP-47 (e.g. `en-GB`). This covers further languages as we grow.
 * @param bcp47 - BCP-47 language tag (e.g. `"en-GB"`, `"cy"`).
 * @returns ISO 639-2/B code, or `null` if the language is not mapped.
 */
function bcp47ToIso639(bcp47: string): string | null {
	const primary = bcp47.split('-')[0].toLowerCase();
	const map: Record<string, string> = {
		cy: 'cym',
		de: 'ger',
		en: 'eng',
		es: 'spa',
		fr: 'fre',
		ga: 'gle',
		gd: 'gla',
	};
	return map[primary] ?? null;
}

/**
 * Builds `-metadata` flags from a {@link VideoMetadata} object.
 *
 * Only non-empty values produce flags. Each entry becomes a pair of
 * ffmpeg arguments: `-metadata`, `key=value`.
 * @param meta - Video metadata to embed.
 * @returns Flat array of ffmpeg `-metadata` arguments.
 */
export function buildMetadataFlags(meta: VideoMetadata): string[] {
	const flags: string[] = [];
	const add = (key: string, value: string | number | undefined) => {
		if (value != null && value !== '') {
			flags.push('-metadata', `${key}=${value}`);
		}
	};

	add('title', meta.title);
	add('comment', meta.comment);
	add('artist', meta.artist);
	add('album', meta.album);
	add('track', meta.track);
	add('language', meta.language);

	// Set the audio stream language so QuickTime and other players show it
	// correctly in their inspector (container-level language alone is ignored).
	if (meta.language) {
		const iso639 = bcp47ToIso639(meta.language);
		if (iso639) {
			flags.push('-metadata:s:a:0', `language=${iso639}`);
		}
	}

	return flags;
}

/**
 * Combines the raw VHS terminal recording with synthesised narration audio
 * and burned-in subtitles into a final `.mp4` file.
 *
 * The video is padded from 1280×660 to 1280×720 and subtitles are burned in
 * from the ASS file. Audio segments are delay-normalised and mixed into a
 * single AAC track. When there are no narration segments the audio map is
 * omitted and the video is encoded without an audio track.
 * @param rawMp4 - Path to the raw VHS recording (`<slug>.raw.mp4`).
 * @param segments - Synthesised narration segments with timing and audio files.
 * @param outputFile - Destination path for the final `.mp4`.
 * @param captions - Caption file paths; only `assFile` is used for burn-in.
 * @param metadata - Video metadata tags to embed in the `.mp4`.
 * @param overlayFilter - Optional debug overlay filter appended to the video filter chain.
 * @param chapterFile - Optional FFMETADATA1 chapter file to embed in the MP4.
 */
async function stitchMp4(
	rawMp4: string,
	segments: SynthesisedSegment[],
	outputFile: string,
	captions: CaptionFiles,
	metadata: VideoMetadata,
	overlayFilter?: string,
	chapterFile?: string
): Promise<void> {
	let videoFilter = buildVideoFilter(captions.assFile);
	if (overlayFilter) {
		videoFilter += `,${overlayFilter}`;
	}
	const metaFlags = buildMetadataFlags(metadata);

	const inputs = ['-i', rawMp4];
	for (const seg of segments) {
		// Declare channel layout explicitly so ffmpeg does not need to guess.
		inputs.push('-channel_layout', 'mono', '-i', seg.audioFile);
	}

	// Chapter metadata file — added as the last input so its index is
	// predictable. -map_metadata references this input by index.
	const chapterInputIndex = 1 + segments.length;
	if (chapterFile) {
		inputs.push('-i', chapterFile);
	}
	const chapterFlags = chapterFile
		? ['-map_metadata', `${chapterInputIndex}`]
		: [];

	if (segments.length === 0) {
		await spawnFfmpeg([
			...inputs,
			'-vf', videoFilter,
			'-map', '0:v',
			...chapterFlags,
			'-c:v', 'libx264',
			'-crf', '18',
			'-preset', 'slow',
			...metaFlags,
			outputFile,
		]);
		return;
	}

	const audioFilterComplex = buildAudioFilterComplex(segments);

	await spawnFfmpeg([
		...inputs,
		'-vf', videoFilter,
		'-filter_complex', audioFilterComplex,
		'-map', '0:v',
		'-map', '[aout]',
		...chapterFlags,
		'-c:v', 'libx264',
		'-crf', '18',
		'-preset', 'slow',
		'-c:a', 'aac',
		'-ar', '44100',
		'-b:a', '128k',
		...metaFlags,
		outputFile,
	]);
}

/**
 * Converts the final `.mp4` to an optimised `.gif` using a two-pass palette.
 *
 * First pass generates a palette from the video content;
 * second pass dithers the output using that palette. This produces
 * significantly better quality than ffmpeg’s default single-pass GIF encoding.
 * Output is scaled to {@link GIF_WIDTH}×{@link GIF_HEIGHT} at 15fps — a good
 * balance between quality and file size for README and docs embeds.
 * @param mp4File - Path to the final `.mp4` to convert.
 * @param gifFile - Destination path for the output `.gif`.
 */
async function generateGif(mp4File: string, gifFile: string): Promise<void> {
	// Two-pass palette approach produces much better quality than ffmpeg's
	// default GIF encoding. First pass generates an optimised palette from
	// the video content; second pass uses it to dither the output.
	//
	// reserve_transparent=0 — reclaims the slot palettegen reserves for
	// alpha (terminal video has no transparency), giving all 256 entries
	// to actual colours.
	//
	// stats_mode=diff — samples only pixels that change between frames
	// rather than all pixels. Terminal recordings have large static
	// background regions; diff mode focuses the palette on the content
	// that actually moves.
	//
	// Note: ffmpeg may still emit a "Duped color" or "255(+1) colors"
	// warning when the theme produces fewer than 256 distinct colours
	// (common with dark themes that have large uniform backgrounds). This
	// is benign — the GIF renders correctly — and cannot be reliably
	// prevented without degrading quality, so it is suppressed.
	//
	// The first chain (fps → scale → split) feeds two named pads.
	// The two chains below it are parallel, so they use `;` separators.
	const paletteFilter = [
		`fps=15,scale=${GIF_WIDTH}:${GIF_HEIGHT}:flags=lanczos,split[s0][s1]`,
		`[s0]palettegen=reserve_transparent=0:stats_mode=diff[p]`,
		`[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
	].join(';');

	await spawnFfmpeg([
		'-i', mp4File,
		'-vf', paletteFilter,
		gifFile,
	]);
}

/**
 * Extracts a single frame from an `.mp4` at the given timestamp as a `.png`.
 *
 * The frame is taken at the first keyframe at or after `time` seconds.
 * Used to generate the episode poster image when `meta.yaml` specifies a
 * `poster` step number.
 * @param mp4File - Path to the `.mp4` to extract the frame from.
 * @param posterFile - Destination path for the output `.poster.png`.
 * @param time - Timestamp in seconds at which to capture the poster frame.
 */
async function extractPoster(
	mp4File: string,
	posterFile: string,
	time: number
): Promise<void> {
	await spawnFfmpeg([
		'-i', mp4File,
		'-vf', `select=gte(t\\,${time})`,
		'-vframes', '1',
		'-update', '1',
		posterFile,
	]);
}

/**
 * Generates a 50%-scaled card image from a poster `.png`.
 *
 * Used to produce the `*.card.png` alongside the full-resolution
 * `*.poster.png` for web manifest output.
 * @param posterFile - Path to the full-resolution poster image.
 * @param cardFile - Destination path for the output `.card.png`.
 */
async function generateCard(posterFile: string, cardFile: string): Promise<void> {
	await spawnFfmpeg([
		'-i', posterFile,
		'-vf', 'scale=iw/2:ih/2',
		'-frames:v', '1',
		'-update', '1',
		cardFile,
	]);
}


/**
 * Combines the raw VHS terminal recording with synthesised narration audio
 * and an embedded SRT subtitle track into a `.mkv` container.
 *
 * Unlike the MP4 path, no subtitle burn-in is performed — the SRT track is
 * included as a selectable stream. The video is padded to VIDEO_HEIGHT but
 * no ASS filter is applied.
 * @param rawMp4 - Path to the raw VHS recording.
 * @param segments - Synthesised narration segments with timing and audio files.
 * @param outputFile - Destination path for the output `.mkv`.
 * @param captions - Caption file paths; `srtFile` is used as the subtitle stream.
 * @param metadata - Video metadata tags to embed.
 * @param chapterFile - Optional FFMETADATA1 chapter file to embed.
 */
async function stitchMkv(
	rawMp4: string,
	segments: SynthesisedSegment[],
	outputFile: string,
	captions: CaptionFiles,
	metadata: VideoMetadata,
	chapterFile?: string
): Promise<void> {
	const videoFilter = `pad=w=${VIDEO_WIDTH}:h=${VIDEO_HEIGHT}:x=0:y=0:color=black`;
	const metaFlags = buildMetadataFlags(metadata);

	const inputs = ['-i', rawMp4];
	for (const seg of segments) {
		// Declare channel layout explicitly so ffmpeg does not need to guess.
		inputs.push('-channel_layout', 'mono', '-i', seg.audioFile);
	}

	// SRT subtitle input — index is 1 + segments.length
	const srtInputIndex = 1 + segments.length;
	inputs.push('-i', captions.srtFile);

	// Chapter metadata file — added as the last input
	const chapterInputIndex = srtInputIndex + 1;
	if (chapterFile) {
		inputs.push('-i', chapterFile);
	}
	const chapterFlags = chapterFile
		? ['-map_metadata', `${chapterInputIndex}`]
		: [];

	const subtitleLang = metadata.language ? bcp47ToIso639(metadata.language) : null;
	const subtitleLangFlags = subtitleLang
		? ['-metadata:s:s:0', `language=${subtitleLang}`]
		: [];

	if (segments.length === 0) {
		await spawnFfmpeg([
			...inputs,
			'-vf', videoFilter,
			'-map', '0:v',
			'-map', `${srtInputIndex}:s`,
			...chapterFlags,
			'-c:v', 'libx264',
			'-crf', '18',
			'-preset', 'slow',
			'-c:s', 'srt',
			'-metadata:s:s:0', 'title=Captions',
			...subtitleLangFlags,
			...metaFlags,
			outputFile,
		]);
		return;
	}

	const audioFilterComplex = buildAudioFilterComplex(segments);

	await spawnFfmpeg([
		...inputs,
		'-vf', videoFilter,
		'-filter_complex', audioFilterComplex,
		'-map', '0:v',
		'-map', '[aout]',
		'-map', `${srtInputIndex}:s`,
		...chapterFlags,
		'-c:v', 'libx264',
		'-crf', '18',
		'-preset', 'slow',
		'-c:a', 'aac',
		'-ar', '44100',
		'-b:a', '128k',
		'-c:s', 'srt',
		'-metadata:s:s:0', 'title=Captions',
		...subtitleLangFlags,
		...metaFlags,
		outputFile,
	]);
}

/**
 * Runs the full ffmpeg post-processing pipeline: MP4 stitch, GIF generation,
 * and optional poster extraction.
 *
 * Poster resolution order:
 * 1. `posterSourceFile` — an explicit `.png` supplied by the tape (used as-is).
 * 2. `posterTime` — a frame extracted from the final `.mp4` at that timestamp.
 * 3. `null` — no poster is generated.
 * @param rawMp4 - Path to the raw VHS terminal recording.
 * @param segments - Synthesised narration segments with timing and audio files.
 * @param captions - Caption file paths (`.ass`, `.vtt`, `.srt`).
 * @param outputDir - Directory where output files are written.
 * @param outputName - Base name for output files (without extension).
 * @param posterTime - Timestamp in seconds for poster frame extraction, or `null`.
 * @param posterSourceFile - Absolute path to an explicit poster image, or `null`.
 * @param metadata - Video metadata tags to embed in the `.mp4`.
 * @param overlayFilter - Optional ffmpeg drawtext filter for debug overlay.
 * @param chapterFile - Optional FFMETADATA1 chapter file to embed in the MP4.
 * @param mkv - When `true`, also produce a `.mkv` with an embedded SRT subtitle track.
 * @returns Paths to the generated `.mp4`, `.gif`, and poster image (if any).
 */
export async function runFfmpeg(
	rawMp4: string,
	segments: SynthesisedSegment[],
	captions: CaptionFiles,
	outputDir: string,
	outputName: string,
	posterTime: number | null,
	posterSourceFile: string | null,
	metadata: VideoMetadata,
	overlayFilter?: string,
	chapterFile?: string,
	mkv?: boolean
): Promise<FfmpegResult> {
	const mp4File = join(outputDir, `${outputName}.mp4`);
	const gifFile = join(outputDir, `${outputName}.gif`);
	const posterFile = join(outputDir, `${outputName}.poster.png`);
	const cardFile = join(outputDir, `${outputName}.card.png`);

	await stitchMp4(rawMp4, segments, mp4File, captions, metadata, overlayFilter, chapterFile);
	await generateGif(mp4File, gifFile);

	// Poster: explicit file takes priority over frame extraction
	let resolvedPoster: string | null = null;
	let resolvedCard: string | null = null;

	if (posterSourceFile) {
		resolvedPoster = posterSourceFile;
	} else if (posterTime !== null) {
		await extractPoster(mp4File, posterFile, posterTime);
		// ffmpeg exits 0 even when the select filter finds no matching frames,
		// producing a missing or zero-byte file. Only use the poster if it exists
		// and has content; otherwise skip card generation silently.
		try {
			if (statSync(posterFile).size > 0) {
				resolvedPoster = posterFile;
			}
		} catch {
			// file was not created — no poster
		}
	}

	if (resolvedPoster !== null) {
		await generateCard(resolvedPoster, cardFile);
		resolvedCard = cardFile;
	}

	const result: FfmpegResult = { cardFile: resolvedCard, gifFile, mp4File, ogFile: null, posterFile: resolvedPoster };

	if (mkv) {
		const mkvFile = join(outputDir, `${outputName}.mkv`);
		await stitchMkv(rawMp4, segments, mkvFile, captions, metadata, chapterFile);
		result.mkvFile = mkvFile;
	}

	return result;
}

