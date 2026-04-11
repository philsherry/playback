# TUI

## What the TUI does

The TUI is a Go/Bubbletea application for post-production editing of tape timing. It opens a `tape.yaml` file and shows a visual audio timeline that places narration clips against the video.

## Running the TUI

```sh
npm run playback:edit                         # tape picker (scans tapesDir)
npm run playback:edit -- studio/example/tape  # open a specific tape
npm run playback:demo                         # shortcut for studio/example/tape
npm run playback:edit:accessible              # sequential interactive mode
npm run playback:edit:hc                      # high-contrast mode
npm run playback:edit:report                  # plain-text timing report
```

## Accessible modes

Two accessible alternatives exist for screen reader users:

1. **Sequential interactive mode** (`--accessible`) — step-by-step navigation with spoken cues
2. **Plain-text timing report** (`--report`) — outputs a structured report suitable for piping

## Key architecture

| Package | Purpose |
| --- | --- |
| `tui/cmd/playback-tui/` | Cobra CLI entry point |
| `tui/editor/` | Accessible editor and report modes |
| `tui/tape/` | Tape loading, timing, building, scanning, writing |
| `tui/ui/` | Bubbletea models, views, key bindings, styles |

## Timing editor

The TUI shows narration clips on a visual timeline. You can:

- Navigate between clips
- Nudge clip start times with arrow keys (step size from `nudgeStep` in config, default 0.25s)
- See overlap warnings in real time
- Save adjusted timing back to `tape.yaml`

## Go dependencies

The TUI uses the Charm ecosystem: Bubbletea (TUI framework), Lipgloss (styling), Glamour (markdown rendering), Huh (forms), and Cobra (CLI).
