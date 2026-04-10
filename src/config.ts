import { resolve } from 'node:path';
import type { Voice } from './schema/meta';

/**
 * Project-level configuration for playback.
 *
 * Create a `playback.config.ts` (or `.js` / `.mjs`) in your project root to
 * override defaults. Use the {@link defineConfig} helper for type safety:
 *
 * ```ts
 * import { defineConfig } from './src/config';
 * export default defineConfig({ outputDir: 'output' });
 * ```
 *
 * TypeScript configs are resolved via `tsx`.
 */
export interface PlaybackConfig {
	/**
	 * Default voices when not specified in a tape's `meta.yaml`.
	 * Must contain at least one entry.
	 * @default ['northern_english_male']
	 */
	defaultVoices?: [Voice, ...Voice[]];

	/**
	 * Nudge step size in seconds for the TUI timing editor. Each arrow-key
	 * press shifts a narration clip's start time by this amount.
	 * @default 0.25
	 */
	nudgeStep?: number;

	/**
	 * Directory where rendered output (mp4, gif, webvtt) is written.
	 * @default 'blockbuster'
	 */
	outputDir?: string;

	/**
	 * Root directory scanned for tape directories by `playlist:build`.
	 * @default 'tapes'
	 */
	tapesDir?: string;

	/**
	 * Directory containing piper-tts `.onnx` voice model files.
	 * @default 'voices'
	 */
	voicesDir?: string;

	/**
	 * Generate web-friendly output alongside the standard pipeline output.
	 * When enabled, produces a standalone `.m4a` audio track per voice and
	 * a `manifest.json` listing all available assets for web playback.
	 * @default false
	 */
	webOutput?: boolean;
}

/** Resolved config with all defaults applied. */
export type ResolvedConfig = Required<PlaybackConfig>;

/**
 * Type-safe helper for authoring a `playback.config.ts`.
 * Returns the config object unchanged — exists solely for editor intellisense.
 * @param config - Partial project-level overrides.
 * @returns The same config object, fully typed.
 */
export function defineConfig(config: PlaybackConfig): PlaybackConfig {
	return config;
}

/** Defaults applied when no config file is found, or for any omitted fields. */
export const CONFIG_DEFAULTS: ResolvedConfig = {
	defaultVoices: ['northern_english_male'],
	nudgeStep: 0.25,
	outputDir: 'blockbuster',
	tapesDir: 'tapes',
	voicesDir: 'voices',
	webOutput: false
};

/**
 * Loads the project-level config from `playback.config.{js,mjs,ts}` in the
 * current working directory, merging with {@link CONFIG_DEFAULTS}.
 *
 * Candidate paths are tried in order: `.js` → `.mjs` → `.ts`. The `.ts`
 * variant only loads when the process is running under a TypeScript-aware
 * runtime such as `tsx`. Silently falls back to defaults if no file is found.
 * @returns Fully resolved config with all defaults applied.
 */
export async function loadConfig(): Promise<ResolvedConfig> {
	const cwd = process.cwd();
	const candidates = [
		resolve(cwd, 'playback.config.js'),
		resolve(cwd, 'playback.config.mjs'),
		resolve(cwd, 'playback.config.ts')
	];

	for (const candidate of candidates) {
		try {
			const mod = (await import(candidate)) as
				| { default?: PlaybackConfig }
				| PlaybackConfig;
			const userConfig: PlaybackConfig =
				'default' in mod && mod.default != null
					? mod.default
					: (mod as PlaybackConfig);
			return {
				...CONFIG_DEFAULTS,
				...userConfig
			};
		} catch {
			// Not found or not loadable in this runtime — try next candidate.
		}
	}

	return { ...CONFIG_DEFAULTS };
}
