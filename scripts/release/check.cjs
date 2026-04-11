#!/usr/bin/env node
/**
 * check.cjs — Release metadata guard.
 *
 * Validates that all release metadata is consistent before tagging:
 * - `package.json` and `package-lock.json` versions match
 * - `CHANGELOG.md` has a heading for the current version with an ISO date and body
 * - `RELEASE_NOTES.md` title matches `# Release notes — v<version>`
 * - No local git tag for the current version already exists
 *
 * Exits 0 on success, 1 with a list of failures otherwise.
 *
 * Kept as plain CommonJS so it runs with `node` alone in CI and local tagging
 * workflows, without requiring `tsx` or the TypeScript toolchain.
 */

const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');

const repoRoot = path.resolve(__dirname, '../..');
const packageJsonPath = path.join(repoRoot, 'package.json');
const packageLockPath = path.join(repoRoot, 'package-lock.json');
const changelogPath = path.join(repoRoot, 'CHANGELOG.md');
const releaseNotesPath = path.join(repoRoot, 'RELEASE_NOTES.md');

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
const changelog = fs.readFileSync(changelogPath, 'utf8');
const releaseNotes = fs.readFileSync(releaseNotesPath, 'utf8');

const version = packageJson.version;
const changelogLines = changelog.split('\n');
const releaseNotesLines = releaseNotes.split('\n');
const errors = [];

function findFirstVersionHeading(lines) {
	// Skip the [Unreleased] placeholder — find the first real version heading.
	return lines.find((line) => /^## \[[^\]]+\]/.test(line) && !line.startsWith('## [Unreleased]'));
}

function extractHeadingDate(heading) {
	const match = heading.match(/^## \[[^\]]+\] - (\d{4}-\d{2}-\d{2})$/);
	return match ? match[1] : null;
}

function extractChangelogBody(lines, targetVersion) {
	const startIndex = lines.findIndex((line) => line.startsWith(`## [${targetVersion}]`));
	if (startIndex === -1) {
		return null;
	}

	let endIndex = lines.length;
	for (let index = startIndex + 1; index < lines.length; index += 1) {
		if (lines[index].startsWith('## [')) {
			endIndex = index;
			break;
		}
	}

	return lines.slice(startIndex + 1, endIndex).join('\n').trim();
}

function hasLocalTag(tagName) {
	try {
		childProcess.execFileSync(
			'git',
			['rev-parse', '--verify', '--quiet', `refs/tags/${tagName}`],
			{ cwd: repoRoot, stdio: 'ignore' }
		);
		return true;
	} catch {
		return false;
	}
}

if (packageLock.version !== version) {
	errors.push(
		`package-lock.json root version is ${packageLock.version}, expected ${version}`
	);
}

if (!packageLock.packages || !packageLock.packages['']) {
	errors.push('package-lock.json is missing the root package entry');
} else if (packageLock.packages[''].version !== version) {
	errors.push(
		`package-lock.json root package version is ${packageLock.packages[''].version}, expected ${version}`
	);
}

const firstChangelogHeading = findFirstVersionHeading(changelogLines);
if (!firstChangelogHeading) {
	errors.push('CHANGELOG.md is missing any version headings');
} else {
	if (!firstChangelogHeading.startsWith(`## [${version}]`)) {
		errors.push(
			`CHANGELOG.md newest version heading is ${firstChangelogHeading}, expected ${version}`
		);
	}

	if (!extractHeadingDate(firstChangelogHeading)) {
		errors.push(
			`CHANGELOG.md newest version heading must include an ISO date: ${firstChangelogHeading}`
		);
	}
}

const changelogBody = extractChangelogBody(changelogLines, version);
if (changelogBody == null) {
	errors.push(`CHANGELOG.md is missing a heading for version ${version}`);
} else if (!changelogBody) {
	errors.push(`CHANGELOG.md entry for version ${version} has no body`);
}

const expectedReleaseNotesTitle = `# Release notes — v${version}`;
const actualReleaseNotesTitle = releaseNotesLines[0]?.trim();
if (actualReleaseNotesTitle !== expectedReleaseNotesTitle) {
	errors.push(
		`RELEASE_NOTES.md title is ${actualReleaseNotesTitle || '(missing)'}, expected ${expectedReleaseNotesTitle}`
	);
}

const releaseNotesBody = releaseNotesLines.slice(1).join('\n').trim();
if (!releaseNotesBody) {
	errors.push(`RELEASE_NOTES.md for version ${version} has no body`);
}

if (hasLocalTag(`v${version}`)) {
	errors.push(`git tag v${version} already exists locally`);
}

if (errors.length > 0) {
	console.error(`Release metadata check failed for version ${version}:`);
	for (const error of errors) {
		console.error(`- ${error}`);
	}
	process.exit(1);
}

console.log(`Release metadata aligned for version ${version}`);
