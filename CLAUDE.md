# Playback

## Helping the user

Do not make any changes until you have 95% confidence in what you need to build. Ask the user questions until you reach that confidence level. Write the plan out and confirm with the user before starting.

## Testing

Run the relevant tests before finishing any edit:

```sh
npm run test:ts      # TypeScript tests (must pass)
npm run test:tui     # Go tests (must pass)
npm run typecheck    # type checking (must pass)
npm run lint         # all linting (advisory)
```

Read @.agents/TESTING.md

## Setup and dependencies

Read @.agents/SETUP.md

## Project structure

Read @.agents/STRUCTURE.md

## Pipeline

Read @.agents/PIPELINE.md

## Tapes

Read @.agents/TAPES.md

## TUI

Read @.agents/TUI.md

## TUI UI package

Read @.agents/TUI_UI.md

## Timeline

Read @.agents/TIMELINE.md

## Memory

Session memory lives in `.claude/memory/`. The index is `.claude/memory/MEMORY.md`.

## Pre-release checklist

Claude assists with release preparation but never commits or tags. The user
handles all git operations. Before a release is ready, confirm:

1. **Version bump** — update `package.json` and `package-lock.json` (both the
   root `version` field and `packages[""].version`) to the new semver
2. **`CHANGELOG.md`** — add a `## [x.y.z] - YYYY-MM-DD` heading as the first
   version entry, with a non-empty body. Add a comparison link at the bottom
3. **`RELEASE_NOTES.md`** — for **patch** releases the title must be
   `# Release notes — v<major>.<minor>.x`; for **minor/major** it must be
   `# Release notes — v<version>` (exact). The body must be non-empty
4. **Patch vs minor/major** — patch releases (`x.y.Z` where `Z > 0`) skip the
   release tape and archive requirements. Minor/major releases need
   `studio/demo/release/v<version>/tape.yaml` and a copy of `RELEASE_NOTES.md`
   in the same directory
5. **Verify** — run `npm run release:check` to confirm all metadata is aligned
   before handing back to the user to commit and tag

## Applied learning

When something fails again and again, when the user has to re-explain or tell you off, or when you or the user find a workaround for a platform/tool limitation, add a one-line bullet point here. Keep each bullet point under 15 words. No explanations. Only add things that will save time in future sessions. Inform the user when you add new points.

- Stop rerunning validation after the user confirms it already passed.
- Never commit without explicit user instruction. One clean commit per PR.
- `__dirname ?? fallback` throws in ESM — guard with an existence check, not `??`.
- `test:smoke` runs built `dist/cli.js` against real tapes; `tsx` masks ESM-only bugs.
- VHS `Type` types characters verbatim — `\\` is two backslashes, not one. Don't escape `\` in `escapeVhs`.
- VHS `Type "..."` has no escape for `"` — schema rejects commands containing double quotes.
- `release:check` tape guard skips patch releases (`x.y.Z > 0`); only minor/major need a release video.
- Shell escapes in `command:` fields need `$'\033c'` not `'\033c'` — single quotes suppress escape sequences.
