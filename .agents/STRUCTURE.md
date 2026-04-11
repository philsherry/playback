# Structure

## What this project is

Playback turns YAML scripts into narrated, captioned terminal videos. It has two halves: a TypeScript pipeline that records, synthesises, and stitches video; and a Go/Bubbletea TUI for post-production timing edits.

## Top-level directories

| Directory | Purpose |
| --- | --- |
| `src/` | TypeScript pipeline — CLI, parsers, runners, generators, schema validation |
| `tui/` | Go TUI — timing editor, accessible mode, tape picker, audio timeline |
| `studio/` | Example and demo tapes shipped with the repo |
| `blockbuster/` | Output directory for rendered videos (generated, not hand-written) |
| `scripts/` | Build, debug, and release scripts |
| `docs/` | Design documents and technical references |
| `workspace/` | Local workspace mounts (git-ignored) |
| `.agents/` | Repo-level instruction files consumed by `CLAUDE.md` and `copilot-instructions.md` |

## TypeScript pipeline (`src/`)

```text
src/
├── cli.ts                 # Entry point — argument parsing and pipeline orchestration
├── config.ts              # PlaybackConfig interface and loader
├── constants.ts           # Shared constants (timing, dimensions)
├── paths.ts               # Path resolution utilities
├── substitutions.ts       # {{CONSTANT}} placeholder expansion
├── voices.ts              # Voice catalogue loader (XDG + project merge chain)
├── audit/
│   ├── overlay.ts         # Debug overlay filter for ffmpeg burn-in
│   └── timings.ts         # Timing audit — detects narration overlaps
├── extractor/
│   └── tts.ts             # Extracts narration segments for TTS synthesis
├── generator/
│   ├── captions.ts        # WebVTT, SRT, and ASS caption generation
│   ├── chapters.ts        # FFMETADATA1 chapter markers
│   ├── manifest.ts        # Web manifest for browser playback
│   └── vhs.ts             # Generates .tape files for VHS recording
├── parser/
│   └── index.ts           # Parses tape.yaml + meta.yaml into a ParsedTape
├── runner/
│   ├── ffmpeg.ts          # Audio/video stitching and subtitle burn-in
│   ├── piper.ts           # Piper TTS synthesis runner
│   └── vhs.ts             # VHS terminal recording runner
├── schema/
│   ├── index.ts           # Re-exports schema types
│   ├── meta.ts            # Valibot schema for meta.yaml
│   └── tape.ts            # Valibot schema for tape.yaml
├── timeline/
│   └── index.ts           # Builds unified timeline from tape steps
├── types/
│   └── index.ts           # Shared TypeScript types (no runtime values)
├── utilities/
│   ├── escape.ts          # Shell and string escaping
│   └── regex.ts           # Shared regex patterns
└── workspace/
    ├── index.ts            # Workspace config loader and validator
    └── schema.ts           # Valibot schema for workspace.yaml
```

Pipeline flow: `cli.ts` → `parser/` → `timeline/` → `extractor/` → `runner/piper` → `timeline/` (backfill durations) → `generator/vhs` → `runner/vhs` → `generator/captions` → `runner/ffmpeg`.

## Go TUI (`tui/`)

```text
tui/
├── cmd/playback-tui/      # Cobra CLI entry point
├── editor/
│   ├── accessible.go      # Sequential interactive mode for screen readers
│   └── report.go          # Plain-text timing report
├── tape/
│   ├── accessible.go      # Accessible tape display
│   ├── build.go           # Tape building utilities
│   ├── infer.go           # Infer timing from audio durations
│   ├── loader.go          # YAML tape/meta loader
│   ├── meta_writer.go     # Writes back modified meta.yaml
│   ├── pipeline.go        # Pipeline orchestration
│   ├── progress.go        # Progress tracking
│   ├── report.go          # Tape report generation
│   ├── scanner.go         # Directory scanner for tape discovery
│   ├── timing.go          # Timing calculations
│   ├── workspace.go       # Workspace config handling
│   └── writer.go          # Writes back modified tape.yaml
└── ui/                      # Bubbletea models, views, and components
```

## Studio tapes (`studio/`)

```text
studio/
├── build-studio.sh         # Builds all demo/example tapes
├── demo/
│   ├── tui/                # Demo video of the TUI
│   └── accessible/         # Demo video of accessible mode
└── example/
    ├── tape/               # Standalone example tape for testing
    └── skills/             # Example tape using workspace features
```

Each tape directory contains `tape.yaml`, `meta.yaml`, and optionally `PROMPT.md` and `poster.png`.

## Configuration files

| File | Purpose |
| --- | --- |
| `playback.config.ts` | Project-level config overrides (output dir, voices, nudge step) |
| `voices.example.yaml` | Reference template for the voice catalogue — `npm run setup` bootstraps `$XDG_CONFIG_HOME/playback/voices.yaml` from this on first run |
| `workspace.example.yaml` | Template for `workspace.yaml` (local paths, mounts, constants) |
| `tsconfig.json` | TypeScript compiler options (strict, ESNext, Bundler resolution) |
| `tsup.config.ts` | Build config — ESM output targeting Node 22 |
| `vitest.config.ts` | Test runner config — `src/**/*.test.ts` |
| `eslint.config.js` | Linting — flat config with typescript-eslint and jsdoc |
| `commitlint.config.js` | Conventional commits enforcement |

## Key conventions

- **Schema validation** uses Valibot throughout — tape, meta, workspace, and config schemas.
- **Tests** live alongside source files as `*.test.ts` (TypeScript) and `*_test.go` (Go).
- **Voices** use key names (e.g., `northern_english_male`) from the merged catalogue: `$XDG_CONFIG_HOME/playback/voices.yaml` as base, project-local `voices.yaml` (gitignored) on top. The pipeline caches model `.onnx` files in `$XDG_CACHE_HOME/playback/voices/`.
- **Tape constants** use `{{KEY}}` placeholders expanded from `workspace.yaml` before recording.
- **The timeline** is the single source of truth — built once from tape steps, then refined as audio durations come in.
