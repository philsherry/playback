/**
 * @module generator/manifest
 *
 * Generates a `manifest.json` for web playback. The manifest lists all
 * available assets for an episode: the per-voice `.mp4` videos, caption
 * files, and poster image.
 *
 * A web front-end loads the manifest to populate a voice selector and
 * point the browser's video player at the correct `.mp4` and `.vtt`
 * for the chosen voice.
 */

import { writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import type { ParsedTape } from '../types';

/** A single voice entry in the manifest. */
interface ManifestVoice {
	captions: {
		srt: string;
		vtt: string;
	};
	video: string;
	voice: string;
}

/** The top-level manifest structure written to disk. */
interface Manifest {
	card: string | null;
	description?: string;
	episode?: number;
	locale?: string;
	og: string | null;
	poster: string | null;
	series?: string;
	title: string;
	voices: ManifestVoice[];
}

/** Data collected per voice during the pipeline run. */
export interface VoiceOutput {
	mp4File: string;
	srtFile: string;
	voice: string;
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
 * @param posterFile - Path to the full-resolution poster image, or `null`.
 * @param cardFile - Path to the 50%-scaled card image, or `null`.
 * @param ogFile - Path to the 1200×630 Open Graph image, or `null`.
 * @param voiceOutputs - Per-voice output data collected during the pipeline.
 * @returns Absolute path to the generated manifest file.
 */
export function generateManifest(
	parsed: ParsedTape,
	outputDir: string,
	posterFile: string | null,
	cardFile: string | null,
	ogFile: string | null,
	voiceOutputs: VoiceOutput[]
): string {
	const rel = (filePath: string) => relative(outputDir, filePath);

	const manifest: Manifest = {
		card: cardFile ? rel(cardFile) : null,
		description: parsed.meta.description,
		episode: parsed.meta.episode,
		locale: parsed.meta.locale,
		og: ogFile ? rel(ogFile) : null,
		poster: posterFile ? rel(posterFile) : null,
		series: parsed.meta.series,
		title: parsed.meta.title,
		voices: voiceOutputs.map((vo) => ({
			captions: {
				srt: rel(vo.srtFile),
				vtt: rel(vo.vttFile),
			},
			video: rel(vo.mp4File),
			voice: vo.voice,
		})),
	};

	const manifestFile = join(outputDir, `${basename(parsed.tape.output)}.manifest.json`);
	writeFileSync(manifestFile, JSON.stringify(manifest, null, '\t'), 'utf8');
	return manifestFile;
}
