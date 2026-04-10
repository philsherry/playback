/**
 * @module workspace/schema
 *
 * Valibot schema for `workspace.yaml` — the project-level configuration that
 * defines which external content is available during VHS recording sessions.
 *
 * A workspace config has three sections:
 * - **sources** — external directories (repos or folders) mounted into sessions
 * - **mounts** — how source paths map into the recording sandbox
 * - **constants** — named placeholders for use in `tape.yaml` commands as `{{KEY}}`
 */

import * as v from 'valibot';

/** Schema for a single source entry in `workspace.yaml`. */
const SourceSchema = v.object({
	/** Path to the source directory, relative to project root or absolute. */
	path: v.string(),
	/** Directories that must exist inside the source for validation. */
	required: v.optional(v.array(v.string()), []),
});

/** Schema for a single mount entry in `workspace.yaml`. */
const MountSchema = v.object({
	/** Sandbox-relative path (what tapes see during recording). */
	sandbox: v.string(),
	/** Source-relative path (prefixed with the source name). */
	source: v.string(),
});

/** Schema for the top-level `workspace.yaml` document. */
export const WorkspaceSchema = v.object({
	/** Named placeholders available in tape.yaml commands as `{{KEY}}`. */
	constants: v.optional(v.record(v.string(), v.string()), {}),
	/** How source directories map into the VHS sandbox. */
	mounts: v.optional(v.array(MountSchema), []),
	/** External directories used by tapes. Keyed by a short name. */
	sources: v.optional(v.record(v.string(), SourceSchema), {}),
});

/** Validated type for a parsed `workspace.yaml` file. */
export type WorkspaceConfig = v.InferOutput<typeof WorkspaceSchema>;

/** A single resolved source with an absolute path. */
export interface ResolvedSource {
	absolutePath: string;
	name: string;
	required: string[];
}

/** Workspace config with all source paths resolved to absolute. */
export interface ResolvedWorkspace {
	constants: Record<string, string>;
	mounts: v.InferOutput<typeof MountSchema>[];
	sources: ResolvedSource[];
}
