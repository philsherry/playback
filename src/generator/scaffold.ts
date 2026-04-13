/**
 * @module generator/scaffold
 *
 * Generates a PROMPT.md scaffold from a parsed tape and its total duration.
 *
 * The scaffold gives content authors a starting point for writing the
 * human-readable overview shown on the series landing page. It pre-fills
 * the frontmatter from `meta.yaml` and builds a numbered "What you will see"
 * list from the tape's narration steps.
 */

import type { ParsedTape } from '../types';

const MAX_STEPS = 8;
const MAX_NARRATION_CHARS = 80;

/**
 * Extracts the first sentence from a narration string.
 *
 * Splits on `.`, `?`, or `!` and returns the first non-empty chunk,
 * truncated to {@link MAX_NARRATION_CHARS} characters.
 * @param text - Full narration text.
 * @returns First sentence, truncated if necessary.
 */
function firstSentence(text: string): string {
	const sentence = text.split(/[.?!]/)[0].trim();
	if (sentence.length > MAX_NARRATION_CHARS) {
		return sentence.slice(0, MAX_NARRATION_CHARS - 1) + '\u2026';
	}
	return sentence;
}

/**
 * Formats a duration in seconds as a human-readable "~N minute(s)" string.
 * @param durationSecs - Total duration in seconds.
 * @returns Formatted duration string.
 */
function formatDuration(durationSecs: number): string {
	const minutes = Math.ceil(durationSecs / 60);
	return minutes === 1 ? '~1 minute' : `~${minutes} minutes`;
}

/**
 * Generates a PROMPT.md scaffold string from a parsed tape and total duration.
 *
 * The scaffold contains YAML frontmatter (title, version, duration) followed
 * by four Markdown sections. The "What you will see" list is populated from
 * narration steps (max {@link MAX_STEPS} items). Steps without narration are
 * skipped.
 * @param parsed - Parsed tape containing tape steps and metadata.
 * @param durationSecs - Total timeline duration in seconds.
 * @returns The PROMPT.md content as a string.
 */
export function generateScaffold(parsed: ParsedTape, durationSecs: number): string {
	const { meta, tape } = parsed;
	const version = meta.version ?? '1.0.0';
	const duration = formatDuration(durationSecs);

	const narrationItems: string[] = [];
	for (const step of tape.steps) {
		if (narrationItems.length >= MAX_STEPS) break;
		if (step.action === 'chapter') continue;
		const narration = step.narration;
		if (!narration) continue;
		const sentence = firstSentence(narration);
		if (sentence) {
			narrationItems.push(sentence);
		}
	}

	const stepsSection = narrationItems.length > 0
		? narrationItems.map((item, i) => `${i + 1}. ${item}`).join('\n')
		: '1. <!-- Add steps here -->';

	const descriptionSection = meta.description
		? meta.description.trim()
		: '<!-- Add a description of what this video shows -->';

	// Quote the title so YAML stays valid when it contains `:`, `#`, or similar.
	const safeTitle = meta.title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

	return `---
title: "${safeTitle}"
version: "${version}"
duration: ${duration}
---

## What this video shows

${descriptionSection}

## What you will see

${stepsSection}

## What you will need

<!-- Add prerequisites here -->

## What comes next

<!-- Add follow-up content here -->
`;
}
