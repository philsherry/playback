# Release notes — v1.1.0

## Structured logging, CLI theming, and XDG config

Playback 1.1.0 ships three connected features: structured logging,
configurable themes, and an XDG config that works across all your projects.

### Structured logging

consola-backed logger with three verbosity levels: default (info),
--quiet (warnings and errors only), and --verbose (full subprocess output).
The pipeline captures and filters ffmpeg stderr; only actionable warnings surface.

### CLI theming

Eleven built-in colour themes: Tokyo Night (four variants), Catppuccin
(four flavours), Dracula, and high-contrast WCAG AAA. Set the theme in
your XDG config, or drop a theme.yaml into a project to override locally.

### XDG config

~/.config/playback/config.yaml applies across all your projects. Set your
theme, log level, and default voices in one place. The TUI reads the same
file to pick its colour theme.

### XDG voices catalogue

~/.config/playback/voices.yaml is the user-level base catalogue, merged
with an optional per-project voices.yaml. Run npm run setup to bootstrap
the catalogue and download model files.
