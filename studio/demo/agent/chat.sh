#!/usr/bin/env bash
set -euo pipefail

QUESTION="${1:-}"

if [[ -z "$QUESTION" ]]; then
    echo "Usage: chat.sh <question>" >&2
    exit 1
fi

ask() {
    local text="$1"
    gum style \
        --foreground 8 \
        --border rounded \
        --border-foreground 8 \
        --padding "0 1" \
        "? ${text}"
}

answer() {
    local text="$1"
    gum style \
        --foreground 212 \
        --border rounded \
        --border-foreground 99 \
        --padding "0 1" \
        --width 68 \
        "→ ${text}"
}

ask "$QUESTION"

case "$QUESTION" in
    "How do I work this?")
        answer "Try docs/TLDR.md — the clue's in the name."
        ;;
    "Can I make a playlist?")
        answer "Yes — playback playlist builds all your tapes at once."
        ;;
    "Where do my tapes end up?")
        answer "In blockbuster/, mirroring your tape's path.
A tape at tapes/intro/ produces blockbuster/tapes/intro/intro.mp4."
        ;;
    *)
        answer "I don't know that one yet — but the docs might."
        ;;
esac
