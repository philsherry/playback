/**
 * @file config/xdg.ts
 * @module playback/config/xdg
 *
 * XDG user-level config for playback.
 *
 * Reads `$XDG_CONFIG_HOME/playback/config.yaml` (falls back to
 * `~/.config/playback/config.yaml`) and validates it with valibot.
 *
 * Schema:
 * ```yaml
 * logLevel: info              # silent | error | warn | info | verbose
 * theme: tokyo-night-storm    # any built-in theme name
 * voices:                     # user-level default voices
 *   - northern_english_male
 * ```
 *
 * Precedence (highest to lowest):
 *   CLI flags → playback.config.ts (per-project) → config.yaml (per-user) → built-in defaults
 *
 * A `theme.yaml` file placed alongside `config.yaml` in the same directory can
 * override individual colour roles without redefining the full palette.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import * as v from 'valibot';
import { xdgConfigDir } from '../paths';
import type { LogLevel } from '../logger';
import type { Voice } from '../schema/meta';

// ── Schema ────────────────────────────────────────────────────────────────────

const XdgConfigSchema = v.partial(
	v.object({
		logLevel: v.picklist(['silent', 'error', 'warn', 'info', 'verbose'] as const),
		theme: v.string(),
		voices: v.array(v.string()),
	})
);

// ── Types ─────────────────────────────────────────────────────────────────────

/** Validated contents of `$XDG_CONFIG_HOME/playback/config.yaml`. */
export interface XdgConfig {
	/** Named log level. CLI flags (`--quiet`, `--verbose`) override this. */
	logLevel?: LogLevel;
	/** Built-in theme name (e.g. `'tokyo-night-storm'`). Falls back to `'default'`. */
	theme?: string;
	/** User-level default voices. Overridden by per-project `playback.config.ts`. */
	voices?: Voice[];
}

// ── Path helpers ──────────────────────────────────────────────────────────────

/**
 * Returns the absolute path to the XDG playback config file.
 * @returns Path to `$XDG_CONFIG_HOME/playback/config.yaml`.
 */
export function xdgConfigPath(): string {
	return join(xdgConfigDir(), 'config.yaml');
}

/**
 * Returns the absolute path to the optional theme override file.
 * When this file exists, its colour role values are merged on top of the
 * named theme preset — allowing users to swap individual colours without
 * redefining the full palette.
 * @returns Path to `$XDG_CONFIG_HOME/playback/theme.yaml`.
 */
export function xdgThemeOverridePath(): string {
	return join(xdgConfigDir(), 'theme.yaml');
}

// ── Loader ────────────────────────────────────────────────────────────────────

/**
 * Reads and validates the XDG user config file.
 *
 * Returns `null` when the file does not exist or cannot be parsed — callers
 * should treat `null` as "no user config" and fall through to built-in defaults.
 * @returns Validated {@link XdgConfig}, or `null` if absent or malformed.
 */
export function loadXdgConfig(): XdgConfig | null {
	const configPath = xdgConfigPath();

	if (!existsSync(configPath)) {
		return null;
	}

	try {
		const raw = readFileSync(configPath, 'utf8');
		const parsed = parse(raw) as unknown;
		const result = v.safeParse(XdgConfigSchema, parsed);
		if (result.success) {
			return result.output as XdgConfig;
		}
	} catch {
		// Malformed YAML or filesystem error — silently fall back to defaults.
	}

	return null;
}
