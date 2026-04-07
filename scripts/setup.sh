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

# Download to the XDG shared cache so models are reused across projects.
# Use --local flag to download to the project-local voices/ directory instead.
VOICES_YAML="$(dirname "$0")/../voices.yaml"
if [[ " $* " == *" --local "* ]]; then
  VOICES_DIR="$(dirname "$0")/../voices"
else
  VOICES_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/playback/voices"
fi
mkdir -p "${VOICES_DIR}"
info "Voice cache: ${VOICES_DIR}"

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

# Read voices from voices.yaml (the single source of truth).
info "Reading voice catalogue from voices.yaml…"
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
done < "${VOICES_YAML}"

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
  spin "Building TUI binary…" bash -c "cd '$(dirname "$0")/../tui' && go build -o playback-tui ."
else
  info "Installing Go dependencies…"
  (cd "$(dirname "$0")/../tui" && go mod tidy)
  info "Building TUI binary…"
  (cd "$(dirname "$0")/../tui" && go build -o playback-tui .)
fi
info "TUI binary built"

# ── Link CLI ─────────────────────────────────────────────────────────────────

header "CLI"

cd "$(dirname "$0")/.." && npm link
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
