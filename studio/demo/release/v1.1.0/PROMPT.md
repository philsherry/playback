---
title: "What's new in playback 1.1.0"
version: "1.1.0"
duration: ~90 seconds
---

## What this video shows

A walkthrough of the three headline features shipped in playback 1.1.0:
structured logging with consola, configurable CLI colour themes, and the
XDG voices catalogue with project-level overrides.

## What you will see

1. `playback validate` at three verbosity levels: default (info), `--quiet`, and `--verbose`.
2. `~/.config/playback/config.yaml` with `theme: catppuccin-mocha` set — the terminal output reflects the active theme throughout the recording.
3. `~/.config/playback/voices.yaml` — the user-level XDG catalogue bootstrapped by `npm run setup`.
4. `voices.yaml` — a project-level override demonstrating the merge chain.

## Before recording

The following must be in place before starting VHS:

1. **Build the project:**
   ```sh
   npm run build
   ```

2. **Install the CLI globally** (or ensure `playback` is in PATH):
   ```sh
   npm link
   ```

3. **Bootstrap the XDG config and voices catalogue:**
   ```sh
   npm run setup
   ```
   This creates `~/.config/playback/config.yaml` and `~/.config/playback/voices.yaml`,
   then downloads voice models.

4. **Set the demo theme** — edit `~/.config/playback/config.yaml` and set:
   ```yaml
   theme: catppuccin-mocha
   ```
   The VHS theme in `meta.yaml` matches this so the terminal colours are consistent.

5. **Create a project-level voices override** at `voices.yaml` in the project root.
   A minimal example showing a second voice entry alongside the base catalogue
   is enough to demonstrate the merge chain.

## What you will need

- playback 1.1.0 built and installed (`npm run build && npm link`)
- `~/.config/playback/config.yaml` with `theme: catppuccin-mocha` (bootstrapped by `npm run setup`, then edit the theme)
- `~/.config/playback/voices.yaml` (bootstrapped by `npm run setup`)
- `voices.yaml` in the project root (project-level override, gitignored)
- The example tape built and validated (`studio/example/tape`)
