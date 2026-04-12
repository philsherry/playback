# Release notes — v1.2.0

## Playlist command and CLI refactor

Playback 1.2.0 adds a `playlist` subcommand for batch-building all tapes in a
project consecutively, and refactors `cli.ts` into a clean command dispatcher.

### Batch builds with `playback playlist`

Run `playback playlist` from any project that uses `playback-cli` as a dependency
to build every tape in `tapesDir` in order. The command reads `tapesDir` from
`playback.config.ts` automatically — no extra setup required.

Pass `--tapes-dir <path>` to override the directory, or forward flags to every
tape invocation:

```sh
playback playlist                        # uses tapesDir from playback.config.ts
playback playlist --tapes-dir tapes/     # explicit path
playback playlist -- --vhs-only          # record terminals only, skip audio
```

Builds stop at the first failure so missing prerequisites do not produce a long
stream of duplicate errors.

### CLI dispatcher refactor

The tape pipeline logic moves from `cli.ts` into `src/commands/tape.ts`.
`cli.ts` is now a thin dispatcher — argument parsing and routing only.
No behaviour changes; this makes the CLI straightforward to extend.
