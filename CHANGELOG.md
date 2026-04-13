# Changelog

All notable changes to this project appear in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.3] - 2026-04-13

### Fixed

- **`vhs.shell` schema validation** — `meta.yaml` now rejects `vhs.shell` values containing double-quote characters; VHS `Set Shell "..."` has no escape sequence for `"` and would silently produce an invalid `.tape` file
- **Shell override in `generateVhsFromTimeline`** — the timeline VHS generator hard-coded `Set Shell "zsh"` regardless of `meta.yaml`'s `vhs.shell` override, diverging from `generateVhsTape`; now uses `vhsOverrides?.shell ?? SHELL`
- **Chapter marker priority in TUI step list** — the `§` chapter marker unconditionally overwrote the `▸` cursor and `!` overlap markers for selected or flagged chapter steps; cursor and overlap markers now take precedence
- **`scaffold.ts` YAML frontmatter quoting** — episode titles containing `:`, `#`, or other YAML-special characters appeared unquoted in output, producing invalid YAML that downstream parsers would reject; titles are now double-quoted with embedded `"` escaped
- **FFMETADATA1 chapter title escaping** — `=`, `;`, `#`, `\`, and newlines in chapter titles went unescaped; ffmpeg rejects files where values contain bare `=` or `;`. All four are now escaped per the FFMETADATA1 spec; newlines replaced with a space
- **Redundant conditional in `scaffold.ts`** — `step.action === 'narrate' ? step.narration : step.narration` simplified to `step.narration`
- **`--captions-only` unnecessarily recorded terminal** — `runVhs` ran unconditionally before the voice loop; `--captions-only` skipped ffmpeg inside the loop but still paid the full VHS recording cost and could overwrite existing raw recordings. Both `runVhs` and the `--web` pre-loop video/GIF/poster encoding are now guarded by `!captionsOnly`
- **`--web` poster not copied into `webOutputDir`** — when the tape directory contained a `poster.png`, the manifest received the source path (outside `web/`) rather than a self-contained web-relative copy, and card generation did not run. The poster is now `copyFileSync`'d into `webOutputDir` with the card generated from the copy
- **Multi-voice non-web GIF named after primary voice** — in multi-voice mode the GIF carried the name `slug.<voice>.gif` (e.g. `slug.alan.gif`) rather than the voice-agnostic `slug.gif`; `runFfmpeg` now skips GIF generation for all voices in multi-voice mode, and a single `slug.gif` comes from the primary voice MP4 after the voice loop
- **`buildM4aArgs` invalid filter on empty segments** — an empty segment list produced `amix=inputs=0`, an invalid ffmpeg filter; the function now throws a descriptive error before invoking ffmpeg
- `manifest.test.ts` indentation corrected from 4-space to tabs (matches rest of codebase)

### Tests

- `meta.test.ts` — `vhs.shell` accepts plain names and paths; rejects values containing double-quote characters
- `timeline/index.test.ts` — `generateVhsFromTimeline` emits `Set Shell "zsh"` by default and respects `vhs.shell` override
- `model_test.go` — unselected chapter step shows `§`; selected chapter step shows `▸` not `§`
- `chapters.test.ts` — FFMETADATA1 escaping for `=`, `;`, `#`, `\`, and newlines in both explicit and auto-generated chapter titles

## [1.2.2] - 2026-04-13

### Fixed

- **MKV container metadata** — all three ffmpeg paths (`stitchMp4`, `stitchMkv`, `buildMkvMultiVoiceArgs`) used `-map_metadata ${n}` to embed chapter markers; that flag copies *global* metadata from the source, not chapter markers. Since FFMETADATA1 chapter files carry no global tags, it silently clobbered the explicit `-metadata title/artist/…` flags. Changed to `-map_chapters ${n}` throughout so global metadata and chapter embedding stay independent

### Added

- **`--web` flag** — produces a web-optimised output set inside a `web/` subdirectory: `slug.silent.mp4` (shared padded video, no audio, no burned captions), `slug.mp4` / `slug.<voice>.mp4` (primary voice with burned captions and baked audio, for download), per-voice M4A audio files (time-locked via silence so `audio.currentTime` stays in sync with `video.currentTime`), WebVTT and SRT captions per voice, and a `manifest.json` with `video` (silent), `download` (voiced MP4), and per-voice `audio` and `captions` entries. A web player can switch voices at runtime without re-downloading the video
- **Multi-voice MKV bundling** — `--mkv` now uses `stitchMkvMultiVoice` to pack all voice audio tracks and SRT subtitle streams into one MKV container; stream labels carry the voice name so players (VLC, mpv) can switch between them at playback time. `--web` and `--mkv` combine freely
- **Caption word-wrapping** — `wrapCueText` wraps narration text at ≤ 65 characters per line (GOV.UK style guide) with a hard ceiling of 2 lines; applied to all three caption formats (VTT, ASS, SRT). ASS hard line breaks use `\N`; SRT and VTT use `\n`
- **`og` field in manifest** — placeholder for a 1200×630 Open Graph image alongside the existing `download`, `poster`, and `card` fields; always `null` until OG generation is implemented
- **`--manifest-only` flag** — regenerates `manifest.json` from existing web output files without re-running the pipeline
- **`docs/OUTPUT_FORMATS.md`** — reference for all output modes (`default`, `--web`, `--mkv`), caption sizing rules, web player sync example, and flag combination guidance
- **`tape.pristine.yaml` support in playlist** — `findTapeDirs` copies `tape.pristine.yaml` to `tape.yaml` before recording when only the pristine file exists, matching the behaviour of `build-studio.sh`
- **TUI `CaptionWarnWords` constant** — `tui/tape/timing.go` now exports the caption word-count warning threshold, keeping Go and TypeScript in sync

## [1.2.1] - 2026-04-12

### Fixed

- Poster extraction no longer crashes the pipeline when `ffmpeg`'s `select` filter finds no matching frames. `ffmpeg` exits 0 in that case but produces a missing or zero-byte file; `generateCard` would then fail with exit code 254 trying to open it. The pipeline now checks that the extracted poster exists and has content before proceeding to card generation, and skips both silently if it does not
- Added test coverage for `runFfmpeg` poster/card guard: missing file, zero-byte file, valid file, explicit `posterSourceFile`, and no-poster-at-all cases

## [1.2.0] - 2026-04-12

### Added

- **`playback playlist` subcommand** — batch-build all tapes in `tapesDir` consecutively. Reads `tapesDir` from `playback.config.ts` by default; accepts `--tapes-dir <path>` to override. All remaining flags pass through to each `playback tape` invocation (e.g. `playback playlist -- --vhs-only`). Stops at the first failure.

### Changed

- `cli.ts` refactored into a pure command dispatcher — tape pipeline logic extracted to `src/commands/tape.ts`, playlist logic to `src/commands/playlist.ts`
- `clean` script uses `rimraf` instead of `rm -rf` for cross-platform compatibility


## [1.1.0] - 2026-04-11

### Added

- **Structured logging** — `consola`-backed logger with `--quiet` (warn and above) and `--verbose` (all levels plus full subprocess output) flags. ffmpeg stderr is now captured and filtered in default and quiet modes, surfacing only actionable warnings; `--verbose` passes all output through unfiltered
- **CLI theming** — 11 built-in colour themes: `default`, four Tokyo Night variants (`tokyo-night`, `tokyo-night-storm`, `tokyo-night-moon`, `tokyo-night-day`), four Catppuccin flavours (`catppuccin-mocha`, `catppuccin-macchiato`, `catppuccin-frappe`, `catppuccin-latte`), `dracula`, and `high-contrast`; set via `theme` in XDG config or overlaid per-project with `theme.yaml`
- **XDG user config** — `$XDG_CONFIG_HOME/playback/config.yaml` (falls back to `~/.config/playback/config.yaml`); configures `theme`, `logLevel`, and default `voices` across all projects
- **TUI XDG config** — TUI reads the same `config.yaml` to select its colour theme; 9 new TUI themes matching the CLI set (all Tokyo Night variants, all Catppuccin variants, Dracula); `--high-contrast` flag still overrides
- **XDG voices catalogue** — `$XDG_CONFIG_HOME/playback/voices.yaml` as the user-level base, merged with an optional per-project `voices.yaml` on top (project entries win on name collision); `npm run setup` bootstraps the XDG catalogue from `voices.example.yaml` on first run and downloads models from it thereafter

### Changed

- `voices.yaml` is now gitignored at the project level; `voices.example.yaml` is the committed reference that `npm run setup` bootstraps from
- `release:prepare` now runs `lint` and a smoke test (`test:smoke`) before the release metadata check

### Fixed

- `Duped color` and `255(+1) colors` GIF palette warnings removed from the surfaced warning list; they are benign palette quantization artefacts that vary by theme and cannot be reliably prevented without degrading quality
- Studio directory structure uses nested paths for cleaner paths: `demo-tui/` → `demo/tui/`, `demo-accessible/` → `demo/accessible/`, `example/` → `example/tape/`, `example-skills/` → `example/skills/`
- `demo/tui` `meta.yaml` series field corrected from `demo-tui` to `demo` (matches the other demo tapes)

## [1.0.6] - 2026-04-10

### Added

- `--tapes-dir <path>` flag for `playlist:build` — target any tape directory, including absolute paths outside the project root
- `eslint-plugin-perfectionist` enforces alphabetical ordering of object keys, interface properties, and type properties across the TypeScript source
- `*.poster.png` and `*.card.png` (50% scaled) produced alongside `--web` output; poster renamed from `*.png`
- `og` field in `manifest.json` for future Open Graph image support (`null` until we add a generation strategy)

### Fixed

- AAC encoder `Too many bits > 6144 per frame` warning: added `-ar 44100` to resample Piper's 22050 Hz mono output to the AAC-standard rate before encoding, keeping bits/frame well under the per-channel limit
- `image2` image sequence pattern warning on `.card.png`: added `-frames:v 1 -update 1` to `generateCard` (matching the flags already used by `extractPoster`)
- `Guessed Channel Layout: mono` warning on each WAV input: added `-channel_layout mono` per-input so ffmpeg does not need to infer it
- GIF palette `Duped color` and `255(+1)` warnings: added `reserve_transparent=0` and `stats_mode=diff` to `palettegen`, and `dither=bayer:bayer_scale=5:diff_mode=rectangle` to `paletteuse`; also corrected the palette filtergraph to use `;` between its parallel chains


## [1.0.5] - 2026-04-09

### Added

- `vhs.shell` override in `meta.yaml` — configure the VHS terminal shell per tape (e.g. `bash`). Defaults to `zsh`

### Fixed

- SRT timestamp separator: `.replace('.', ',')` only replaced the first `.` in the timestamp string; changed to `.replaceAll` for correctness and intent clarity
- ASS subtitle `Encoding` field was `1` (Windows ANSI); changed to `0` (UTF-8) to match the file encoding and prevent Mojibake with non-ASCII narration text (e.g. curly quotes, Welsh characters)

## [1.0.4] - 2026-04-08

### Added

- `chapter` tape action for named chapter markers, with MP4 chapter embedding when present
- `--mkv` flag to produce an MKV archive alongside the usual MP4 and GIF, with SRT captions included as a subtitle track
- `playback scaffold <dir>` command to generate a `PROMPT.md` template from `meta.yaml` and the narration text in `tape.yaml`

### Changed

- Styled `playback --help` output with terminal-aware colour, while preserving plain-text output for pipes and `NO_COLOR`

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

[1.2.3]: https://github.com/philsherry/playback/compare/v1.2.2...v1.2.3
[1.2.2]: https://github.com/philsherry/playback/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/philsherry/playback/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/philsherry/playback/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/philsherry/playback/compare/v1.0.6...v1.1.0
[1.0.6]: https://github.com/philsherry/playback/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/philsherry/playback/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/philsherry/playback/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/philsherry/playback/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/philsherry/playback/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/philsherry/playback/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/philsherry/playback/releases/tag/v1.0.0
