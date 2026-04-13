/**
 * @module generator/manifest
 *
 * Generates a `manifest.json` for web playback. The manifest lists all
 * available assets for an episode: the per-voice `.m4a` audio files, caption
 * files, the shared video recording, and poster image.
 *
 * A web front-end loads the manifest to populate a voice selector and
 * point the browser's audio player at the correct `.m4a` and `.vtt`
 * for the chosen voice, while the video element plays the shared recording.
 */

import { writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import type { ParsedTape } from '../types';

/** A single voice entry in the manifest. */
interface ManifestVoice {
	audio: string;
	captions: {
		srt: string;
		vtt: string;
	};
	voice: string;
}

/** The top-level manifest structure written to disk. */
interface Manifest {
	card: string | null;
	description?: string;
	download: string | null;
	episode?: number;
	gif: string | null;
	locale?: string;
	og: string | null;
	poster: string | null;
	series?: string;
	title: string;
	video: string;
	voices: ManifestVoice[];
}

/** Data collected per voice during the pipeline run. */
export interface VoiceOutput {
	/** Absolute path to the `.m4a` audio file for this voice. */
	audioFile: string;
	/** Absolute path to the `.srt` caption file. */
	srtFile: string;
	/** Voice identifier matching `meta.yaml`. */
	voice: string;
	/** Absolute path to the `.vtt` caption file. */
	vttFile: string;
}

/**
 * Generates a `manifest.json` for web playback.
 *
 * All file paths in the manifest are relative to the output directory,
 * so the manifest is portable — copy the output directory anywhere and
 * the paths still resolve.
 * @param parsed - Parsed tape and meta data.
 * @param outputDir - Directory where output files live.
 * @param videoFile - Absolute path to the shared video `.mp4` file.
 * @param gifFile - Absolute path to the `.gif` file, or `null`.
 * @param posterFile - Path to the full-resolution poster image, or `null`.
 * @param cardFile - Path to the 50%-scaled card image, or `null`.
 * @param ogFile - Path to the 1200×630 Open Graph image, or `null`.
 * @param voiceOutputs - Per-voice output data collected during the pipeline.
 * @param downloadFile - Absolute path to the primary-voice MP4 for sharing/download, or `null`.
 * @returns Absolute path to the generated manifest file.
 */
export function generateManifest(
	parsed: ParsedTape,
	outputDir: string,
	videoFile: string,
	gifFile: string | null,
	posterFile: string | null,
	cardFile: string | null,
	ogFile: string | null,
	voiceOutputs: VoiceOutput[],
	downloadFile: string | null = null
): string {
	const rel = (filePath: string) => relative(outputDir, filePath);

	const manifest: Manifest = {
		card: cardFile ? rel(cardFile) : null,
		description: parsed.meta.description,
		download: downloadFile ? rel(downloadFile) : null,
		episode: parsed.meta.episode,
		gif: gifFile ? rel(gifFile) : null,
		locale: parsed.meta.locale,
		og: ogFile ? rel(ogFile) : null,
		poster: posterFile ? rel(posterFile) : null,
		series: parsed.meta.series,
		title: parsed.meta.title,
		video: rel(videoFile),
		voices: voiceOutputs.map((vo) => ({
			audio: rel(vo.audioFile),
			captions: {
				srt: rel(vo.srtFile),
				vtt: rel(vo.vttFile),
			},
			voice: vo.voice,
		})),
	};

	const manifestFile = join(outputDir, `${basename(parsed.tape.output)}.manifest.json`);
	writeFileSync(manifestFile, JSON.stringify(manifest, null, '\t'), 'utf8');
	return manifestFile;
}
