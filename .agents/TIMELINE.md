# Timeline

## What the timeline does

The timeline is the single source of truth for timing in the playback pipeline. Both VHS tape generation and audio mixing read from it. This eliminates the "two-clock problem" where the pipeline calculated VHS Sleep values and audio start times independently, causing drift.

## Lifecycle

1. `buildTimeline(parsed)` — walk tape steps once, produce `TimelineEvent[]`
2. `extractSegments(timeline)` — pull narration segments for Piper synthesis
3. Synthesise audio externally, get real WAV durations
4. `applyAudioDurations(timeline, segments, buffer)` — back-fill real durations
5. `generateVhsFromTimeline(timeline, parsed)` — emit the `.tape` file
6. `syncSegmentsToTimeline(timeline, segments)` — realign segment start times
7. Timeline feeds captions, ffmpeg mix, chapter markers

## Types

```text
Timeline
├── events: TimelineEvent[]
│   ├── stepIndex: number          # index into tape.steps
│   ├── startTime: number          # absolute seconds from recording start
│   ├── duration: number           # total time this event occupies
│   ├── vhs: VhsAction
│   │   ├── directives: string[]   # VHS commands (e.g. 'Type "npm install"', 'Enter')
│   │   ├── sleepSeconds: number   # Sleep value after directives
│   │   └── embeddedSleepSeconds?  # inter-command sleeps (narrate steps only)
│   └── narration: TimelineNarration | null
│       ├── text: string           # narration text for synthesis
│       ├── offset: number         # narrationOffset from tape.yaml
│       ├── audioStartTime: number # absolute start = startTime + offset
│       └── audioDuration: number | null  # real WAV duration (null before synthesis)
└── totalDuration: number
```

## Key functions

### `buildVhsAction(step)` — per-action timing

Calculates VHS directives and sleep for each action type:

- **`type`** — typing duration = `command.length × 75ms`. Sleep = `max(pause, narration − typing, 0.1)`.
- **`key`** — sleep = `max(pause, narration)`. Special keys (`Escape`, `Tab`, etc.) become VHS commands; others become `Type "x"`.
- **`run`** / **`comment`** — sleep = `max(pause, narration)`. No directives.
- **`narrate`** — the pipeline spaces commands evenly across the estimated narration duration. Each command gets a time slot; its sleep is `slot − typing`. The directives array embeds inter-command sleeps. The final command's sleep = `max(slotRemainder, pause)`.

### `eventDuration(step, vhs)` — duration invariant

Calculates total event duration. **Must produce identical values to `stepDuration()` in `constants.ts`** — both use the same rounding strategy. If these diverge, VHS recording and audio will drift.

- `type`: `typingDuration + sleepSeconds`
- `narrate`: `totalTypingDuration + embeddedSleepSeconds + sleepSeconds`
- All others: `sleepSeconds`

### `buildTimeline(parsed)` — initial build

Walks steps once. Each step gets a `VhsAction`, duration, and start time. Narration `audioStartTime` includes the step's `narrationOffset`. The cursor advances by each event's duration.

### `applyAudioDurations(timeline, segments, buffer)` — back-fill

After Piper synthesis returns real WAV durations:

1. **Extend sleep** — if audio + buffer > event duration, increase `sleepSeconds` and `duration` by the delta.
2. **Recalculate start times** — cascade: walk all events, recalculate `startTime` and `audioStartTime` from a fresh cursor.
3. **Resolve overlaps** — `resolveNarrationOverlaps()` ensures a minimum 0.25s gap (`NARRATION_GAP`) between consecutive narration clips. Only adjusts `audioStartTime`; does not change VHS timing.

The timeline mutates in place (performance choice — avoids copying large arrays).

### `resolveNarrationOverlaps(timeline)` — deconfliction

Walks narrated events in order. If a clip's audio end time bleeds into the next clip's start, pushes the next `audioStartTime` forward. This only affects audio placement, not VHS recording.

## Rounding invariant

All timing uses `round2(n)` — `Math.round(n * 100) / 100` (two decimal places). This replaced an earlier `Math.ceil` approach that caused cumulative 9-second drift on the `demo-tui` tape. The invariant: `eventDuration()` in timeline and `stepDuration()` in constants must use the same rounding. If you change rounding in one, change it in both.

## `fixedTiming` override

When `meta.yaml` sets `fixedTiming: true`, the pipeline skips `applyAudioDurations()` entirely. The author's `pause` values are authoritative and the pipeline will not extend them to fit audio. Use this for choreographed tapes where actions must fire during narration, not after it.
