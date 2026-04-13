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
    "What's new in 1.3.0?")
        answer "One new command: playback init-agent.
Two files. One for Claude Code, one for Copilot."
        ;;
    "What does playback-runner know?")
        answer "Everything — tapes, voices, CLI flags, timing,
the TUI. Ask it anything."
        ;;
    "Who is it for?")
        answer "Anyone who makes tapes and wants answers
without leaving the terminal."
        ;;
    *)
        answer "I don't know that one yet — but the docs might."
        ;;
esac
