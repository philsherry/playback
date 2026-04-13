#!/usr/bin/env node
/**
 * release-notes.cjs — Print release note sections for use in demo tapes.
 *
 * Reads `RELEASE_NOTES.md` and prints either the intro paragraph or a
 * numbered section body. Intended for `narrate` commands in demo tapes,
 * where each section appears one at a time on screen.
 *
 * Usage:
 *   node scripts/release/release-notes.cjs       # intro paragraph
 *   node scripts/release/release-notes.cjs 1     # first ### section
 *   node scripts/release/release-notes.cjs 2     # second ### section
 *
 * Exits 0 on success, 1 if the requested section does not exist.
 *
 * Kept as plain CommonJS so it runs with `node` alone, without requiring
 * `tsx` or the TypeScript toolchain.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// If the first argument ends with '.md', treat it as an explicit file path.
// Otherwise fall back to RELEASE_NOTES.md in the repo root.
// Usage:
//   node scripts/release/release-notes.cjs [file.md] [section]
const firstArg = process.argv[2];
const hasFilePath = firstArg !== undefined && firstArg.endsWith('.md');
const filePath = hasFilePath ? firstArg : null;
const sectionArg = hasFilePath ? process.argv[3] : firstArg;
const index = sectionArg !== undefined ? parseInt(sectionArg, 10) : null;

const notesPath = filePath
	? path.resolve(process.cwd(), filePath)
	: path.join(__dirname, '../..', 'RELEASE_NOTES.md');
const notes = fs.readFileSync(notesPath, 'utf8');
const lines = notes.split('\n');

/** @type {string[]} */
const intro = [];

/** @type {Array<{ title: string; body: string[] }>} */
const sections = [];

/** @type {{ title: string; body: string[] } | null} */
let currentSection = null;

let inIntro = false;

for (const line of lines) {
	if (line.startsWith('## ')) {
		inIntro = true;
		continue;
	}

	if (line.startsWith('### ')) {
		if (currentSection) sections.push(currentSection);
		currentSection = { title: line.slice(4).trim(), body: [] };
		inIntro = false;
		continue;
	}

	if (inIntro) {
		intro.push(line);
	} else if (currentSection) {
		currentSection.body.push(line);
	}
}

if (currentSection) sections.push(currentSection);

/**
 * Strip leading and trailing empty lines from an array of strings.
 *
 * @param {string[]} arr
 * @returns {string[]}
 */
function trimLines(arr) {
	const result = [...arr];
	while (result.length > 0 && !result[0].trim()) result.shift();
	while (result.length > 0 && !result[result.length - 1].trim()) result.pop();
	return result;
}

if (index === null) {
	const output = trimLines(intro).join('\n');
	process.stdout.write(`${output}\n`);
} else {
	const section = sections[index - 1];

	if (!section) {
		console.error(
			`No section ${index} in RELEASE_NOTES.md (${sections.length} section${sections.length === 1 ? '' : 's'} available)`,
		);
		process.exit(1);
	}

	const output = trimLines(section.body).join('\n');
	process.stdout.write(`${output}\n`);
}
