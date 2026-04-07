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
	voice: string;
	video: string;
	captions: {
		vtt: string;
		srt: string;
	};
}

/** The top-level manifest structure written to disk. */
interface Manifest {
	title: string;
	description?: string;
	locale?: string;
	series?: string;
	episode?: number;
	poster: string | null;
	voices: ManifestVoice[];
}

/** Data collected per voice during the pipeline run. */
export interface VoiceOutput {
	voice: string;
	mp4File: string;
	vttFile: string;
	srtFile: string;
}

/**
 * Generates a `manifest.json` for web playback.
 *
 * All file paths in the manifest are relative to the output directory,
 * so the manifest is portable — copy the output directory anywhere and
 * the paths still resolve.
 * @param parsed - Parsed tape and meta data.
 * @param outputDir - Directory where output files live.
 * @param posterFile - Path to the poster image, or `null`.
 * @param voiceOutputs - Per-voice output data collected during the pipeline.
 * @returns Absolute path to the generated manifest file.
 */
export function generateManifest(
	parsed: ParsedTape,
	outputDir: string,
	posterFile: string | null,
	voiceOutputs: VoiceOutput[]
): string {
	const rel = (filePath: string) => relative(outputDir, filePath);

	const manifest: Manifest = {
		title: parsed.meta.title,
		description: parsed.meta.description,
		locale: parsed.meta.locale,
		series: parsed.meta.series,
		episode: parsed.meta.episode,
		poster: posterFile ? rel(posterFile) : null,
		voices: voiceOutputs.map((vo) => ({
			voice: vo.voice,
			video: rel(vo.mp4File),
			captions: {
				vtt: rel(vo.vttFile),
				srt: rel(vo.srtFile),
			},
		})),
	};

	const manifestFile = join(outputDir, `${basename(parsed.tape.output)}.manifest.json`);
	writeFileSync(manifestFile, JSON.stringify(manifest, null, '\t'), 'utf8');
	return manifestFile;
}
