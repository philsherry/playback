# Changelog

All notable changes to this project appear in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.3] - 2026-04-07

### Added

- Agent instruction docs (`.agents/`) covering pipeline, structure, tapes, testing, timeline, TUI, and TUI UI
- GitHub Copilot instructions (`.github/copilot-instructions.md`)
- Claude code instructions (`CLAUDE.md`)

## [1.0.2] - 2026-04-07

### Fixed

- Fix the `tui` path.

## [1.0.1] - 2026-04-07

### Fixed

- Misaligned `validate` command in the `playback --help` output (leading tab, now matches the two-space indent of all other commands)

## [1.0.0] - 2026-04-05

First public release. TypeScript pipeline for recording and mixing, Go TUI for
post-production timing adjustments, and a full set of studio example tapes.

### Added

- **Create pipeline** — TypeScript CLI that turns a YAML tape file into a narrated, captioned terminal video. Generates a `VHS` recording, synthesises voiceover with `piper-tts`, produces captions (WebVTT, SRT, ASS), and stitches the final `.mp4` and `.gif` with `ffmpeg`
- **Edit TUI** — Go/`Bubbletea` post-production editor with a visual audio timeline, overlap detection, and narration nudge controls. Saves timing adjustments back to `tape.yaml`
- **Accessible editing modes** — sequential interactive mode (`--accessible`) for screen reader users, and a plain-text timing report (`--report`) for piping into other tools
- **Tape schema** — `Valibot`-validated `tape.yaml` (actions: `type`, `run`, `key`, `comment`, `narrate`) and `meta.yaml` (title, description, voices, series, episode, poster, tags, locale, version)
- **`narrate` action** — tape step type that starts narration and fires commands concurrently. The pipeline spaces commands evenly across the narration duration. Use for cold open sequences where terminal activity should happen during the voiceover
- **Multi-voice output** — configure one or more `piper-tts` voices per tape in `meta.yaml`; the pipeline generates a full output set per voice
- **Workspace system** — `workspace.example.yaml` defines external sources, sandbox mounts, and named `{{PLACEHOLDER}}` constants for tape commands. Copy to `workspace.yaml` and adjust paths for your setup. Lazy validation skips sources the tape does not reference
- **Video metadata** — MP4 files embed title, artist, description, series, episode, and language tags from `meta.yaml`. Defaults to "Created by Playback" for the artist credit
- **Web output** — `--web` flag generates standalone audio files and a `manifest.json` for web-based playback
- **Phonetic substitutions** — text replacements applied before TTS synthesis (e.g. "GOV.UK" to "guv yew-kay")
- **Caption formats** — WebVTT with positioning and colour, SRT as a universal fallback, ASS for `ffmpeg` burn-in
- **Chapter metadata** — every build writes a `chapters.txt` file (FFMETADATA1 format) with per-step timing markers. Use `ffprobe -show_chapters` or diff two `chapters.txt` files to benchmark timing changes across builds. MP4 chapter embedding works but waits on the tape schema gaining explicit `chapter` keys
- **Poster images** — `poster.png` in the tape directory, or a `poster` frame number in `meta.yaml`
- **TUI features** — tape picker (<kbd>o</kbd>), rendered `PROMPT.md` viewer (<kbd>m</kbd>), metadata editor (<kbd>M</kbd>), pipeline runner (<kbd>r</kbd>/<kbd>R</kbd>), undo stack (<kbd>u</kbd>), dirty-state guard, Tokyo Night Storm theme, high-contrast theme (`--high-contrast`), `NO_COLOR` support
- **Studio tapes** — `studio/example/` (standalone), `studio/demo-accessible/` (accessible mode), `studio/example-skills/` (workspace features), and `studio/demo-tui/` (self-referential TUI recording)
- **Documentation** — case study (`docs/CASE_STUDY.md`), TUI design (`docs/TUI.md`), voice synthesis guide (`docs/VOICE.md`), timing reference (`docs/TIMINGS.md`), studio walkthrough (`studio/README.md`)
- **Unified timeline** — single timing model drives both VHS recording and audio mixing, eliminating drift between video actions and narration
- **Timing tools** — `--audit` prints a timing comparison table after synthesis, `--audit-fix` writes corrected pauses to `tape.yaml`, `--debug-overlay` burns command labels into the video
- **202 tests** — TypeScript (`vitest`) and Go across parser, schemas, generators, extractors, utilities, captions, workspace, metadata, timeline, and TUI

[1.0.0]: https://github.com/philsherry/playback/releases/tag/v1.0.0
