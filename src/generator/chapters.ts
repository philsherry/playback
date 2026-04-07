/**
 * @module generator/chapters
 *
 * Generates an FFMETADATA1 chapter file from a timeline.
 *
 * Each timeline event becomes a chapter in the output MP4. Chapter titles
 * use the narration text (truncated) or the action type + command. This
 * gives every video a machine-readable timing index that can be dumped
 * with `ffprobe -show_chapters` for benchmarking and comparison.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Timeline } from '../timeline';
import type { Step } from '../schema/tape';

const MAX_TITLE_LENGTH = 80;

/**
 * Builds a human-readable chapter title for a timeline event.
 *
 * Uses the narration text (truncated) if present, otherwise falls back
 * to the step's action and command.
 * @param event - The timeline event.
 * @param step - The corresponding tape step.
 * @returns A short chapter title string.
 */
function chapterTitle(
	event: Timeline['events'][number],
	step: Step
): string {
	if (event.narration?.text) {
		const text = event.narration.text.replace(/\s+/g, ' ').trim();
		if (text.length > MAX_TITLE_LENGTH) {
			return text.slice(0, MAX_TITLE_LENGTH - 1) + '\u2026';
		}
		return text;
	}

	if (step.action === 'type' || step.action === 'key') {
		return `${step.action}: ${step.command}`;
	}

	return `${step.action} (step ${event.stepIndex + 1})`;
}

/**
 * Generates an FFMETADATA1 chapter file from a timeline.
 *
 * The file is written to `outputDir/chapters.txt` and can be passed to
 * ffmpeg via `-i chapters.txt -map_metadata 1` to embed chapters in the
 * output MP4.
 * @param timeline - The timeline to extract chapters from.
 * @param steps - The tape steps corresponding to timeline events.
 * @param outputDir - Directory where `chapters.txt` is written.
 * @returns Absolute path to the generated chapter file.
 */
export function generateChapters(
	timeline: Timeline,
	steps: Step[],
	outputDir: string
): string {
	const lines: string[] = [';FFMETADATA1'];

	for (const event of timeline.events) {
		const step = steps[event.stepIndex];
		const startMs = Math.round(event.startTime * 1000);
		const endMs = Math.round((event.startTime + event.duration) * 1000);
		const title = chapterTitle(event, step);

		lines.push('');
		lines.push('[CHAPTER]');
		lines.push('TIMEBASE=1/1000');
		lines.push(`START=${startMs}`);
		lines.push(`END=${endMs}`);
		lines.push(`title=${title}`);
	}

	const chapterFile = join(outputDir, 'chapters.txt');
	writeFileSync(chapterFile, lines.join('\n') + '\n', 'utf8');
	return chapterFile;
}
