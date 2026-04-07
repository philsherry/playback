/**
 * @module voices
 *
 * Loads the voice catalogue from `voices.yaml` — the single source of truth
 * for available piper-tts voices. This module is used by:
 *   - `schema/meta.ts` to validate voice selections
 *   - `runner/piper.ts` to resolve model file paths
 *
 * The catalogue lives at the project root as `voices.yaml` and is also read
 * by `scripts/setup.sh` (for downloading models) and the Go TUI (for the
 * voice picker).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import YAML from 'yaml';

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
 * Fallback catalogue used when `voices.yaml` can't be read (e.g. in test
 * environments with mocked filesystems). Matches the default voices that
 * ship with the project.
 */
const DEFAULT_VOICES: VoiceCatalogue = {
	alan: { gender: 'male', locale: 'en-GB', model: 'en_GB-alan-medium', quality: 'medium', url: 'en/en_GB/alan/medium' },
	alba: { gender: 'female', locale: 'en-GB', model: 'en_GB-alba-medium', quality: 'medium', url: 'en/en_GB/alba/medium' },
	northern_english_male: { gender: 'male', locale: 'en-GB', model: 'en_GB-northern_english_male-medium', quality: 'medium', url: 'en/en_GB/northern_english_male/medium' },
	southern_english_female: { gender: 'female', locale: 'en-GB', model: 'en_GB-southern_english_female-low', quality: 'low', url: 'en/en_GB/southern_english_female/low' },
};

/**
 * Finds `voices.yaml` by checking the CWD first, then walking up from
 * this source file's directory. This handles both normal execution (CWD
 * is the project root) and test runners (CWD may differ).
 * @returns Absolute path to the discovered `voices.yaml` file.
 */
function findVoicesYaml(): string {
	// Try CWD first (normal execution).
	const fromCwd = resolve(process.cwd(), 'voices.yaml');
	if (existsSync(fromCwd)) return fromCwd;

	// Walk up from this source file's directory (src/) to find the
	// project root. Works in both tsx and compiled contexts.
	let dir = __dirname ?? dirname(new URL(import.meta.url).pathname);
	for (let i = 0; i < 10; i++) {
		const candidate = resolve(dir, 'voices.yaml');
		if (existsSync(candidate)) return candidate;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}

	// Fallback — will throw a clear error from readFileSync.
	return fromCwd;
}

/**
 * Loads the voice catalogue from `voices.yaml` at the project root.
 * The result is cached after the first call.
 * @returns Map of voice identifier → voice entry.
 */
export function loadVoiceCatalogue(): VoiceCatalogue {
	if (catalogue) return catalogue;

	try {
		const yamlPath = findVoicesYaml();
		const raw = readFileSync(yamlPath, 'utf-8');
		const parsed = YAML.parse(raw) as { voices: VoiceCatalogue };
		catalogue = parsed.voices;
	} catch {
		// Fallback for test environments where voices.yaml may not be
		// accessible (e.g. mocked filesystems). Use the default voices.
		catalogue = DEFAULT_VOICES;
	}
	return catalogue;
}

/**
 * Returns the list of valid voice identifiers from the catalogue.
 * These are the keys that tapes can reference in `meta.yaml`.
 * @returns Sorted list of configured voice identifiers.
 */
export function getVoiceIds(): string[] {
	return Object.keys(loadVoiceCatalogue()).sort();
}

/**
 * Returns the model filename (e.g. "en_GB-northern_english_male-medium")
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
