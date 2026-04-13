# Setup

## Prerequisites

Three runtime managers must be present before `scripts/setup.sh` runs: `go`, `node`, `python`.

**asdf** (`.tool-versions`) manages all three, not Homebrew:

| Tool | Purpose |
| --- | --- |
| `brew` | Everything else (see `Brewfile`) |
| `asdf` | Everything else (see `.tool-versions`) |
| `uv` | Python toolchain — installs `piper-tts` and any future Python tools |
| `go` | TUI build and Go test runner |

If any of the three is missing, `setup.sh` exits early with a clear error.

## Running setup

```sh
npm run setup              # XDG cache (shared voice models across projects)
npm run setup -- --local   # project-local voices/ directory instead
```

The script installs Homebrew deps, upgrades formatting to use `gum` once it's available, installs `piper-tts`, bootstraps XDG config/voices, downloads voice models, syncs Vale styles, builds the TUI binary, and links the CLI globally.

## Homebrew dependencies (`Brewfile`)

| Package | Purpose |
| --- | --- |
| `ffmpeg-full` | Audio/video stitching and subtitle burn-in (needs `libass`) |
| `charmbracelet/tap/vhs` | Terminal recording |
| `charmbracelet/tap/gum` | Styled terminal output in scripts |
| `chafa` | Terminal image rendering for TUI video preview |
| `golangci-lint` | Go linter (also used by `npm run lint:tui`) |
| `vale` | Prose linting (`npm run lint:md`) — optional; skipped if absent |
| `ttyd` | Terminal-over-web (used by some demo tapes) |
| `font-fira-code-nerd-font` | Nerd Font for VHS recordings |

## Python tools via uv

Python tools do **not** live in the Brewfile. Install them via `uv tool install`, which manages their own isolated environments:

```sh
uv tool install --force piper-tts --with pathvalidate
```

### Adding a new Python tool

Follow the piper-tts pattern in `scripts/setup.sh`:

1. Add a `header "Tool name"` section
2. Use `spin "Installing…" uv tool install <package>` (or the plain `info` + install fallback if gum may not be present yet)
3. Add a verification step to `npm run setup` docs and the Prerequisites section above

**WhisperX** (deferred — word-level forced alignment for karaoke captions)
will follow this pattern when containerised Python tool support lands:

```sh
uv tool install whisperx
```

WhisperX requires PyTorch ≥ 2.4 which has no wheels for Intel Mac x86_64.
Do not attempt a native install on Intel hardware — it will install but
models will not run. See `ROADMAP.md` (Infrastructure section) for the
planned sidecar container approach.

## XDG directories

| Path | Purpose |
| --- | --- |
| `$XDG_CONFIG_HOME/playback/config.yaml` | User-level log level, theme, default voices |
| `$XDG_CONFIG_HOME/playback/voices.yaml` | Voice catalogue (bootstrapped from `voices.example.yaml`) |
| `$XDG_CACHE_HOME/playback/voices/` | Downloaded `.onnx` model files (shared across projects) |

Fallbacks: `~/.config` and `~/.cache` when XDG vars are unset.

## Voice models

`npm run setup` downloads models from HuggingFace (`rhasspy/piper-voices`) into the XDG cache on first run. Setup reads the download list from `$XDG_CONFIG_HOME/playback/voices.yaml` — add a voice there and rerun setup to fetch its model.

## Build outputs

| Command | Output |
| --- | --- |
| `npm run build` | `dist/` (TypeScript CLI via tsup) |
| `npm run test:tui` | runs in place — no output artifact |
| TUI binary | `tui/playback-tui` (Go, built by setup.sh and `npm run build`) |

## Verification checklist (what setup.sh confirms)

- [ ] `brew` present
- [ ] `uv` present (asdf-managed)
- [ ] `go` present (asdf-managed)
- [ ] Brewfile deps installed (ffmpeg-full, vhs, gum, chafa, golangci-lint, vale, ttyd)
- [ ] `piper-tts` installed via uv
- [ ] Voice models present in XDG cache
- [ ] Vale styles synced
- [ ] TUI binary built (`tui/playback-tui`)
- [ ] CLI linked globally (`npm link`)
