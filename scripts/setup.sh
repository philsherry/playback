#!/usr/bin/env bash
set -euo pipefail

# ── Fallback formatting (before gum is available) ────────────────────────────

BOLD=$'\033[1m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
RED=$'\033[0;31m'
RESET=$'\033[0m'

info()    { printf "${GREEN}✓${RESET} %s\n" "$*"; }
warning() { printf "${YELLOW}!${RESET} %s\n" "$*"; }
error()   { printf "${RED}✗${RESET} %s\n" "$*" >&2; }

# ── gum wrappers (upgrade to gum once it's installed) ────────────────────────

# These functions start with the fallback formatting above, then get
# redefined after `brew bundle` installs gum.
setup_gum() {
  if ! command -v gum &>/dev/null; then
    return
  fi

  header() {
    echo ""
    gum style --foreground="#bb9af7" --bold --border="rounded" --border-foreground="#545c7e" --padding="0 2" "$*"
  }

  info() {
    gum style --foreground="#9ece6a" "✓ $*"
  }

  warning() {
    gum style --foreground="#e0af68" "! $*"
  }

  error() {
    gum style --foreground="#f7768e" --bold "✗ $*" >&2
  }

  spin() {
    gum spin --spinner="dot" --title="$1" -- "${@:2}"
  }
}

# ── Prerequisites ────────────────────────────────────────────────────────────

echo ""
echo "${BOLD}playback${RESET} — setup"
echo ""

if ! command -v brew &>/dev/null; then
  error "Homebrew is not installed. See https://brew.sh"
  exit 1
fi

if ! command -v uv &>/dev/null; then
  error "uv is not installed. Expected to be managed via asdf — run: asdf install"
  exit 1
fi

if ! command -v go &>/dev/null; then
  error "Go is not installed. Expected to be managed via asdf — run: asdf install"
  exit 1
fi

info "Prerequisites met (Homebrew, uv, Go)"

# ── Homebrew dependencies ────────────────────────────────────────────────────

info "Installing Homebrew dependencies…"
brew bundle --file="$(dirname "$0")/../Brewfile"

# Now that gum is installed, upgrade our formatting.
setup_gum

# ── piper-tts ────────────────────────────────────────────────────────────────

header "piper-tts"

if command -v gum &>/dev/null; then
  spin "Installing piper-tts via uv…" uv tool install --force piper-tts --with pathvalidate
else
  info "Installing piper-tts via uv…"
  uv tool install --force piper-tts --with pathvalidate
fi

# ── Voice models ─────────────────────────────────────────────────────────────

header "Voice models"

# ── XDG catalogue bootstrap ───────────────────────────────────────────────────
# The voice catalogue lives at $XDG_CONFIG_HOME/playback/voices.yaml so it is
# shared across every project that uses playback. On first run we copy the
# reference template (voices.example.yaml) there. Users can then edit that
# file to add or customise voices.

XDG_CONFIG_DIR="${XDG_CONFIG_HOME:-${HOME}/.config}/playback"
XDG_CONFIG_YAML="${XDG_CONFIG_DIR}/config.yaml"
XDG_VOICES_YAML="${XDG_CONFIG_DIR}/voices.yaml"
EXAMPLE_VOICES_YAML="$(dirname "$0")/../voices.example.yaml"

mkdir -p "${XDG_CONFIG_DIR}"

# ── XDG config bootstrap ──────────────────────────────────────────────────────
if [[ ! -f "${XDG_CONFIG_YAML}" ]]; then
  cat > "${XDG_CONFIG_YAML}" <<'EOF'
## playback user config — edit to taste.
## Full reference: https://github.com/philsherry/playback

## Log level. Options: silent | error | warn | info | verbose
## CLI flags --quiet (warn) and --verbose override this.
logLevel: info

## Colour theme for CLI output. Options:
##   default              — consola defaults
##   tokyo-night          — Tokyo Night (dark)
##   tokyo-night-storm    — Tokyo Night Storm (darker) — TUI default
##   tokyo-night-moon     — Tokyo Night Moon (darkest)
##   tokyo-night-day      — Tokyo Night Day (light)
##   catppuccin-mocha     — Catppuccin Mocha (dark)
##   catppuccin-macchiato — Catppuccin Macchiato (medium dark)
##   catppuccin-frappe    — Catppuccin Frappé (medium)
##   catppuccin-latte     — Catppuccin Latte (light)
##   dracula              — Dracula (purple-tinted dark)
##   high-contrast        — WCAG AAA, matches TUI accessible mode
theme: tokyo-night-storm

## User-level default voices. Overridden by per-project playback.config.ts.
## Available voices are defined in voices.yaml (same directory as this file).
voices:
  - northern_english_male
EOF
  info "Config bootstrapped → ${XDG_CONFIG_YAML}"
else
  info "Config: ${XDG_CONFIG_YAML}"
fi

# ── XDG voices bootstrap ──────────────────────────────────────────────────────
if [[ ! -f "${XDG_VOICES_YAML}" ]]; then
  cp "${EXAMPLE_VOICES_YAML}" "${XDG_VOICES_YAML}"
  info "Voice catalogue bootstrapped → ${XDG_VOICES_YAML}"
else
  info "Voice catalogue: ${XDG_VOICES_YAML}"
  # Sync any new voices added to voices.example.yaml since last setup.
  SYNC_SCRIPT="$(dirname "$0")/setup/sync-voices.cjs"
  if [[ -f "${SYNC_SCRIPT}" ]]; then
    ADDED=$(node "${SYNC_SCRIPT}" "${XDG_VOICES_YAML}" 2>/dev/null || true)
    if [[ -n "${ADDED}" ]]; then
      while IFS= read -r voice_name; do
        info "Voice added to catalogue: ${voice_name}"
      done <<< "${ADDED}"
    fi
  fi
fi

# ── Model download directory ──────────────────────────────────────────────────
# Download to the XDG shared cache so models are reused across projects.
# Use --local flag to download to the project-local voices/ directory instead.
if [[ " $* " == *" --local "* ]]; then
  VOICES_DIR="$(dirname "$0")/../voices"
else
  VOICES_DIR="${XDG_CACHE_HOME:-${HOME}/.cache}/playback/voices"
fi
mkdir -p "${VOICES_DIR}"
info "Voice model cache: ${VOICES_DIR}"

download_voice() {
  local name="$1"
  local url_path="$2"
  local model="${VOICES_DIR}/${name}.onnx"
  local config="${VOICES_DIR}/${name}.onnx.json"
  local base_url="https://huggingface.co/rhasspy/piper-voices/resolve/main/${url_path}"

  if [[ -f "${model}" && -f "${config}" ]]; then
    info "${name} — already present"
  else
    if command -v gum &>/dev/null; then
      spin "Downloading ${name}…" bash -c "
        curl -fsSL --output '${model}' '${base_url}/${name}.onnx' &&
        curl -fsSL --output '${config}' '${base_url}/${name}.onnx.json'
      "
    else
      info "Downloading ${name}…"
      curl -fsSL --output "${model}" "${base_url}/${name}.onnx"
      curl -fsSL --output "${config}" "${base_url}/${name}.onnx.json"
    fi
    info "${name} — downloaded"
  fi
}

# Read voices from the XDG catalogue (bootstrapped above).
info "Reading voice catalogue…"
while IFS= read -r line; do
  if [[ "${line}" =~ ^[[:space:]]+model:[[:space:]]+(.+)$ ]]; then
    current_model="${BASH_REMATCH[1]}"
  fi
  if [[ "${line}" =~ ^[[:space:]]+url:[[:space:]]+(.+)$ ]]; then
    current_url="${BASH_REMATCH[1]}"
    if [[ -n "${current_model}" && -n "${current_url}" ]]; then
      download_voice "${current_model}" "${current_url}"
      current_model=""
      current_url=""
    fi
  fi
done < "${XDG_VOICES_YAML}"

# ── Vale styles ──────────────────────────────────────────────────────────────

header "Vale"

if ! command -v vale &>/dev/null; then
  warning "vale is not installed — skipping vale sync"
else
  if command -v gum &>/dev/null; then
    spin "Syncing Vale styles…" vale sync
  else
    info "Syncing Vale styles…"
    vale sync
  fi
  info "Vale styles synced"
fi

# ── TUI ──────────────────────────────────────────────────────────────────────

header "TUI editor"

if command -v gum &>/dev/null; then
  spin "Installing Go dependencies…" bash -c "cd '$(dirname "$0")/../tui' && go mod tidy"
  spin "Building TUI binary…" bash -c "cd '$(dirname "$0")/../tui' && go build -o playback-tui ./cmd/playback-tui"
else
  info "Installing Go dependencies…"
  (cd "$(dirname "$0")/../tui" && go mod tidy)
  info "Building TUI binary…"
  (cd "$(dirname "$0")/../tui" && go build -o playback-tui ./cmd/playback-tui)
fi
info "TUI binary built"

# ── Link CLI ─────────────────────────────────────────────────────────────────

header "CLI"

(
  cd "$(dirname "$0")/.." &&
  npm install &&
  if npm ls -g playback-cli --depth=0 >/dev/null 2>&1; then
    npm unlink -g playback-cli
  fi &&
  npm link --ignore-scripts
)
info "playback CLI linked"

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
if command -v gum &>/dev/null; then
  gum style --foreground="#9ece6a" --bold --border="double" --border-foreground="#9ece6a" --padding="1 2" \
    "Setup complete!" \
    "" \
    "Run npm run build to compile, then:" \
    "" \
    "  npm run playback:demo                      — try the TUI with a demo tape" \
    "  playback tape <dir>                        — build a single episode" \
    "  npm run playlist:build                     — build all episodes" \
    "  npm run playback:edit -- <dir>             — open the TUI editor" \
    "  npm run playback:edit:accessible -- <dir>  — accessible mode" \
    "  npm run playback:edit:report -- <dir>      — plain-text report"
else
  info "Setup complete. Run ${BOLD}npm run build${RESET} to compile, then:"
  printf '  %bnpm run playback:demo%b                      — try the TUI with a demo tape\n' "${BOLD}" "${RESET}"
  printf '  %bplayback tape <dir>%b                        — build a single episode\n' "${BOLD}" "${RESET}"
  printf '  %bnpm run playlist:build%b                     — build all episodes\n' "${BOLD}" "${RESET}"
  printf '  %bnpm run playback:edit -- <dir>%b             — open the TUI editor\n' "${BOLD}" "${RESET}"
  printf '  %bnpm run playback:edit:accessible -- <dir>%b  — accessible mode\n' "${BOLD}" "${RESET}"
  printf '  %bnpm run playback:edit:report -- <dir>%b      — plain-text report\n' "${BOLD}" "${RESET}"
fi
