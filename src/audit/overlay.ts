/**
 * @module audit/overlay
 *
 * Generates an ffmpeg drawtext filter chain from a timeline.
 *
 * Each filter shows the command label centred in the viewport at 24 px
 * white-on-black for the duration of that step (capped at LABEL_MAX_S
 * seconds so long pauses don't leave labels on screen unreasonably).
 *
 * This is the library version of `scripts/debug-overlay.ts`. The standalone
 * script parses a .tape file; this module reads directly from the timeline.
 */

import type { Timeline } from '../timeline';

/** Maximum time (seconds) to display a single command label. */
const LABEL_MAX_S = 2.0;

interface OverlayEvent {
	label: string;
	start: number;
}

/**
 * Builds an ffmpeg drawtext filter chain from a timeline.
 *
 * Extracts command labels from VHS directives (Type commands, special keys)
 * and places them at the correct wall-clock positions using the timeline's
 * start times and durations.
 * @param timeline - The timeline to generate overlay labels from.
 * @returns A comma-joined ffmpeg drawtext filter string, or an empty string
 *   if the timeline contains no labelled events.
 */
export function buildOverlayFilter(timeline: Timeline): string {
	const events: OverlayEvent[] = [];

	for (const event of timeline.events) {
		// Extract a label from the VHS directives.
		// Type "command" → "command"; special keys → key name.
		for (const directive of event.vhs.directives) {
			const typeMatch = directive.match(/^Type\s+"([^"]*)"$/);
			if (typeMatch) {
				events.push({ label: typeMatch[1], start: event.startTime });
				break; // one label per event
			}
			// Special keys (Escape, Tab, etc.) are bare directives.
			if (directive !== 'Enter') {
				events.push({ label: directive, start: event.startTime });
				break;
			}
		}
	}

	if (events.length === 0) return '';

	const filters = events.map((ev, i) => {
		const naturalEnd =
			i + 1 < events.length ? events[i + 1].start : ev.start + LABEL_MAX_S;
		const end = Math.min(naturalEnd, ev.start + LABEL_MAX_S);

		const text = `command ${ev.label.replace(/:/g, ' ')}`;

		return [
			`drawtext=text='${text}'`,
			'fontsize=24',
			'fontcolor=white',
			'box=1',
			'boxcolor=black@0.75',
			'boxborderw=10',
			'x=(w-tw)/2',
			'y=(h-th)/2',
			`enable='between(t,${ev.start.toFixed(3)},${end.toFixed(3)})'`,
		].join(':');
	});

	return filters.join(',');
}
