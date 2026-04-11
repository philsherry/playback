---
title: "Install and explore"
version: "1.0.0"
duration: ~60-90 seconds
---

## What this video shows

Clone the govuk-design-system-skills repository, explore its top-level structure, look inside the components directory, read a `SKILLS.md` file, and see the agents directory.

## What you will see

1. Cloning the repo.
2. Listing the two main directories: `govuk-design-system/` and `agents/`.
3. Exploring the components directory structure.
4. Reading the button component's `SKILLS.md` file.
5. Listing the agents directory.

## Why this tape exists

This is a concrete example of a tape that uses workspace features. It references `{{GDS_SKILLS_COMPONENTS_DIR}}` and `{{GDS_SKILLS_AGENTS_DIR}}` constants defined in `workspace.yaml`, which resolve to paths inside the govuk-design-system-skills workspace source.

It matches the s1e01 episode plan from `docs/CASE_STUDY.md`.

## Prerequisites

Copy the example workspace config and clone the skills repo:

```sh
cp workspace.example.yaml workspace.yaml
npx -y degit philsherry/govuk-design-system-skills workspace/govuk-design-system-skills
```

## What comes next

s1e02 — Load a skills file in Claude Code and see how it changes the quality of the answers you get.
