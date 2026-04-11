#!/usr/bin/env node
/**
 * notes-from-changelog.cjs — Extract a changelog section for release publishing.
 *
 * Reads `CHANGELOG.md` and prints the body of the `## [<version>]` section to
 * stdout. Used by release automation to populate GitHub release notes from the
 * changelog without manual copy-paste.
 *
 * Usage: `npm run release:notes -- <version>`
 *
 * Exits 0 with the section body on success, 1 if the version is missing or its
 * section is empty.
 *
 * Kept as plain CommonJS so it runs with `node` alone in CI and local tagging
 * workflows, without requiring `tsx` or the TypeScript toolchain.
 */

const fs = require('node:fs');
const path = require('node:path');

const version = process.argv[2];

if (!version) {
	console.error('Usage: npm run release:notes -- <version>');
	process.exit(1);
}

const changelogPath = path.join(__dirname, '../..', 'CHANGELOG.md');
const changelog = fs.readFileSync(changelogPath, 'utf8');
const lines = changelog.split('\n');
const startIndex = lines.findIndex((line) => line.startsWith(`## [${version}]`));

if (startIndex === -1) {
	console.error(`Could not find version ${version} in CHANGELOG.md`);
	process.exit(1);
}

let endIndex = lines.length;

for (let index = startIndex + 1; index < lines.length; index += 1) {
	if (lines[index].startsWith('## [')) {
		endIndex = index;
		break;
	}
}

const body = lines.slice(startIndex + 1, endIndex).join('\n').trim();

if (!body) {
	console.error(`Version ${version} exists in CHANGELOG.md but has no release notes`);
	process.exit(1);
}

process.stdout.write(`${body}\n`);
