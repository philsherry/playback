#!/usr/bin/env bash
set -euo pipefail

# build-studio.sh — Builds studio demo videos.
#
# The playback pipeline handles the full workflow for each tape:
# VHS recording, audio synthesis, caption generation, ffmpeg stitching,
# poster extraction, and manifest generation.
#
# This script orchestrates the multi-tape build:
#   1. Reset the example tape to its pristine state (with overlaps)
#   2. Run the pipeline for demo-tui        → blockbuster/studio/demo-tui/
#   3. Run the pipeline for demo-accessible → blockbuster/studio/demo-accessible/
#   4. Copy web-ready output to studio/dist/
#
# Usage:
#   npm run playback:studio:build
#   npm run playback:studio:build:debug   # with command overlay

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

STUDIO_DIR="${SCRIPT_DIR}"
EXAMPLE_DIR="${STUDIO_DIR}/example"
DIST_DIR="${STUDIO_DIR}/dist"

# ── Debug mode ───────────────────────────────────────────────────────────────
# Pass "debug" as the first argument to overlay command labels on the videos.
DEBUG_FLAGS=""
[[ "${1:-}" == "debug" ]] && DEBUG_FLAGS="--debug-overlay"

# Clean previous output.
rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}"

# ── Formatting ───────────────────────────────────────────────────────────────

if command -v gum &>/dev/null; then
  header() { echo ""; gum style --foreground="#bb9af7" --bold --border="rounded" --border-foreground="#545c7e" --padding="0 2" "$*"; }
  info() { gum style --foreground="#9ece6a" "✓ $*"; }
  error() { gum style --foreground="#f7768e" --bold "✗ $*" >&2; }
else
  header() { echo ""; echo "── $* ──"; }
  info() { echo "✓ $*"; }
  error() { echo "✗ $*" >&2; }
fi

# ── Step 0: Restore the example tape with intentional overlaps ───────────────

header "Step 0: Reset example tape"

PRISTINE="${EXAMPLE_DIR}/tape.pristine.yaml"
ACTIVE="${EXAMPLE_DIR}/tape.yaml"

if [[ -f "${PRISTINE}" ]]; then
  cp "${PRISTINE}" "${ACTIVE}"
  info "Restored tape.pristine.yaml → tape.yaml (overlaps reintroduced)"
else
  error "Pristine tape not found: ${PRISTINE}"
  exit 1
fi

# ── Step 1: Build demo-tui ───────────────────────────────────────────────────

header "Step 1: Build demo-tui"

cd "${PROJECT_ROOT}"
# shellcheck disable=SC2086
tsx src/cli.ts tape studio/demo-tui --web ${DEBUG_FLAGS}

TUI_OUTPUT="${PROJECT_ROOT}/blockbuster/studio/demo-tui"
TUI_DIST="${DIST_DIR}/demo-tui"
mkdir -p "${TUI_DIST}"

# Copy web-ready output to dist.
for ext in mp4 gif png vtt srt manifest.json; do
  src="${TUI_OUTPUT}/demo-tui.${ext}"
  if [[ -f "${src}" ]]; then
    cp "${src}" "${TUI_DIST}/demo-tui.${ext}"
    info "demo-tui.${ext} → dist/"
  fi
done

# ── Step 2: Build demo-accessible ────────────────────────────────────────────

header "Step 2: Build demo-accessible"

cd "${PROJECT_ROOT}"
# shellcheck disable=SC2086
tsx src/cli.ts tape studio/demo-accessible --web ${DEBUG_FLAGS}

ACC_OUTPUT="${PROJECT_ROOT}/blockbuster/studio/demo-accessible"
ACC_DIST="${DIST_DIR}/demo-accessible"
mkdir -p "${ACC_DIST}"

# Copy web-ready output to dist.
for ext in mp4 gif png vtt srt manifest.json; do
  src="${ACC_OUTPUT}/demo-accessible.${ext}"
  if [[ -f "${src}" ]]; then
    cp "${src}" "${ACC_DIST}/demo-accessible.${ext}"
    info "demo-accessible.${ext} → dist/"
  fi
done

# ── Done ─────────────────────────────────────────────────────────────────────

header "Done"
echo ""
echo "dist/demo-tui/:"
ls -lh "${TUI_DIST}"/ 2>/dev/null || true
echo ""
echo "dist/demo-accessible/:"
ls -lh "${ACC_DIST}"/ 2>/dev/null || true
