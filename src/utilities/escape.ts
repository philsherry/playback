/**
 * @module utilities/escape
 *
 * String escaping helpers for the two external tool integrations that require
 * non-standard escaping conventions: VHS `Type "..."` arguments and the ffmpeg
 * `subtitles=` filter path argument.
 *
 * In both cases backslashes must be escaped first to prevent double-escaping
 * characters that are processed in subsequent passes.
 */

/**
 * Escapes characters with special meaning inside a VHS `Type "..."` argument.
 *
 * VHS interprets `\`, `"`, and `` ` `` specially within double-quoted strings
 * passed to the `Type` directive. Backslashes are escaped first.
 * @param command - Raw shell command string to escape.
 * @returns The escaped string, safe to embed in `Type "..."`.
 */
export function escapeVhs(command: string): string {
	return command
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/`/g, '\\`');
}

/**
 * Escapes characters with special meaning in ffmpeg's `subtitles=` filter
 * path argument.
 *
 * ffmpeg's `-vf subtitles=<path>` requires backslashes and colons to be
 * backslash-escaped. Backslashes are escaped first to prevent double-escaping.
 * @param path - Absolute path to an ASS subtitle file.
 * @returns The escaped path, safe to embed in `subtitles=<path>`.
 */
export function escapeAssPath(path: string): string {
	return path.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
}
