/**
 * @module schema
 *
 * Public re-exports for all playback schemas and their inferred types.
 *
 * Import schemas when you need to validate at runtime:
 * ```ts
 * import { TapeSchema, MetaSchema } from './schema';
 * ```
 *
 * Import types when you only need TypeScript types:
 * ```ts
 * import type { Tape, Meta } from './schema';
 * ```
 */

export { MetaSchema } from './meta';
export type { Meta } from './meta';

export { StepSchema, TapeSchema } from './tape';
export type { Step, Tape } from './tape';
