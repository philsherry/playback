---
title: "The accessible timing editor"
version: "1.0.0"
duration: ~45 seconds
---

## What this video shows

The accessible timing editor — a sequential, line-by-line alternative to the full-screen TUI. It uses standard input and output with no alternate screen buffer, no redraws, and no spatial layout, so screen readers can follow every interaction.

## What you will see

1. Launching accessible mode with the demo tape.
2. The help screen showing available commands.
3. Stepping through clips with <kbd>n</kbd> and seeing step announcements.
4. Nudging a pause value with <kbd>+</kbd> and <kbd>-</kbd>.
5. Undoing a change with <kbd>u</kbd>.
6. Quitting with <kbd>q</kbd> and seeing the session summary.

## Why this tape exists

Not everyone can use the full-screen TUI. The accessible mode provides the same editing capabilities through a sequential text interface that works with screen readers, braille displays, and any terminal that supports standard input and output.

## What comes next

See also the plain-text timing report (`npm run playback:edit:report -- studio/example/tape`) for a non-interactive alternative that dumps timing data for piping into other tools.
