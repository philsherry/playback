# Release notes — v1.0.5

## `vhs.shell` override

Configure the VHS terminal shell per tape via `meta.yaml`. Defaults to `zsh`
(the macOS default since Catalina); set this if your tape targets a different
shell or your recording environment uses `bash`.

```yaml
vhs:
  shell: bash
```

This joins the existing `vhs` overrides (`height`, `fontSize`, `theme`,
`typingSpeed`) and applies only to the tape that declares it.

---

## SRT timestamp fix

SRT milliseconds use a comma separator (`00:00:01,500` not `00:00:01.500`).
The previous code used `.replace('.', ',')` which, by a happy accident,
always worked — `formatTimestamp` produces one `.` — but was
expressing the wrong intent. Changed to `.replaceAll('.', ',')` so the
behaviour is explicit and correct regardless of future format changes.

---

## ASS subtitle encoding fix

The ASS `Style` header included `Encoding=1` (Windows ANSI), while the
generator writes the file as UTF-8. Most renderers auto-detect and ignore this field,
but if libass ever respected it, non-ASCII characters in narration text
would render as Mojibake — curly quotes (`'`) becoming `â€™`, for example.

Changed to `Encoding=0` (UTF-8) so the declared encoding matches the file.

---

## Inclusion audit

We identified the fixes in this release using the
[Gotrino inclusion plugin](https://gotrino.com/resources/inclusion-plugin/) for
Claude Code. It audits codebases for i18n readiness, inclusive language, and
encoding assumptions — the ASS and SRT issues above both surfaced through it.
Worth a look if you care about writing software that works for everyone.
