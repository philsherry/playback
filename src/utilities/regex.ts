/**
 * @module utilities/regex
 *
 * Named regular expression patterns shared across the pipeline.
 *
 * Centralising patterns here makes them independently testable and gives each
 * one a name that documents its intent at the call site.
 */

/**
 * Matches one or more whitespace characters (space, tab, newline, etc.).
 *
 * Used to split narration text into words for duration estimation. Handles
 * any run of whitespace as a single word boundary, so extra spaces or
 * line-broken narration strings are counted correctly.
 */
export const WHITESPACE_SPLIT = /\s+/;

/**
 * Matches a trailing `/tape.yaml` or `/tape.yml` segment at the end of a path.
 *
 * Used by the parser to normalise paths that point directly to the `tape.yaml`
 * file rather than to its parent directory. The `.ya?ml` variant handles both
 * common YAML extensions.
 */
export const TAPE_YAML_SUFFIX = /\/tape\.ya?ml$/;
