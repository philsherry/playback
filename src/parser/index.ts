/**
 * @module parser
 *
 * Reads and validates a tape directory, producing a {@link ParsedTape} that
 * is passed to every downstream pipeline stage.
 *
 * A tape directory contains:
 * - `tape.yaml` — the recording script (required).
 * - `meta.yaml` — episode metadata: title, voices, poster step, etc. (required).
 * - `poster.png` — optional still image that overrides the auto-generated poster.
 *
 * Both YAML files are validated against their valibot schemas. Any validation
 * failure throws a {@link ParseError} with a human-readable issue list.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import * as v from 'valibot';
import { MetaSchema, TapeSchema } from '../schema/index';
import type { ParsedTape } from '../types';
import { TAPE_YAML_SUFFIX } from '../utilities/regex';
import type { TapeConstants } from '../workspace';

/**
 * Thrown when a tape or meta file cannot be read, parsed, or validated.
 *
 * `file` identifies which file triggered the error (useful when multiple
 * files are parsed in the same pipeline run). `issues` is only present for
 * schema validation failures — it is omitted for file-not-found and
 * YAML-parse errors.
 */
export class ParseError extends Error {
	constructor(
		message: string,
		/** Absolute path to the file that caused the error. */
		public readonly file: string,
		/** Valibot issues from schema validation, if applicable. */
		public readonly issues?: v.BaseIssue<unknown>[]
	) {
		super(message);
		this.name = 'ParseError';
	}
}

/**
 * Reads and parses a YAML file, throwing {@link ParseError} on any failure.
 * @param filePath - Absolute path to the YAML file.
 * @returns The parsed YAML value (an `unknown` — validate before use).
 */
function readYaml(filePath: string): unknown {
	if (!existsSync(filePath)) {
		throw new ParseError(`File not found: ${filePath}`, filePath);
	}

	try {
		return parseYaml(readFileSync(filePath, 'utf8'));
	} catch {
		throw new ParseError(`Failed to parse YAML: ${filePath}`, filePath);
	}
}

/**
 * Reads, parses, and validates a tape directory, returning a {@link ParsedTape}.
 *
 * Accepts either a directory path (`tapes/s1/01-episode`) or a direct path to
 * `tape.yaml` (`tapes/s1/01-episode/tape.yaml`) — the file suffix is stripped
 * automatically. The directory is resolved to an absolute path before reading.
 *
 * Both `tape.yaml` and `meta.yaml` must be present and valid. A missing or
 * invalid file throws {@link ParseError} with the full validation issue list.
 * @param tapeDirOrFile - Path to the tape directory, or to `tape.yaml` within it.
 * @param tapeConstants - Named command placeholders to substitute in `type` steps.
 * @returns Validated tape, meta, source directory, and optional poster path.
 */
export function parseTape(tapeDirOrFile: string, tapeConstants: TapeConstants = {}): ParsedTape {
	const dir = resolve(
		tapeDirOrFile.endsWith('.yaml') || tapeDirOrFile.endsWith('.yml')
			? tapeDirOrFile.replace(TAPE_YAML_SUFFIX, '')
			: tapeDirOrFile
	);

	if (!existsSync(dir)) {
		throw new ParseError(`Tape directory not found: ${dir}`, dir);
	}

	// tape.yaml
	const tapeFile = join(dir, 'tape.yaml');
	const tapeRaw = readYaml(tapeFile);
	const tapeResult = v.safeParse(TapeSchema, tapeRaw);

	if (!tapeResult.success) {
		throw new ParseError(
			formatIssues('tape.yaml', tapeResult.issues),
			tapeFile,
			tapeResult.issues
		);
	}

	const substitutedTape = substituteTapeConstants(tapeResult.output, tapeFile, tapeConstants);

	// meta.yaml
	const metaFile = join(dir, 'meta.yaml');
	const metaRaw = readYaml(metaFile);
	const metaResult = v.safeParse(MetaSchema, metaRaw);

	if (!metaResult.success) {
		throw new ParseError(
			formatIssues('meta.yaml', metaResult.issues),
			metaFile,
			metaResult.issues
		);
	}

	// poster.png — present or not, no error either way
	const posterPath = join(dir, 'poster.png');
	const posterFile = existsSync(posterPath) ? posterPath : null;

	return {
		dir,
		meta: metaResult.output,
		posterFile,
		tape: substitutedTape,
	};
}

/**
 * Replaces named placeholders in `type` step commands.
 * Non-command steps are left untouched.
 * @param parsedTape - Parsed tape definition to transform.
 * @param file - Source `tape.yaml` path for error reporting.
 * @param tapeConstants - Named placeholder values.
 * @returns Tape with placeholder-free shell commands.
 */
function substituteTapeConstants(parsedTape: ParsedTape['tape'], file: string, tapeConstants: TapeConstants): ParsedTape['tape'] {
	return {
		...parsedTape,
		steps: parsedTape.steps.map((step, index) => {
			if (step.action === 'type') {
				return {
					...step,
					command: replaceTemplateConstants(step.command, tapeConstants, file, index),
				};
			}

			if (step.action === 'narrate') {
				return {
					...step,
					commands: step.commands.map((cmd) =>
						replaceTemplateConstants(cmd, tapeConstants, file, index),
					),
				};
			}

			return step;
		}),
	};
}

/**
 * Resolves `{{CONSTANT_NAME}}` placeholders inside a shell command.
 * Throws a `ParseError` when a placeholder name is unknown.
 * @param command - Raw shell command from `tape.yaml`.
 * @param tapeConstants - Named placeholder values.
 * @param file - Source `tape.yaml` path for error reporting.
 * @param stepIndex - Zero-based step index for error reporting.
 * @returns Command with placeholders replaced by concrete paths.
 */
function replaceTemplateConstants(command: string, tapeConstants: TapeConstants, file: string, stepIndex: number): string {
	return command.replace(/{{\s*([A-Z0-9_]+)\s*}}/g, (_match, key: string) => {
		const replacement = tapeConstants[key];
		if (replacement == null) {
			throw new ParseError(
				`Unknown tape constant in tape.yaml step ${stepIndex + 1}: ${key}`,
				file
			);
		}

		return replacement;
	});
}

/**
 * Formats valibot issues into a human-readable multi-line string.
 *
 * Each issue is printed as `  <dotPath>: <message>`. The dot path identifies
 * the offending field within the YAML structure (e.g. `steps.0.action`).
 * @param file - Filename to include in the heading (e.g. `"tape.yaml"`).
 * @param issues - Valibot issue array from a failed `safeParse` call.
 * @returns Formatted error string suitable for passing to {@link ParseError}.
 */
function formatIssues(file: string, issues: v.BaseIssue<unknown>[]): string {
	const lines = issues.map((issue) => {
		const path = v.getDotPath(issue) ?? '(root)';
		return `  ${path}: ${issue.message}`;
	});

	return `Invalid ${file}:\n${lines.join('\n')}`;
}
