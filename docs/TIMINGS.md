# Timing reference

How the pipeline keeps video and audio in sync.

## How it works

The pipeline builds a unified timeline from `tape.yaml`, synthesises audio
to get real WAV durations, then adjusts step timing so the VHS recording
never advances past a step before its narration finishes. The timeline is
the single source of truth — both VHS `Sleep` values and audio start times
come from it.

```text
1. Parse tape.yaml / meta.yaml
2. Build timeline from steps (estimated start times)
3. Synthesise primary voice WAVs (real durations via ffprobe)
4. Back-fill timeline (extend steps where audio is longer than the pause)
5. Record VHS (Sleep values now fit the audio)
6. Generate captions + ffmpeg mix
```

The back-fill formula for each narrated step:

```text
step.duration = max(original duration, audioDuration + AUDIO_BUFFER)
```

`tape.yaml` on disk is never modified — only the in-memory timeline is
updated.

## Constants

| Constant | Default | Location | Purpose |
| -------- | ------: | -------- | ------- |
| `AUDIO_BUFFER` | 0.5 s | `src/commands/tape.ts` | silence after each narration clip before the next step |
| `WORDS_PER_MINUTE` | 150 | `src/constants.ts` | estimated speech rate for pre-synthesis timing |
| `MIN_NARRATION_DURATION` | 1.5 s | `src/constants.ts` | minimum clip duration to avoid too-fast narration |
| `NARRATION_GAP` | 0.25 s | `src/timeline/index.ts` | minimum gap between consecutive audio clips in the mix |
| `TYPING_SPEED_MS` | 75 ms | `src/constants.ts` | per-character typing speed in VHS recordings |

`WORDS_PER_MINUTE` and `MIN_NARRATION_DURATION` only affect timing when the
pipeline has not synthesised audio (e.g. `--vhs-only` mode). In a full run
the back-fill replaces estimates with measured durations.

The effective breathing room between clips is
`AUDIO_BUFFER + NARRATION_GAP = 0.75 s`.

## Auditing

After a pipeline run, compare actual WAV durations against pause values:

```sh
# print a timing comparison table
npm run playback:tape -- studio/example/tape --audit

# print the table and fix shortfalls in tape.yaml
npm run playback:tape -- studio/example/tape --audit-fix
```

The `--audit-fix` flag writes `max(wavDuration + AUDIO_BUFFER, existingPause)`
for every step with a shortfall. It identifies steps by walking the YAML
structure (regex `/^ {2}- action:/`), so it works even when multiple steps
share the same pause value. It leaves all other lines untouched.

## Debug overlay

Burn command labels into the video to verify timing visually:

```sh
npm run playback:tape -- studio/example/tape --debug-overlay
```

Each label appears centred on screen for up to 2 seconds at the moment the
corresponding action fires in the recording.

## `narrationOffset`

The TUI timing editor writes a `narrationOffset` field to `tape.yaml` for
each step. This shifts the narration start time relative to the step's
visual start:

- positive values delay the narration (audio starts after the action)
- negative values advance the narration (audio starts before the action)

The pipeline consumes `narrationOffset` when building the timeline, so TUI
edits affect the final audio placement.

## Reproducing WAV durations

To list actual durations for all synthesised segments:

```sh
find blockbuster/studio -name "*.wav" | sort | while read f; do
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  rel="${f#blockbuster/}"
  printf "%s\t%s\n" "$rel" "$dur"
done
```
