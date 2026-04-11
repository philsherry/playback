/**
 * @file logger.ts
 * @module playback/logger
 *
 * Structured logger for the playback CLI, wrapping consola.
 *
 * Log levels:
 *   error   — fatal errors (✗)
 *   warn    — subprocess warnings, fixed-timing notices
 *   info    — progress messages (default)
 *   success — completion lines (✓)
 *   verbose — per-voice detail, full subprocess output
 *
 * Call `configureLogger({ level, theme })` once at startup (in cli.ts) before
 * any logging occurs. The reporter reads the active theme colours so the output
 * matches the user's chosen palette.
 */

import { createConsola, type ConsolaReporter, type LogObject } from 'consola';
import { THEMES, type CliTheme } from './theme';

// ── Log levels ────────────────────────────────────────────────────────────────

/**
 * Named log levels accepted by `configureLogger`. Maps to consola numeric
 * levels: silent=0, error=1, warn=2, info=3, verbose=5.
 */
export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'verbose';

const LEVEL_MAP: Record<LogLevel, number> = {
	error: 1,
	info: 3,
	silent: 0,
	verbose: Number.POSITIVE_INFINITY, // consola maps verbose to POSITIVE_INFINITY
	warn: 2,
};

// ── Theme-aware reporter ──────────────────────────────────────────────────────

/**
 * ANSI escape helper — wraps `text` in the given colour code and resets after.
 * When `code` is empty the text is returned as-is (used for `default` theme).
 * @param code - ANSI SGR code string, e.g. `"32"` for green. Empty = no colour.
 * @param text - The string to wrap.
 * @returns The ANSI-escaped string, or `text` unchanged when `code` is empty.
 */
function ansi(code: string, text: string): string {
	if (!code) return text;
	return `\x1b[${code}m${text}\x1b[0m`;
}

/**
 * Builds a consola reporter that formats output using the active CLI theme.
 * Each log level gets a symbol and colour derived from the theme's colour roles.
 * @param theme - Active CLI theme supplying ANSI colour codes per log level.
 * @returns A consola reporter configured for the given theme.
 */
function buildReporter(theme: CliTheme): ConsolaReporter {
	return {
		log(logObj: LogObject) {
			const level = logObj.level;

			// verbose (POSITIVE_INFINITY) and debug (level 4)
			if (level >= 4) {
				const line = formatArgs(logObj.args);
				process.stderr.write(`${ansi(theme.muted, line)}\n`);
				return;
			}

			// error (level 0)
			if (level <= 0) {
				const line = formatArgs(logObj.args);
				process.stderr.write(`${ansi(theme.error, line)}\n`);
				return;
			}

			// warn (level 1)
			if (level === 1) {
				const line = formatArgs(logObj.args);
				process.stderr.write(`${ansi(theme.warn, `  ${line}`)}\n`);
				return;
			}

			// success (logObj.type === 'success')
			if (logObj.type === 'success') {
				const line = formatArgs(logObj.args);
				process.stdout.write(`${ansi(theme.success, line)}\n`);
				return;
			}

			// info (level 3)
			const line = formatArgs(logObj.args);
			process.stdout.write(`${ansi(theme.info, line)}\n`);
		},
	};
}

/**
 * Flattens the args array from a LogObject into a single string, mimicking
 * the default console.log behaviour for mixed string/object arguments.
 * @param args - Raw args from a consola {@link LogObject}.
 * @returns A single concatenated string.
 */
function formatArgs(args: unknown[]): string {
	return args
		.map((a) =>
			typeof a === 'string' ? a : JSON.stringify(a, null, 2)
		)
		.join(' ');
}

// ── Singleton instance ────────────────────────────────────────────────────────

let _currentLevel: LogLevel = 'info';
let _reporter = buildReporter(THEMES['default']);

let _logger = createConsola({
	level: LEVEL_MAP['info'],
	reporters: [_reporter],
});

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Reconfigures the logger with a new level and/or theme.
 * Call once at CLI startup after flags and XDG config have been resolved.
 * @param opts - Configuration options.
 * @param opts.level - Named log level string.
 * @param opts.theme - Active CLI theme (determines ANSI colours).
 */
export function configureLogger(opts: { level?: LogLevel; theme?: CliTheme }): void {
	if (opts.level !== undefined) {
		_currentLevel = opts.level;
	}
	if (opts.theme) {
		_reporter = buildReporter(opts.theme);
	}
	_logger = createConsola({
		level: LEVEL_MAP[_currentLevel],
		reporters: [_reporter],
	});
}

/**
 * Log an info-level progress message.
 * @param message - Text to log.
 */
export function logInfo(message: string): void {
	_logger.info(message);
}

/**
 * Log a success completion line (✓ …).
 * @param message - Text to log.
 */
export function logSuccess(message: string): void {
	_logger.success(message);
}

/**
 * Log a warning that surfaces without requiring a failure.
 * @param message - Text to log.
 */
export function logWarn(message: string): void {
	_logger.warn(message);
}

/**
 * Log a fatal error (✗ …). Writes to stderr.
 * @param message - Text to log.
 */
export function logError(message: string): void {
	_logger.error(message);
}

/**
 * Log verbose detail (per-voice, subprocess output). Hidden unless --verbose.
 * @param message - Text to log.
 */
export function logVerbose(message: string): void {
	_logger.verbose(message);
}

/**
 * Returns `true` when the logger is configured at verbose level (level ≥ 5).
 * Used by runners to decide whether to pass subprocess output through.
 * @returns `true` if the current log level is verbose.
 */
export function isVerbose(): boolean {
	return _logger.level >= 5;
}
