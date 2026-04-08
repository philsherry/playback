# Release notes — v1.0.4

## `chapter` tape action

Named chapter markers for your tape. When at least one `chapter` step is
present, the pipeline embeds those chapters into the final `.mp4` — visible
in QuickTime, VLC, and any player that reads MP4 chapter metadata.

```yaml
steps:
  - action: chapter
    title: Installation

  - action: type
    command: npm install govuk-frontend
    narration: First, install the package.

  - action: chapter
    title: Exploring the output
```

Without any `chapter` steps the pipeline behaves as before —
`chapters.txt` is still written for `ffprobe` diffing, but nothing is
embedded in the video.

Verify embedded chapters after a build:

```sh
ffprobe -v quiet -print_format json -show_chapters blockbuster/path/to/output.mp4
```

---

## `--mkv` flag

Produces a `.mkv` archive alongside the usual `.mp4` and `.gif`. The MKV
contains the same video and audio, plus the SRT captions as a subtitle
track you can toggle in your player — no burned-in text, no extra dependencies.

```sh
playback tape studio/example --mkv
```

Verify the subtitle track is present:

```sh
ffprobe -v quiet -show_streams -select_streams s blockbuster/studio/example/example.mkv
```

---

## `playback scaffold <dir>`

Generates a `PROMPT.md` template in a tape directory, pre-filled from
`meta.yaml` and the narration text in `tape.yaml`. Useful when starting a
new tape or documenting one you already have.

```sh
playback scaffold studio/example
```

Pass `--force` to overwrite a `PROMPT.md` that already exists:

```sh
playback scaffold studio/example --force
```

---

## Styled CLI help

The `--help` output now uses colour when running in a terminal. Bold command
names, dimmed descriptions, yellow flags. Falls back to plain text when
piped or when `NO_COLOR` is in the environment.

```sh
playback --help
playback --help | cat        # plain text
NO_COLOR=1 playback --help   # also plain text
```
