# TUI UI package

## Architecture

The `tui/ui/` package is a Bubbletea application following the Elm architecture: `Init()` returns an initial command, `Update(msg)` processes messages and returns updated state, `View()` renders the current state to a string. The `Model` struct is the single state container.

## Model fields (~40 fields, 8 operational modes)

| Group | Key fields | Purpose |
| --- | --- | --- |
| Core | `tapeData`, `projectRoot`, `cursor`, `nudgeStep`, `dirty` | Loaded tape, selection state, edit tracking |
| Layout | `theme`, `styles`, `layout`, `width`, `height`, `ready` | Computed dimensions, theme-derived styles |
| Undo | `undoStack` | Snapshots of step timing before each edit |
| Overlaps | `overlaps` | Detected narration timing collisions |
| Pause editing | `editing`, `pauseInput` | Textinput for direct pause value entry |
| Tape picker | `picking`, `pickerForm`, `tapeEntries` | Huh Select form for opening a different tape |
| Discard confirm | `confirmDiscard`, `confirmForm` | Huh Confirm before discarding unsaved changes |
| Quit confirm | `confirmQuit`, `quitForm` | Huh Confirm before quitting with unsaved changes |
| Video preview | `preview`, `frameW`, `frameH` | Chafa-rendered video frame state |
| PROMPT.md viewer | `viewingPrompt`, `promptContent`, `promptView` | Glamour-rendered markdown viewport |
| Metadata editor | `editingMeta`, `metaFields`, `metaValues`, `metaCursor`, `metaInput` | Field-by-field metadata editing |
| Pipeline runner | `pipelineRunning`, `pipelineMode`, `pipelineLog`, `pipelineOutputCh`, `progressBar` | Background pipeline subprocess |
| Save/status | `statusMsg` | Transient status messages |

## Message delegation priority in `Update()`

The `Update()` function delegates messages to sub-states in a strict priority order. Higher-priority states consume all messages before lower ones see them:

1. **Quit confirm** (`confirmQuit`) — Huh Confirm form: save-and-quit or discard-and-quit
2. **Discard confirm** (`confirmDiscard`) — Huh Confirm form: discard changes before opening new tape
3. **Tape picker** (`picking`) — Huh Select form for tape selection
4. **Window resize** (`tea.WindowSizeMsg`) — recalculates layout, viewports, preview frame size
5. **Spinner tick** — updates spinner animation
6. **Pipeline output** (`PipelineOutputMsg`) — appends log lines, updates progress bar
7. **Pipeline result** (`PipelineResult`) — clears running flag, updates build status
8. **Key messages** (`tea.KeyMsg`), further delegated by state:
   - `editing` → textinput for pause value
   - `viewingPrompt` → viewport scrolling
   - `editingMeta` → field navigation and textinput
   - `pipelineRunning` → all keys blocked
   - Normal mode → navigation, nudge, undo, save, pipeline, open, quit

## Layout system

`CalculateLayout(width, height)` computes panel dimensions from terminal size. The screen has:

```text
┌─ Title row (borderless, 1 row) ─────────────────────────────────────┐
╭─ Outer border ──────────────────────────────────────────────────────╮
│ ╭─ Preview (2/3) ──╮ ╭─ Step list (1/3) ──╮                        │
│ │                   │ │                     │  Top row (flexible)    │
│ ╰───────────────────╯ ╰─────────────────────╯                       │
│ ╭─ Timeline (full width) ──────────────────╮                        │
│ │  Audio bars + ruler                      │  Fixed 6 rows          │
│ ╰──────────────────────────────────────────╯                        │
│ ╭─ Inspector (full width) ─────────────────╮                        │
│ │  Step details                            │  15% of content        │
│ ╰──────────────────────────────────────────╯                        │
│  Footer: keybinding hints (1 row, no border)                        │
╰─────────────────────────────────────────────────────────────────────╯
```

**Width budget:** lipgloss `Width(n)` sets content width; borders add 2 chars outside. Two side-by-side panels: `preview.Width + stepList.Width = fullWidth - borderSize`. The top row uses a 2/3 : 1/3 split.

**Height budget:** title (1) + outer border (2) + footer (1) + 3 inner panel borders (6) = 10 fixed rows. The layout divides the remaining height: timeline (6 fixed) + inspector (15%) + top row (what's left, min 8).

## Audio timeline rendering

`renderAudioTimeline()` visualises narration clips as horizontal blocks:

1. Build clips — each narrated step becomes a `clip` with `startCol`/`endCol` mapped from time to terminal columns
2. Assign lanes — `assignLanes()` stacks horizontally overlapping clips into vertical lanes
3. Render per lane — each lane is a character buffer; clips fill with `█` blocks, labels centred
4. Per-character styling — selected clips use `ClipSelected`, overlapping clips use `Overlap`, normal clips use `Clip`
5. Ruler — time scale at the bottom with tick marks at calculated intervals

## Video preview pipeline

When preview dependencies (ffmpeg + chafa) are available:

1. Extract a single frame at a given timestamp via ffmpeg (`-vf select=...`)
2. Output as PPM format (lossless, no codec dependency)
3. Pipe PPM to chafa with `--size WxH` for terminal art rendering
4. `fit16x9()` constrains the frame to 16:9 within the preview panel, accounting for terminal characters being ~2× taller than wide

## Themes

Two built-in themes:

- **Tokyo Night Storm** (default) — the canonical Tokyo Night "Storm" variant palette
- **High Contrast** — pure white on black, WCAG AAA contrast ratios (7:1+) for all text

Each `Theme` struct has 11 semantic colour roles (Background, Foreground, Clip, ClipSelected, Overlap, Warning, Delta, Muted, Accent, Ruler, Border). `NewStyles(theme)` derives all lipgloss styles from the theme once at startup.

## Keybindings

Defined in `KeyMap` struct, implements `help.KeyMap` for automatic help rendering:

| Key | Action | Context |
| --- | --- | --- |
| `j` / `k` | Navigate steps | Normal |
| `h` / `l` | Nudge audio clip earlier/later | Step selected |
| `↑` / `↓` | Nudge pause value up/down | Step selected |
| `e` | Edit pause value directly | Step selected |
| `u` | Undo last edit | Normal |
| `s` | Save tape.yaml | Normal |
| `r` | Run full pipeline | Normal |
| `R` | Run VHS only | Normal |
| `o` | Open tape picker | Normal |
| `m` | View PROMPT.md | Normal |
| `M` | Edit metadata | Normal |
| `Esc` | Deselect / dismiss | Normal |
| `?` | Toggle full help | Normal |
| `q` | Quit | Normal |

## Adding a new feature

1. Add field(s) to `Model` struct
2. Add key binding to `KeyMap` (if interactive)
3. Add branch to `Update()` — respect the delegation priority
4. Add rendering to `View()` or a sub-view
5. If a new sub-state, gate it with a bool flag and handle it before the normal key handler
