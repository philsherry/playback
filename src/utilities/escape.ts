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
 * VHS types characters verbatim — it does not interpret escape sequences like
 * `\\` as a single backslash. The only character that needs escaping is the
 * backtick: VHS treats `` ` `` as a subcommand delimiter, so `` \` `` is used
 * to type a literal backtick.
 *
 * Double quotes (`"`) cannot appear in `Type "..."` strings — VHS has no escape
 * sequence for them and terminates the string at the first unescaped `"`. Commands
 * containing double quotes are rejected at the schema validation stage; this
 * function will never receive them.
 *
 * Backslashes do not need escaping: VHS types them as-is. A `\n` in a command
 * is typed as `\n` (backslash + n), which is what `printf` and similar tools
 * expect for their escape sequences.
 * @param command - Raw shell command string to escape. Must not contain `"`.
 * @returns The escaped string, safe to embed in `Type "..."`.
 */
export function escapeVhs(command: string): string {
	return command.replace(/`/g, '\\`');
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
