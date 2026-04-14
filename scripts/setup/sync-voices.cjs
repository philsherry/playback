#!/usr/bin/env node
'use strict';
/**
 * sync-voices.cjs — Merge new voice entries from voices.example.yaml into
 * the user's XDG voice catalogue.
 *
 * Called by setup.sh when the XDG catalogue already exists (i.e. not a first
 * run). Appends any voice keys present in voices.example.yaml that are absent
 * from the user's catalogue. Existing entries are never modified — user
 * customisations and additions are preserved.
 *
 * Preceding `## ` comment blocks in voices.example.yaml are included when
 * appending, so context travels with each new entry.
 *
 * Usage: node sync-voices.cjs <path-to-xdg-voices.yaml>
 *
 * Exits 0 in all cases. Prints one added voice key per line to stdout so
 * setup.sh can report what changed. No output means nothing was added.
 *
 * Kept as plain CommonJS so it runs with `node` alone, without requiring
 * `tsx` or the TypeScript toolchain.
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const examplePath = path.join(repoRoot, 'voices.example.yaml');
const xdgCatalogPath = process.argv[2];

if (!xdgCatalogPath) {
	process.stderr.write('Usage: node sync-voices.cjs <xdg-voices-yaml-path>\n');
	process.exit(0);
}

if (!fs.existsSync(xdgCatalogPath)) {
	// Catalogue doesn't exist yet — setup.sh's bootstrap step handles that.
	process.exit(0);
}

if (!fs.existsSync(examplePath)) {
	process.stderr.write(`voices.example.yaml not found at ${examplePath}\n`);
	process.exit(0);
}

/**
 * Parse the top-level voice key names from a voices.yaml string.
 * Keys are 2-space-indented entries directly under `voices:`.
 * @param {string} content - Raw YAML content.
 * @returns {string[]} Ordered list of voice key names.
 */
function parseVoiceKeys(content) {
	const keys = [];
	let inVoices = false;
	for (const line of content.split('\n')) {
		if (line === 'voices:') {
			inVoices = true;
			continue;
		}
		if (!inVoices) continue;
		// A top-level key in the mapping (no indent) ends the voices block.
		if (/^[a-zA-Z]/.test(line)) {
			inVoices = false;
			continue;
		}
		// 2-space indent, alphanumeric/underscore key, colon — a voice entry.
		const match = line.match(/^  ([a-zA-Z_]\w*):\s*$/);
		if (match) keys.push(match[1]);
	}
	return keys;
}

/**
 * Extract the raw text block for a voice key from the example file, including
 * any immediately preceding `  ## ` comment lines.
 * @param {string[]} lines - Lines of the example file.
 * @param {string} key - Voice key name.
 * @returns {string | null} The block text, or null if the key is not found.
 */
function extractVoiceBlock(lines, key) {
	const keyPattern = new RegExp(`^  ${key}:\\s*$`);
	const keyLineIndex = lines.findIndex((l) => keyPattern.test(l));
	if (keyLineIndex === -1) return null;

	// Walk back to collect immediately preceding comment lines.
	let startIndex = keyLineIndex;
	for (let i = keyLineIndex - 1; i >= 0; i--) {
		if (/^  ##/.test(lines[i])) {
			startIndex = i;
		} else {
			break;
		}
	}

	// Walk forward to the next entry at 2-space indent (key or comment).
	let endIndex = lines.length;
	for (let i = keyLineIndex + 1; i < lines.length; i++) {
		if (/^  [^\s]/.test(lines[i])) {
			endIndex = i;
			break;
		}
	}

	return lines.slice(startIndex, endIndex).join('\n').trimEnd();
}

const exampleContent = fs.readFileSync(examplePath, 'utf8');
const userContent = fs.readFileSync(xdgCatalogPath, 'utf8');

const exampleKeys = parseVoiceKeys(exampleContent);
const userKeys = new Set(parseVoiceKeys(userContent));

const missingKeys = exampleKeys.filter((k) => !userKeys.has(k));

if (missingKeys.length === 0) {
	process.exit(0);
}

const exampleLines = exampleContent.split('\n');
let appendText = '';
const added = [];

for (const key of missingKeys) {
	const block = extractVoiceBlock(exampleLines, key);
	if (block) {
		appendText += `\n${block}\n`;
		added.push(key);
	}
}

if (appendText) {
	// Ensure the file ends with a newline before appending.
	const needsNewline = !userContent.endsWith('\n');
	fs.appendFileSync(xdgCatalogPath, (needsNewline ? '\n' : '') + appendText, 'utf8');
}

for (const key of added) {
	process.stdout.write(`${key}\n`);
}
