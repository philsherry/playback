# Tapes

## What a tape is

A tape is a YAML script that drives the playback pipeline. Each tape lives in its own directory with a `tape.yaml` (recording steps) and a `meta.yaml` (episode metadata). Optionally, a `PROMPT.md` describes the video in human terms and a `poster.png` overrides the auto-generated poster frame.

## tape.yaml format

A tape has an optional `title`, an `output` path, and a `steps` array. Each step has an `action` and optional fields.

```yaml
title: Exploring a project structure
output: demo-example
steps:
  - action: narrate
    narration: >
      Let's set up a small project to explore.
    commands:
      - mkdir -p src tests docs && touch README.md config.yaml
      - ls

  - action: run
    narration: >
      A typical project layout.
    pause: 0.5

  - action: comment
    narration: >-
      That covers the project structure.
```

### Actions

| Action | Purpose | Required fields | Optional fields |
| --- | --- | --- | --- |
| `type` | Type a command and press Enter | `command` | `narration`, `narrationOffset`, `pause` |
| `run` | Wait for the previous command to finish | (none) | `narration`, `narrationOffset`, `pause` |
| `key` | Send a keystroke without Enter (TUI interaction) | `command` | `narration`, `narrationOffset`, `pause` |
| `comment` | Narration-only step, no terminal action | `narration` | `narrationOffset` |
| `narrate` | Start narration and fire commands concurrently | `narration`, `commands` | `narrationOffset`, `pause` |

### Fields

| Field | Type | Description |
| --- | --- | --- |
| `action` | string | One of `type`, `run`, `key`, `comment`, `narrate` |
| `command` | string | Shell command to type (`type` and `key` actions) |
| `commands` | string[] | Shell commands to run concurrently (`narrate` action) |
| `narration` | string | Voiceover text synthesised by Piper TTS |
| `narrationOffset` | number | Seconds to shift narration start relative to the action. Negative values start narration before the action completes. |
| `pause` | number | Seconds to wait after the action before the next step |

### YAML block scalars for narration

- `>` (folded) — wraps to one line, keeps trailing newline
- `>-` (folded, strip) — wraps to one line, strips trailing newline
- Use `>-` for the final step to avoid trailing silence

### Placeholder constants

Commands can use `{{CONSTANT_NAME}}` placeholders defined in `workspace.yaml`. Playback replaces them before recording. See `workspace.example.yaml` for the tracked reference.

## meta.yaml format

```yaml
title: Exploring a project structure
description: >
  A sample tape with intentional timing overlaps, designed as a demo
  for the playback TUI editor.
episode: 1
locale: en-GB
poster: 5
series: demo
tags:
  - demo
  - example
version: "1.0.0"
voices:
  - northern_english_male
```

| Field | Type | Description |
| --- | --- | --- |
| `title` | string | Display title (required) |
| `description` | string | Multi-line description of what the video teaches |
| `episode` | number | Episode number within the series |
| `locale` | string | BCP 47 locale, e.g., `en-GB` |
| `poster` | number | Frame number for the video poster image |
| `series` | string | Series slug matching the parent directory |
| `tags` | list | Searchable tags, alphabetised |
| `version` | string | Semver version |
| `voices` | list | Piper TTS voice identifiers to render |
| `fixedTiming` | boolean | When `true`, skip audio back-fill — author's `pause` values are authoritative. Use for choreographed tapes where actions must fire during narration. |
| `vhsCwd` | string | Working directory for VHS recording, relative to project root. Use `"."` for tapes that run project commands. Default: isolated `/tmp/playback/` scratch space. |
| `vhs` | object | Per-tape VHS recording overrides (see below) |
| `artist` | string | Creator credit embedded in video metadata. Default: `"Created by Playback"` |

### `vhs` overrides

Optional object in `meta.yaml` that overrides default VHS recording constants for a single tape:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `borderRadius` | number | 10 | Terminal window border radius in pixels |
| `fontFamily` | string | `"FiraCode Nerd Font Mono"` | Font family name. Must not contain double-quote characters |
| `fontSize` | number | 16 | Font size in pixels |
| `framerate` | number | 30 | Recording framerate |
| `height` | number | 660 | Recording height in pixels |
| `margin` | number | 20 | Terminal window margin in pixels |
| `marginFill` | string | `"#9ece6a"` | Margin fill colour. Must not contain double-quote characters |
| `shell` | string | `"zsh"` | Shell for the VHS terminal session. Must not contain double-quote characters |
| `theme` | string | Amber theme | JSON theme string for VHS `Set Theme` |
| `typingSpeed` | string | `"75ms"` | Typing speed per character |
| `width` | number | 1280 | Recording width in pixels |
| `windowBar` | string | `"Colorful"` | Window bar style (e.g. `"Colorful"`, `"Rings"`, `"Hidden"`) |

**Poster image priority:** `poster.png` in the tape directory → `poster` frame number in `meta.yaml` → no poster.

**Voices:** `northern_english_male` by default. The available voices come from the merged catalogue: `$XDG_CONFIG_HOME/playback/voices.yaml` as the user-level base, with an optional project-local `voices.yaml` (gitignored) on top. Default voices: `alan`, `alba`, `northern_english_male`, `southern_english_female`.

**Per-voice VITS tuning:** voice entries in `voices.yaml` may include optional synthesis tuning parameters. When present, these take precedence over the built-in `VOICE_CONFIG` table, allowing consumer projects to tune synthesis without modifying the playback package:

```yaml
voices:
  my_character:
    gender: female
    lengthScale: 0.9   # speaking-rate multiplier — lower = faster
    locale: en-GB
    model: en_GB-alba-medium
    noiseScale: 0.05   # phonation/timbre variance — lower = consistent identity
    noiseW: 0.4        # phoneme-duration variance — moderate = natural rhythm
    quality: medium
    url: en/en_GB/alba/medium
```

Omit any field to fall back to the built-in default for that voice, or to `DEFAULT_SYNTH_CONFIG` (`lengthScale: 1.0`, `noiseScale: 0.1`, `noiseW: 0.6`) if the voice has no built-in entry.

## PROMPT.md format

A human-readable overview of the video, with frontmatter:

```yaml
---
title: Exploring a project structure
version: "1.0.0"
duration: ~1 minute
---
```

Body sections: "What this video shows", "What you will see" (numbered steps), "What you will need", "What comes next".

## Narration style

- Write for spoken English. Contractions are fine.
- Keep sentences short — one idea per sentence.
- Avoid jargon the viewer cannot see on screen. Name what the viewer sees: "the files appear", "the output shows".
- Use `>` or `>-` YAML block scalars for multi-line narration.
- `narrationOffset` is the main timing tool. Negative values make narration start before the action finishes — use this when a command produces output and the narration should overlap with it appearing.

## Pipeline output

Running `npm run playback:tape -- studio/example/tape` produces:

```text
blockbuster/studio/example/tape/
├── tape.tape             # generated VHS tape
├── tape.mp4              # final video with voiceover
├── tape.gif              # GIF version for READMEs and docs
├── tape.vtt              # WebVTT captions (primary)
├── tape.srt              # SRT captions (fallback)
├── tape.ass              # ASS captions (used internally for burn-in)
├── tape.png              # poster image (if generated, 1280×720)
├── tape.card.png         # card image (if generated, 640×360 — 50% of poster)
├── chapters.txt          # FFMETADATA1 chapter markers
├── script.txt            # narration script (for reference)
└── segments/             # per-voice synthesised audio segments
```

## workspace.yaml

`workspace.yaml` is git-ignored. `workspace.example.yaml` is the tracked reference. Three sections:

- **sources** — external directories used by tapes (path, required subdirectories)
- **mounts** — symlinks from source paths into the VHS recording sandbox
- **constants** — named placeholders for `{{KEY}}` substitution in tape commands
