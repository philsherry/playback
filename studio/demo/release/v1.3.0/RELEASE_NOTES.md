# Release notes — v1.3.0

## `playback init-agent` and the playback-runner agent

Playback 1.3.0 adds a `playback init-agent` command that installs a
context-aware AI agent into any project that uses Playback.

### Installing the agent

Run `playback init-agent` from any project root to create two files:

- `.claude/agents/playback-runner.md` — a Claude Code subagent
- `.github/prompts/playback-runner.prompt.md` — a GitHub Copilot agent

Both files are identical in content. The agent is called `playback-runner`.

```sh
playback init-agent         # install into current project
playback init-agent --force # overwrite existing agent files
```

### What playback-runner knows

`playback-runner` is a friendly, practical guide for tape authors. It
covers the full Playback feature set: tape and meta authoring, CLI flags,
voices, timing, the TUI editor, scaffolding, and playlists.

It is written for designers and content creators — people who know what
they want to make but may not be deeply technical. It speaks plainly,
avoids jargon, and says what is true rather than what is safe.

### Why "runner"?

Playback is named after VHS tapes. On a film set, the runner does
whatever is needed — no ego, no credits. It felt right.

There is also a *Blade Runner* in there somewhere, if you look for it.
