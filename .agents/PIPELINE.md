# Pipeline

## Overview

The playback pipeline takes a tape directory and produces a finished video with voiceover and captions. Each stage feeds into the next; the timeline is the single source of truth.

## Stages

### 1. Parse

`src/parser/index.ts` reads `tape.yaml` and `meta.yaml` from the tape directory, validates them against Valibot schemas (`src/schema/tape.ts`, `src/schema/meta.ts`), and returns a `ParsedTape`.

### 2. Build timeline

`src/timeline/index.ts` converts the parsed tape steps into a flat timeline of events. Each step gets a start time based on cumulative pauses and estimated durations.

### 3. Extract narration segments

`src/extractor/tts.ts` pulls narration text from the timeline and produces `NarrationSegment` objects for synthesis.

### 4. Synthesise audio

`src/runner/piper.ts` runs piper-tts for each segment, producing `.wav` files. The runner resolves voice model `.onnx` files through a fallback chain: project-local `voicesDir` first, then `$XDG_CACHE_HOME/playback/voices/` (falls back to `~/.cache/playback/voices/`). Run `npm run setup` to download models.

### 5. Backfill durations

`src/timeline/index.ts` (`applyAudioDurations`) updates the timeline with real `.wav` durations, replacing the initial estimates.

### 6. Generate VHS tape

`src/generator/vhs.ts` creates a `.tape` file for VHS from the duration-aware timeline. Sleep values now match the audio.

### 7. Record terminal

`src/runner/vhs.ts` runs VHS to produce a raw `.mp4` terminal recording.

### 8. Generate captions

`src/generator/captions.ts` produces `.vtt`, `.srt`, and `.ass` caption files from the timeline.

### 9. Stitch with ffmpeg

`src/runner/ffmpeg.ts` combines the terminal recording, synthesised audio, and captions into the final `.mp4`. It also produces a `.gif` and optionally burns in subtitle overlays.

### 10. Post-processing (optional)

- `src/generator/chapters.ts` — FFMETADATA1 chapter markers
- `src/generator/manifest.ts` — web manifest for browser playback (`--web` flag)
- `src/audit/timings.ts` — timing audit for overlap detection (`--audit` flag)

## External dependencies

| Tool | Purpose | Install |
| --- | --- | --- |
| [VHS](https://github.com/charmbracelet/vhs) | Terminal recording | `brew install vhs` |
| [piper-tts](https://github.com/rhasspy/piper) | Local text-to-speech synthesis | `brew install piper` |
| ffmpeg (full) | Audio/video stitching, subtitle burn-in | `brew install ffmpeg-full` (needs `libass`) |

`npm run setup` downloads voice models and verifies external tools are available.

## CLI commands

```sh
playback validate <dir>              # parse and validate tape paths only
playback tape <dir>                  # full pipeline
playback tape <dir> --vhs-only       # terminal recording only
playback tape <dir> --captions-only  # regenerate captions from existing tape
playback tape <dir> --web            # also export standalone audio + manifest
playback tape <dir> --audit          # print timing audit table after synthesis
playback tape <dir> --audit-fix      # audit and fix shortfalls in tape.yaml
```

## Workspace resolution

The workspace system (`src/workspace/`) resolves external content into the VHS recording sandbox:

1. `loadWorkspace()` reads `workspace.yaml` (falls back to empty config if absent)
2. `getRequiredSourceNames()` inspects the tape's commands to determine which sources are actually referenced — only those sources need to exist on disk
3. `resolveWorkspaceSources()` resolves source paths to absolute and validates required subdirectories
4. `prepareWorkspaceSandbox()` creates symlinks from source paths into the VHS working directory
5. `validateWorkspaceReferences()` checks that paths referenced in tape commands exist through the mount mapping

This lazy validation means tapes that don't use any workspace constants work without a `workspace.yaml`, and tapes that reference only some sources don't require all sources to be present.

## Voices

`voices.yaml` is the single source of truth for available piper-tts voices. Four modules read it: `scripts/setup.sh`, `src/schema/meta.ts`, `src/runner/piper.ts`, and the TUI. The pipeline caches models in `$XDG_CACHE_HOME/playback/voices/`, sharing them across every project that uses playback.

Current voices: `alan`, `alba`, `northern_english_male`, `southern_english_female` — all en-GB.

**Adding a new voice:** add an entry to `voices.yaml` and also add VITS tuning parameters to `VOICE_CONFIG` in `src/runner/piper.ts` (`noiseScale`, `noiseW`, `lengthScale`). Both files must stay in sync.
