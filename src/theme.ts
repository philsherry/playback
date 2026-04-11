/**
 * @file theme.ts
 * @module playback/theme
 *
 * CLI output colour themes for the playback logger.
 *
 * Each theme defines six semantic colour roles as ANSI SGR code strings
 * (the digits between `\x1b[` and `m`). An empty string means "no colour"
 * (the default terminal colour is used).
 *
 * Named presets can be loaded by name via {@link themeForName}. Users can
 * overlay individual roles from a `theme.yaml` file alongside the preset by
 * calling {@link loadTheme}.
 */

import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';
import * as v from 'valibot';

// ── Colour role type ──────────────────────────────────────────────────────────

/**
 * Semantic colour roles used by the CLI logger reporter.
 * Values are ANSI SGR code strings, e.g. `"32"` for green, `"1;33"` for
 * bold yellow. An empty string means no colour (terminal default).
 */
export interface CliTheme {
	/** ANSI code for accented / highlighted text. */
	accent: string;
	/** ANSI code for `logError` fatal errors. */
	error: string;
	/** ANSI code for `logInfo` progress messages. */
	info: string;
	/** ANSI code for de-emphasised text (verbose/muted). */
	muted: string;
	/** ANSI code for `logSuccess` completion lines. */
	success: string;
	/** ANSI code for `logWarn` warnings. */
	warn: string;
}

// ── Built-in presets ──────────────────────────────────────────────────────────

/**
 * All built-in theme names accepted by {@link themeForName}.
 */
export type ThemeName =
	| 'default'
	| 'tokyo-night'
	| 'tokyo-night-storm'
	| 'tokyo-night-moon'
	| 'tokyo-night-day'
	| 'catppuccin-mocha'
	| 'catppuccin-macchiato'
	| 'catppuccin-frappe'
	| 'catppuccin-latte'
	| 'dracula'
	| 'high-contrast';

/**
 * Converts a hex colour string (`#rrggbb`) to an ANSI 24-bit foreground SGR
 * code (`38;2;r;g;b`). Terminals that do not support truecolour will degrade
 * gracefully to their nearest 256-colour equivalent.
 * @param h - Hex colour string in `#rrggbb` format.
 * @returns ANSI 24-bit foreground SGR code string.
 */
function hex(h: string): string {
	const r = parseInt(h.slice(1, 3), 16);
	const g = parseInt(h.slice(3, 5), 16);
	const b = parseInt(h.slice(5, 7), 16);
	return `38;2;${r};${g};${b}`;
}

/**
 * Named CLI theme presets. Hex values sourced from each scheme's canonical
 * palette definitions.
 */
export const THEMES: Record<ThemeName, CliTheme> = {
	// ── Catppuccin Frappé ────────────────────────────────────────────────────
	// https://github.com/catppuccin/catppuccin (medium)
	'catppuccin-frappe': {
		accent:  hex('#ca9ee6'), // mauve
		error:   hex('#e78284'), // red
		info:    hex('#8caaee'), // blue
		muted:   hex('#737994'), // overlay0
		success: hex('#a6d189'), // green
		warn:    hex('#ef9f76'), // peach
	},

	// ── Catppuccin Latte ─────────────────────────────────────────────────────
	// https://github.com/catppuccin/catppuccin (light)
	'catppuccin-latte': {
		accent:  hex('#8839ef'), // mauve
		error:   hex('#d20f39'), // red
		info:    hex('#1e66f5'), // blue
		muted:   hex('#9ca0b0'), // overlay0
		success: hex('#40a02b'), // green
		warn:    hex('#fe640b'), // peach
	},

	// ── Catppuccin Macchiato ─────────────────────────────────────────────────
	// https://github.com/catppuccin/catppuccin (medium dark)
	'catppuccin-macchiato': {
		accent:  hex('#c6a0f6'), // mauve
		error:   hex('#ed8796'), // red
		info:    hex('#8aadf4'), // blue
		muted:   hex('#6e738d'), // overlay0
		success: hex('#a6da95'), // green
		warn:    hex('#f5a97f'), // peach
	},

	// ── Catppuccin Mocha ─────────────────────────────────────────────────────
	// https://github.com/catppuccin/catppuccin (darkest dark)
	'catppuccin-mocha': {
		accent:  hex('#cba6f7'), // mauve
		error:   hex('#f38ba8'), // red
		info:    hex('#89b4fa'), // blue
		muted:   hex('#6c7086'), // overlay0
		success: hex('#a6e3a1'), // green
		warn:    hex('#fab387'), // peach
	},

	// ── Default ──────────────────────────────────────────────────────────────
	'default': {
		accent: '',
		error: '',
		info: '',
		muted: '2',
		success: '',
		warn: '33',
	},

	// ── Dracula ──────────────────────────────────────────────────────────────
	// https://draculatheme.com/contribute (purple-tinted dark)
	'dracula': {
		accent:  hex('#bd93f9'), // purple
		error:   hex('#ff5555'), // red
		info:    hex('#8be9fd'), // cyan
		muted:   hex('#6272a4'), // comment
		success: hex('#50fa7b'), // green
		warn:    hex('#ffb86c'), // orange
	},

	// ── High Contrast ────────────────────────────────────────────────────────
	// WCAG AAA contrast ratios (7:1+) on typical dark terminals.
	// Matches the TUI high-contrast theme's colour intent.
	'high-contrast': {
		accent:  '1;33',   // bold bright yellow
		error:   '1;31',   // bold bright red
		info:    '1;37',   // bold white
		muted:   '2',      // dim
		success: '1;32',   // bold bright green
		warn:    '1;33',   // bold bright yellow
	},

	// ── Tokyo Night ──────────────────────────────────────────────────────────
	// https://github.com/folke/tokyonight.nvim (Night variant)
	'tokyo-night': {
		accent:  hex('#bb9af7'), // purple
		error:   hex('#f7768e'), // red
		info:    hex('#7aa2f7'), // blue
		muted:   hex('#414868'), // comment
		success: hex('#9ece6a'), // green
		warn:    hex('#e0af68'), // yellow
	},

	// ── Tokyo Night Day ──────────────────────────────────────────────────────
	// https://github.com/folke/tokyonight.nvim (Day variant — light)
	'tokyo-night-day': {
		accent:  hex('#9854f1'),
		error:   hex('#f52a65'),
		info:    hex('#2e7de9'),
		muted:   hex('#848cb5'),
		success: hex('#587539'),
		warn:    hex('#8c6c3e'),
	},

	// ── Tokyo Night Moon ─────────────────────────────────────────────────────
	// https://github.com/folke/tokyonight.nvim (Moon variant)
	'tokyo-night-moon': {
		accent:  hex('#c099ff'),
		error:   hex('#ff757f'),
		info:    hex('#82aaff'),
		muted:   hex('#444a73'),
		success: hex('#c3e88d'),
		warn:    hex('#ffc777'),
	},

	// ── Tokyo Night Storm ────────────────────────────────────────────────────
	// Slightly darker variant — matches the TUI default theme
	'tokyo-night-storm': {
		accent:  hex('#bb9af7'),
		error:   hex('#f7768e'),
		info:    hex('#7aa2f7'),
		muted:   hex('#565f89'),
		success: hex('#9ece6a'),
		warn:    hex('#e0af68'),
	},
};

// ── YAML override schema ──────────────────────────────────────────────────────

const CliThemeOverrideSchema = v.partial(
	v.object({
		accent:  v.string(),
		error:   v.string(),
		info:    v.string(),
		muted:   v.string(),
		success: v.string(),
		warn:    v.string(),
	})
);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the built-in theme for the given name, or `undefined` if not found.
 * Use this when you have a validated name (e.g. from the XDG config schema).
 * @param name - A {@link ThemeName} string, e.g. `'tokyo-night-storm'`.
 * @returns The matching {@link CliTheme}, or `undefined` if the name is unknown.
 */
export function themeForName(name: string): CliTheme | undefined {
	return THEMES[name as ThemeName];
}

/**
 * Loads the active CLI theme.
 *
 * Resolution order:
 * 1. Built-in preset for `name` (falls back to `'default'` if unknown).
 * 2. `theme.yaml` at `overridePath` — if it exists, its colour role values
 *    are merged on top of the preset so users can swap individual colours
 *    without redefining the full palette.
 * @param name - Built-in theme name (e.g. `'tokyo-night-storm'`).
 * @param overridePath - Optional path to a `theme.yaml` override file.
 * @returns The resolved {@link CliTheme}.
 */
export function loadTheme(name: string, overridePath?: string): CliTheme {
	const base: CliTheme = themeForName(name) ?? THEMES['default'];

	if (!overridePath || !existsSync(overridePath)) {
		return base;
	}

	try {
		const raw = readFileSync(overridePath, 'utf8');
		const parsed = parse(raw) as unknown;
		const result = v.safeParse(CliThemeOverrideSchema, parsed);
		if (result.success) {
			return { ...base, ...result.output };
		}
	} catch {
		// Malformed theme.yaml — silently fall back to the preset.
	}

	return base;
}
