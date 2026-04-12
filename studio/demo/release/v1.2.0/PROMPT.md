---
title: "What's new in playback 1.2.0"
version: "1.2.0"
duration: ~75 seconds
---

## What this video shows

A walkthrough of the two headline changes in playback 1.2.0: the `playlist`
subcommand for batch-building all tapes in a project consecutively, and the
CLI refactor that moved the tape pipeline out of `cli.ts` into `src/commands/`.

## What you will see

1. `find studio -name tape.yaml | sort` — tape discovery: the four tapes in the
   studio directory, including the archived `v1.1.0` release tape.
2. The three `playlist` invocation forms printed to the terminal.
3. `ls src/commands/` — the new command modules.

## Before recording

1. **Build the project:**
   ```sh
   npm run build
   ```

2. **Install the CLI globally** (or ensure `playback` is in PATH):
   ```sh
   npm link
   ```

3. **Confirm the theme** — `~/.config/playback/config.yaml` should have
   `theme: catppuccin-mocha`. The `vhs.theme` in `meta.yaml` matches this.

## What you will need

- playback 1.2.0 built and linked (`npm run build && npm link`)
- `~/.config/playback/config.yaml` with `theme: catppuccin-mocha`
