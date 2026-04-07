# TUI timing editor

A Go/Bubbletea post-production timing editor for playback tapes. Edit narration timing, preview terminal output, and run the pipeline — all from the terminal.

## Running

```sh
# Interactive TUI (default)
npm run playback:edit -- studio/example/

# High-contrast theme for low-vision users
npm run playback:edit:hc -- studio/example/

# Sequential accessible mode (screen reader-friendly, no alt screen)
npm run playback:edit:accessible -- studio/example/

# Plain-text timing report (screen reader-friendly, no TUI)
npm run playback:edit:report -- studio/example/
```

## Layout

```text
 Playback                                                       example [Built]
╭──────────────────────────────────────────────────────────────────────────────────╮
│ ╭──────────────────────────────────────────────╮ ╭────────────────────────────╮  │
│ │ $ git clone https://github.com/.../repo      │ │ 1 type    0.0s  8.0s      │  │
│ │ $ cd govuk-design-system-skills              │ │ 2 run     8.0s  4.0s      │  │
│ │ $ ls                                         │ │ 3 type   11.9s  2.6s      │  │
│ │ $ ls agents                                  │ │ 4 run    14.6s  0.5s      │  │
│ │   (running…)                                 │ │ 5 type   15.1s  2.1s      │  │
│ │                                              │ │ 6 run    17.2s 10.4s      │  │
│ │                                              │ │ 7 type   27.6s  3.2s      │  │
│ │ Each agent represents a different            │ │ 8 run    30.8s 10.4s      │  │
│ │ discipline — front-end developer, content    │ │ 9 comment 41.2s 11.2s     │  │
│ │ designer, accessibility auditor, and so on.  │ │                           │  │
│ ╰──────────────────────────────────────────────╯ ╰────────────────────────────╯  │
│ ╭──────────────────────────────────────────────────────────────────────────────╮  │
│ │ Timeline — 9 steps, ~52.5s                                                  │  │
│ │ ██1██    ██2██   █5████6████████     ████8████████                           │  │
│ │                                ██7██                   ████████9████████████ │  │
│ │ ┼────────┼────────┼────────┼────────┼────────┼────────┼────────┼            │  │
│ │ 0s      10s      20s      30s      40s      50s      1m      1m10s          │  │
│ ╰──────────────────────────────────────────────────────────────────────────────╯  │
│ ╭──────────────────────────────────────────────────────────────────────────────╮  │
│ │ Step 8 — run    pause: 0.50s  audio: -0.25s                                 │  │
│ │ h/l: audio ±0.25s  ↑↓: pause  e: edit                                      │  │
│ │ Each agent represents a different discipline…  (~10.4s)                     │  │
│ ╰──────────────────────────────────────────────────────────────────────────────╯  │
│ k up │ j down │ h audio earlier │ l audio later │ ↑ pause + │ ↓ pause − │ ? help │
╰──────────────────────────────────────────────────────────────────────────────────╯
```

### Panels

- **Title bar** (borderless, top) — app name, relative tape path, status badge
- **Terminal simulator** (top-left, bordered) — renders the tape's terminal state at the selected step with resolved `{{PLACEHOLDER}}` values, pinned caption bar at the bottom
- **Step list** (top-right, bordered, scrollable) — all steps with action, timing, and truncated narration
- **Audio timeline** (full-width, bordered) — horizontal clip blocks with lane stacking, overlap highlighting, and time ruler
- **Inspector** (full-width, bordered) — selected step details: pause, narration offset, typing time, narration text with estimated duration
- **Footer** (inside outer border) — contextual keybinding hints via bubbles/help, <kbd>?</kbd> toggles full help

## Key bindings

| Key | Action |
|---|---|
| <kbd>j</kbd> / <kbd>k</kbd> | Navigate step list |
| <kbd>h</kbd> / <kbd>l</kbd> | Nudge narration audio earlier / later (`narrationOffset`) |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Nudge pause value up / down (video timing) |
| <kbd>e</kbd> | Edit pause value directly (type a number) |
| <kbd>u</kbd> | Undo last change |
| <kbd>s</kbd> | Save changes to `tape.yaml` |
| <kbd>o</kbd> | Open tape picker (huh.Select) |
| <kbd>r</kbd> | Run full pipeline |
| <kbd>R</kbd> | Run `VHS`-only pipeline |
| <kbd>m</kbd> | View `PROMPT.md` (glamour-rendered) |
| <kbd>M</kbd> | Edit `meta.yaml` fields |
| <kbd>?</kbd> | Toggle full help view |
| <kbd>q</kbd> | Quit (with huh.Confirm if unsaved changes) |

## Status badges

The title bar shows a colour-coded status badge:

| Status | Colour | Meaning |
|---|---|---|
| `[Built]` | Green | Pipeline output exists, no unsaved changes |
| `[Saved]` | Green | Saved (transient) |
| `[Edited]` | Amber | Unsaved changes — needs saving or discarding |
| `[Partial]` | Amber | Raw recording exists but no final video |
| `[Not built]` | Muted | No pipeline output yet |
| `[Running]` | Purple | Pipeline in progress (with spinner) |
| `[Failed]` | Red | Pipeline failed |

## Themes

### Tokyo Night Storm (default)

| Role | Hex |
|---|---|
| Background | `#24283b` |
| Foreground | `#c0caf5` |
| Clip | `#7aa2f7` |
| Selected | `#7dcfff` |
| Error/overlap | `#f7768e` |
| Warning/edited | `#e0af68` |
| Success/delta | `#9ece6a` |
| Muted | `#565f89` |
| Accent | `#bb9af7` |
| Ruler | `#3b4261` |
| Border | `#545c7e` |

### High contrast

Black background with WCAG AAA contrast ratios. Uses `#ff6600` for warnings, pure white for selection.

## How timing edits work

Two independent controls for each narrated step:

- **`pause`** (↑/↓ arrows) — controls video timing. How long to wait after typing before the next step starts. Affects the total duration and where all later steps begin
- **`narrationOffset`** (h/l keys) — controls audio placement. Shifts when the `.wav` clip plays relative to the step's start time. Negative = starts earlier, positive = starts later. Does not change video timing

The audio timeline blocks reflect `narrationOffset` — pressing <kbd>h</kbd>/<kbd>l</kbd> visually slides the blue blocks left/right. Red markers highlight overlaps.

On save, the writer puts both `pause` and `narrationOffset` values back into `tape.yaml`, preserving all existing formatting (blank lines, folded scalars, comments). Narrated steps always get an explicit `narrationOffset: 0` for clarity.

## Accessibility

- **`--accessible` mode** — line-by-line sequential interface, no alt screen, no redraws. Step through clips one at a time with text prompts
- **`--report` mode** — non-interactive plain-text timing report with overlap warnings and full narration text
- **`--high-contrast` theme** — WCAG AAA contrast ratios for low-vision users
- **`NO_COLOR`** — `lipgloss`/`termenv` strips colour automatically
- **Text equivalents** — every colour-coded indicator has a text label (`!`, `▸`, `[Edited]`, `OVERLAP`, etc.)

## Charm stack

| Component | Usage |
|---|---|
| bubbletea | Elm-architecture TUI framework |
| lipgloss | Styling, borders, layout |
| bubbles/spinner | Pipeline running indicator |
| bubbles/viewport | Scrollable step list, pipeline log, terminal sim |
| bubbles/help | Contextual keybinding footer |
| bubbles/key | Structured keybindings with dynamic enable/disable |
| bubbles/textinput | Direct pause value editing |
| bubbles/progress | Pipeline progress bar with stage detection |
| glamour | `PROMPT.md` rendering |
| huh | Tape picker (Select), quit/discard confirmations (Confirm) |
| cobra | CLI entry point with `--report`, `--accessible`, `--high-contrast` flags |

## File structure

```text
tui/
  main.go                — entry point
  cmd.go                 — cobra root command, flag handling, path resolution
  cmd_test.go            — INIT_CWD path resolution tests
  .golangci.yaml         — linter config with project-specific exclusions
  tape/
    loader.go            — Step, Tape, Meta, TapeData structs + YAML loading
    timing.go            — NarrationDuration, StepDuration, StepStartTime, DetectOverlaps
    writer.go            — format-preserving tape.yaml writer (pause + narrationOffset)
    build.go             — BuildStatus detection (checks for pipeline output files)
    pipeline.go          — pipeline subprocess runner with streamed output
    progress.go          — stage detection from pipeline output lines
    scanner.go           — scan tapesDir for all tape directories
    meta_writer.go       — meta.yaml writer
    workspace.go         — workspace.yaml constants loader
  editor/
    accessible.go        — sequential interactive mode (--accessible mode)
    report.go            — plain-text timing report (--report mode)
  ui/
    model.go             — central bubbletea Model (Init/Update/View)
    layout.go            — two-column + full-width panel dimension calculator
    theme.go             — Tokyo Night Storm + High Contrast palettes
    styles.go            — lipgloss styles derived from active theme
    keys.go              — KeyMap with audio/pause/navigation bindings
    timeline.go          — horizontal audio clip bars with lane stacking
    termsim.go           — terminal simulator with placeholder resolution + captions
    preview.go           — chafa video preview (ffmpeg→RGBA→PPM→chafa pipeline)
```

## Design reference

Originally inspired by [ozemin/lazycut](https://github.com/ozemin/lazycut), a Go/Bubbletea video editor TUI. Key patterns borrowed:

- Elm architecture (Model → Update → View)
- Undo stack with snapshots before each edit
- Progressive disclosure in the footer
- Concurrent subprocess pipelines
- `NO_COLOR` support
