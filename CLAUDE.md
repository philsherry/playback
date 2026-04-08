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

## Applied learning

When something fails again and again, when the user has to re-explain or tell you off, or when you or the user find a workaround for a platform/tool limitation, add a one-line bullet point here. Keep each bullet point under 15 words. No explanations. Only add things that will save time in future sessions. Inform the user when you add new points.

- Stop rerunning validation after the user confirms it already passed.
