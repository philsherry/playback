# Release notes — v1.5.0

## VHS preamble support for freeform recordings

Playback 1.5.0 adds `vhs.preamble` to `meta.yaml` — an escape hatch for
consumer projects that need to inject raw VHS directives before any step
content runs.

### What it does

`vhs.preamble` is an optional string array in the `vhs` block of `meta.yaml`.
Each entry is one VHS directive line, emitted verbatim into the generated
`.tape` file after the `Set` configuration block and before the first step:

```yaml
vhs:
  preamble:
    - Hide
    - 'Type "exec 2>/dev/null"'
    - Enter
    - 'Type "set +H"'
    - Enter
    - 'Type "PROMPT_COMMAND=''"'
    - Enter
    - "Type \"PS1=''\""
    - Enter
    - "Type \"printf '\\033c'\""
    - Enter
    - Sleep 0.5
    - Show
```

### Why it exists

Freeform recordings display agent speech as plain text typed directly into
the terminal. Without setup, each typed sentence triggers a `command not found`
error, the shell prompt appears before the text, and `!` characters cause bash
history expansion. The `Hide`/`Show` block above solves all three: it runs
the setup invisibly and resumes recording on a clean, promptless surface.

### No breaking changes

`vhs.preamble` is optional. Tapes without it behave identically to previous
releases.
