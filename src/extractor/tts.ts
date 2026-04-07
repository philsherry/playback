import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stepDuration } from '../constants';
import type { ParsedTape, NarrationSegment, TtsScript } from '../types';

/**
 * Extracts narration segments from a parsed tape and writes a human-readable
 * `script.txt` reference file to `outputDir`.
 *
 * Steps are walked in order; any step with a `narration` field contributes a
 * {@link NarrationSegment} whose `startTime` is the accumulated duration of
 * all preceding steps. The script file is useful for reviewing timing before
 * committing to a full synthesis and render pass.
 * @param parsed - Parsed tape and meta data returned by {@link parseTape}.
 * @param outputDir - Absolute path to the directory where `script.txt` is written.
 * @returns TTS script containing the extracted segments and the script file path.
 */
export function extractTtsScript(
	parsed: ParsedTape,
	outputDir: string
): TtsScript {
	const segments: NarrationSegment[] = [];
	let cursor = 0;

	for (let i = 0; i < parsed.tape.steps.length; i++) {
		const step = parsed.tape.steps[i];

		if (step.narration) {
			segments.push({
				startTime: cursor,
				stepIndex: i,
				text: step.narration,
			});
		}

		cursor += stepDuration(step);
	}

	const scriptFile = join(outputDir, 'script.txt');
	writeFileSync(scriptFile, formatScript(segments), 'utf8');

	return { scriptFile, segments };
}

/**
 * Formats the narration segments as a human-readable reference file.
 *
 * Example:
 *   [0.00s] First, clone the repository from GitHub.
 *   [7.05s] Git downloads the repository. This only takes a few seconds.
 * @param segments - Narration segments to format.
 * @returns A multi-line string with one timestamped entry per segment.
 */
function formatScript(segments: NarrationSegment[]): string {
	if (segments.length === 0) {
		return '(no narration)\n';
	}

	return (
		segments
			.map((s) => `[${s.startTime.toFixed(2)}s] ${s.text}`)
			.join('\n') + '\n'
	);
}
