/**
 * @file init-agent.ts
 * @module playback/commands/init-agent
 *
 * Installs the playback-runner agent files into the current project:
 *   - `.claude/agents/playback-runner.md`   (Claude Code)
 *   - `.github/prompts/playback-runner.prompt.md`  (GitHub Copilot)
 */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logInfo, logSuccess, logWarn } from '../logger';

const AGENT_FILENAME = 'playback-runner.md';
const PROMPT_FILENAME = 'playback-runner.prompt.md';

interface InitAgentOptions {
	force: boolean;
	projectRoot: string;
}

/**
 * Resolves the path to the templates directory bundled with the package.
 * Works whether running from `dist/` (published) or `src/` (dev via tsx).
 * @returns Absolute path to the `templates/` directory.
 */
function resolveTemplatesDir(): string {
	const currentFile = fileURLToPath(import.meta.url);
	// dist/commands/init-agent.js → dist/ → package root → templates/
	// src/commands/init-agent.ts  → src/ → package root → templates/
	return join(dirname(dirname(currentFile)), 'templates');
}

/**
 * Copies a template file to a destination, creating parent directories as needed.
 * Returns `true` if the file was written, `false` if it was skipped.
 * @param src - Absolute path to the source template file.
 * @param dest - Absolute path to the destination file.
 * @param force - When `true`, overwrite an existing file.
 * @returns `true` if the file was written, `false` if skipped.
 */
function installFile(src: string, dest: string, force: boolean): boolean {
	if (existsSync(dest) && !force) {
		logWarn(`  Already exists: ${dest}`);
		logWarn('  Use --force to overwrite.');
		return false;
	}
	mkdirSync(dirname(dest), { recursive: true });
	copyFileSync(src, dest);
	return true;
}

/**
 * Installs the playback-runner agent files into the current project.
 * @param root0 - Options object.
 * @param root0.force - When `true`, overwrite existing agent files.
 * @param root0.projectRoot - Absolute path to the project root.
 */
export async function runInitAgent({ force, projectRoot }: InitAgentOptions): Promise<void> {
	const templatesDir = resolveTemplatesDir();

	const targets = [
		{
			dest: join(projectRoot, '.claude', 'agents', AGENT_FILENAME),
			label: 'Claude Code agent',
			src: join(templatesDir, 'agents', AGENT_FILENAME),
		},
		{
			dest: join(projectRoot, '.github', 'prompts', PROMPT_FILENAME),
			label: 'GitHub Copilot prompt',
			src: join(templatesDir, 'prompts', PROMPT_FILENAME),
		},
	];

	logInfo('Installing playback-runner agent…');

	let written = 0;
	for (const { dest, label, src } of targets) {
		if (installFile(src, dest, force)) {
			logSuccess(`  ✓ ${label}: ${dest}`);
			written++;
		}
	}

	if (written > 0) {
		logSuccess('\n✓ Done. Users can now ask @playback-runner questions about Playback.');
	}
}
