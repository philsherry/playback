---
title: "Case study: writing tapes for govuk-design-system-skills"
description: "How we planned, wrote, and produced 18 terminal demo videos for the govuk-design-system-skills repo using playback."
last-reviewed: "2026-04-05"
---

This document walks through how we planned and wrote 18 terminal demo videos
for the [govuk-design-system-skills](https://github.com/philsherry/govuk-design-system-skills)
repo. Each video is a `playback` tape — a YAML file that describes what
happens in the terminal and what the narrator says. If you want to create
your own tape series, this is how we did it.

## Step 1: Define the audience and group by complexity

We split the videos into six series, each targeting a different audience
and building on the last:

| Series | Audience | Focus |
|--------|----------|-------|
| **s1 — Getting started** | Anyone new to the repo | Clone, explore, load a file, use an agent, copy into a project |
| **s2 — Setup by tool** | Users of Cursor, Copilot, Claude.ai | One video per tool, standalone |
| **s3 — Components** | Front-end developers | Deep dives into button, date-input, error handling |
| **s4 — Patterns** | Interaction designers | Check answers, task list, question pages |
| **s5 — Agents** | Anyone using the agents | Accessibility audit, content review, full discipline chain |
| **s6 — Quality** | Contributors | Linter workflow, `SKILLS.md` format |

Series 1 works in order. Series 2–5 are standalone — pick the one you need.
Series 6 is for people contributing back to the repo.

## Step 2: Write one episode per idea

Each video covers one thing. We kept a consistent structure for the planning
notes so every episode answers the same questions:

- **Who watches this?** — the audience
- **What does it cover?** — the topic in one sentence
- **What happens in the terminal?** — the commands typed and the output shown
- **What does the narrator say?** — key points, not a full script (the script goes in `tape.yaml`)
- **How long should it run?** — target duration

### Series 1: Getting started (4 episodes)

**s1e01 — Install and explore.**
`git clone`, `ls` walkthrough, open a `SKILLS.md` file. Explain the two
top-level directories (`govuk-design-system/` and `agents/`), point out
frontmatter, sections, and code examples. 60–90 seconds.

**s1e02 — Load a skills file in Claude Code.**
The `@` file reference syntax. Ask a question using a `SKILLS.md` as context,
show the answer referencing actual macro parameters. Contrast with what you
get without the skills file. 60–90 seconds.

**s1e03 — Use an agent in Claude Code.**
Load the front-end developer agent via `--agent`. Explain agents as
role-based personas, not tools. Show the agent reviewing Nunjucks and
catching a markup issue. 90–120 seconds.

**s1e04 — Copy skills into your own project.**
`cp -r`, create a `CLAUDE.md`, verify it. Explain why copying beats
referencing — skills files stay available wherever you work. 60–90 seconds.

### Series 2: Setup by tool (3 episodes)

**s2e01 — Setup with Cursor.**
Copy skills files to `.cursor/rules/`, verify Cursor picks them up.
45–60 seconds.

**s2e02 — Setup with GitHub Copilot.**
Create `.github/instructions/` and `copilot-instructions.md`. Show how
Copilot loads context from these files. 45–60 seconds.

**s2e03 — Setup with Claude.ai (web).**
Show file preparation in the terminal, describe the upload flow in
narration (cannot demo the Claude.ai UI directly). 45–60 seconds.

### Series 3: Components (3 episodes)

**s3e01 — Button component deep dive.**
The most-used component. Walk through variants, macro parameters,
`preventDoubleClick`, and accessibility requirements. 90–120 seconds.

**s3e02 — Date input with validation.**
The three-field pattern, validation rules, prescribed error messages. A
common source of mistakes that AI gets wrong without the skills file.
90 seconds.

**s3e03 — Error handling: error-message and error-summary together.**
Two components that work as a pair. Prescribed wording, where each appears,
the GOV.UK link-to-field pattern. 90–120 seconds.

### Series 4: Patterns (3 episodes)

**s4e01 — Check your answers page.**
Summary list structure, change links, submission confirmation. Shows how
a pattern file goes beyond component guidance into flow and interaction
advice. 90 seconds.

**s4e02 — Task list pattern.**
The `complete-multiple-tasks` pattern and the `task-list` component together.
A good example of where patterns and components intersect. 90–120 seconds.

**s4e03 — Question pages pattern.**
One-thing-per-page in practice. The most fundamental GOV.UK design principle
and how the skills file describes it. 90 seconds.

### Series 5: Agents (3 episodes)

**s5e01 — Accessibility audit with the accessibility auditor agent.**
Load the agent, review a page, show it citing WCAG criteria and referencing
the relevant `SKILLS.md`. 90–120 seconds.

**s5e02 — Content review with the content designer agent.**
Review error messages and question wording. Show the agent spotting passive
voice, high reading levels, and non-GOV.UK error message wording.
90 seconds.

**s5e03 — Sequential review: the full discipline chain.**
Run one piece of work through interaction designer, content designer,
front-end developer, and accessibility auditor in sequence. The "power user"
video — four reviews, each catching different things. 3–4 minutes.

### Series 6: Quality and contribution (2 episodes)

**s6e01 — Run the linter.**
`npm test` passing, introduce a passive voice sentence, `npm test` failing,
fix it, passing again. Shows the contributor workflow. 60–90 seconds.

**s6e02 — The `SKILLS.md` format (contributor guide).**
Walk through a complete `SKILLS.md` file section by section. Covers the
format well enough that someone could write a new one from scratch. The
final video in the collection. 2–3 minutes.

## Step 3: Decide on production order

We did not produce these in series order. Instead, we started with the
episodes that set the scene and show the highest-value use cases:

1. s1e01 — Install and explore (sets the scene)
2. s1e02 — Load a skills file (core use case)
3. s1e03 — Use an agent (second core use case)
4. s3e01 — Button deep dive (shows a complete SKILLS.md)
5. s3e03 — Error handling (high-value, commonly got wrong)
6. s4e01 — Check your answers (important GOV.UK pattern)
7. s5e01 — Accessibility audit (accessibility is the headline feature)
8. s1e04 — Copy into your project (enables the rest)
9. s6e01 — Run the linter (contributor workflow)
10. Everything else as appetite allows

## Step 4: Write the tapes

Each tape directory contains three files:

- `tape.yaml` — the recording script (commands, narration, pause values)
- `meta.yaml` — episode metadata (title, series, episode, voices, tags)
- `PROMPT.md` — a human-readable description of the episode

The `studio/example/` tape serves as the baseline for format, pacing, and
narration style.

## Step 5: Run the pipeline

```sh
playback tape tapes/s1-getting-started/01-install-and-explore
```

This generates the `VHS` recording, synthesises narration with `piper-tts`, generates captions (WebVTT, SRT, ASS), and stitches everything into the final `.mp4` and `.gif`.

> **Note:** these tapes now live in the
> [govuk-design-system-skills](https://github.com/philsherry/govuk-design-system-skills)
> repo. The directory structure below describes where they sit in that repo.

## Tape directory structure

```text
tapes/
  s1-getting-started/
    01-install-and-explore/
    02-load-a-skills-file/
    03-use-an-agent/
    04-copy-into-your-project/
  s2-setup-by-tool/
    01-cursor/
    02-github-copilot/
    03-claude-ai-web/
  s3-components/
    01-button/
    02-date-input/
    03-error-handling/
  s4-patterns/
    01-check-your-answers/
    02-task-list/
    03-question-pages/
  s5-agents/
    01-accessibility-audit/
    02-content-review/
    03-full-discipline-chain/
  s6-quality/
    01-run-the-linter/
    02-skills-md-format/
```

Output mirrors the tape path: `blockbuster/s1-getting-started/01-install-and-explore/`.

## Format decisions

- All videos: 1280x720, terminal only (no browser or UI demos)
- Target duration: 60–90 seconds per video (series 1–5), up to 3 minutes for complex ones
- Default voice: `northern_english_male`
- Every tape has `series` and `episode` fields in `meta.yaml`
- AI output disclaimer in s1e02, set once, not repeated every episode:
  > "Your Claude might use different wording to ours, but the facts it draws from are the same skills file."
