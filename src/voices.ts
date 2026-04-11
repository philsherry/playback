/**
 * @module voices
 *
 * Loads the voice catalogue from the XDG config directory and an optional
 * project-level override. The merge chain is:
 *
 *   1. `$XDG_CONFIG_HOME/playback/voices.yaml` — user-level base (installed
 *      by `npm run setup` from `voices.example.yaml`)
 *   2. `{project}/voices.yaml` — project-level overrides (gitignored);
 *      project entries win on name collision
 *
 * Falls back to built-in defaults when neither file is present (e.g. in
 * test environments before `npm run setup` has been run).
 *
 * This module is used by:
 *   - `schema/meta.ts` to validate voice selections
 *   - `runner/piper.ts` to resolve model file paths
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { join } from 'node:path';
import YAML from 'yaml';
import { xdgConfigDir } from './paths';

/** Shape of a single voice entry in voices.yaml. */
export interface VoiceEntry {
	gender: string;
	locale: string;
	model: string;
	quality: string;
	url: string;
}

/** The full catalogue keyed by voice identifier. */
export type VoiceCatalogue = Record<string, VoiceEntry>;

/** Cached catalogue — loaded once on first access. */
let catalogue: VoiceCatalogue | null = null;

/**
 * Fallback catalogue used when no catalogue file can be read (e.g. in test
 * environments before `npm run setup` has been run). Matches the voices that
 * ship in `voices.example.yaml`.
 */
const DEFAULT_VOICES: VoiceCatalogue = {
	alan: { gender: 'male', locale: 'en-GB', model: 'en_GB-alan-medium', quality: 'medium', url: 'en/en_GB/alan/medium' },
	alba: { gender: 'female', locale: 'en-GB', model: 'en_GB-alba-medium', quality: 'medium', url: 'en/en_GB/alba/medium' },
	northern_english_male: { gender: 'male', locale: 'en-GB', model: 'en_GB-northern_english_male-medium', quality: 'medium', url: 'en/en_GB/northern_english_male/medium' },
	southern_english_female: { gender: 'female', locale: 'en-GB', model: 'en_GB-southern_english_female-low', quality: 'low', url: 'en/en_GB/southern_english_female/low' },
};

/**
 * Reads a voices.yaml file at the given path. Returns an empty object when
 * the file is absent or unparseable — callers merge the result, so an empty
 * object is a safe no-op.
 * @param path - Absolute path to a voices.yaml file.
 * @returns Catalogue entries from the file, or `{}` on failure.
 */
function readCatalogueFile(path: string): VoiceCatalogue {
	try {
		const raw = readFileSync(path, 'utf-8');
		const parsed = YAML.parse(raw) as { voices?: VoiceCatalogue };
		return parsed?.voices ?? {};
	} catch {
		return {};
	}
}

/**
 * Searches for a project-level `voices.yaml` by checking the CWD first,
 * then walking up from this source file's directory. This handles both
 * normal execution (CWD is the project root) and test runners (CWD may
 * differ).
 * @returns Absolute path to the discovered `voices.yaml`, or `null`.
 */
function findProjectVoicesYaml(): string | null {
	const fromCwd = resolve(process.cwd(), 'voices.yaml');
	if (existsSync(fromCwd)) return fromCwd;

	// Walk up from this source file's directory (src/) to find the project
	// root. Works in both tsx and compiled contexts.
	let dir =
		typeof __dirname === 'undefined'
			? dirname(new URL(import.meta.url).pathname)
			: __dirname;
	for (let i = 0; i < 10; i++) {
		const candidate = resolve(dir, 'voices.yaml');
		if (existsSync(candidate)) return candidate;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}

	return null;
}

/**
 * Loads the merged voice catalogue. Called once; result is cached.
 *
 * Merge order: XDG user catalogue (base) → project `voices.yaml` (overlay).
 * Project entries win on name collision. Falls back to built-in defaults
 * when neither catalogue file is present.
 * @returns Map of voice identifier → voice entry.
 */
export function loadVoiceCatalogue(): VoiceCatalogue {
	if (catalogue) return catalogue;

	// 1. XDG user-level base catalogue.
	const xdgPath = join(xdgConfigDir(), 'voices.yaml');
	const xdgVoices = readCatalogueFile(xdgPath);

	// 2. Project-level overlay (gitignored; optional).
	const projectPath = findProjectVoicesYaml();
	const projectVoices = projectPath ? readCatalogueFile(projectPath) : {};

	// 3. Merge: XDG base + project on top. Fall back to built-in defaults
	//    only when both sources are empty.
	const merged = { ...xdgVoices, ...projectVoices };
	catalogue = Object.keys(merged).length > 0 ? merged : DEFAULT_VOICES;

	return catalogue;
}

/**
 * Returns the list of valid voice identifiers from the merged catalogue.
 * These are the keys that tapes can reference in `meta.yaml`.
 * @returns Sorted list of configured voice identifiers.
 */
export function getVoiceIds(): string[] {
	return Object.keys(loadVoiceCatalogue()).sort();
}

/**
 * Returns the model filename (e.g. `"en_GB-northern_english_male-medium"`)
 * for a given voice identifier.
 * @param voiceId - Voice identifier from the catalogue.
 * @returns Model filename for the requested voice.
 * @throws {Error} If the voice is not in the catalogue.
 */
export function getVoiceModel(voiceId: string): string {
	const entry = loadVoiceCatalogue()[voiceId];
	if (!entry) {
		throw new Error(`Unknown voice "${voiceId}". Available: ${getVoiceIds().join(', ')}`);
	}
	return entry.model;
}
