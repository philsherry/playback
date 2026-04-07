# Voice synthesis

Playback uses [piper-tts](https://github.com/rhasspy/piper) to generate narration
audio locally — no cloud dependency, no API key, no network call during synthesis.

---

## Adding voices to a tape

Set one or more voices in `meta.yaml`:

```yaml
voices:
  - northern_english_male
  - southern_english_female
```

The pipeline generates a full output set per voice. Omit the field to use the
`defaultVoices` from `playback.config.ts`.

---

## Available voices

| Voice | Quality | Sample rate |
|---|---|---|
| `northern_english_male` | medium | 22 050 Hz |
| `southern_english_female` | low | 22 050 Hz |

`southern_english_female` only has a `low` quality model. The pipeline handles
this automatically — no config change needed.

Two more models ship in `voices/` (`alba`, `alan`) but the pipeline does not
yet use them.

---

## Known limitations

| Limitation | Notes |
|---|---|
| `southern_english_female` is `low` quality only | No `medium` model exists for this voice. The audio quality is noticeably lower than the `medium` models. |
| Prosody varies across segments | Each `narration` field is a separate piper call. VITS samples fresh noise each time, so adjacent segments can sound like different reads. See [Audio variance](#audio-variance) below. |
| No seed control | The ONNX runtime does not expose a random seed. Reproducible synthesis requires batching all text into one call. |
| CPU-only synthesis | piper uses ONNX CPU inference. A 7-segment episode takes several seconds per segment on Apple silicon. The pipeline runs segments sequentially to avoid CPU thrashing. |
| No mid-episode voice switching | All segments in an episode use the same voice. |

---

## Phonetic substitutions

`src/substitutions.ts` maps literal strings to phonetic spellings before
synthesis:

| Input | Replacement |
|---|---|
| `GOV.UK` | `guv yew-kay` |
| `govuk` | `guv yew-kay` |

Add entries here for any acronym, brand name, or technical term that piper
mispronounces. Put longer or more-specific entries first.

---

## Contributor notes

The sections below cover the synthesis pipeline internals. They are for
contributors working on `src/runner/piper.ts`, `src/runner/ffmpeg.ts`, or the
audio mix.

### Inference parameters

Each `.onnx.json` config bakes in default inference parameters. All four voices
share identical defaults:

| Parameter | Default | Effect |
|---|---|---|
| `noise_scale` | `0.667` | Prosody variation (pitch, emphasis). Higher = more expressive but less consistent. |
| `noise_w` | `0.8` | Duration variation (phoneme widths). Higher = more speed variation between calls. |
| `length_scale` | `1.0` | Speaking rate multiplier. `>1` = slower, `<1` = faster. |
| _(sample rate)_ | `22050` | Fixed by the model — the inference call cannot change it. |

The `piper` CLI can override all three:

```text
--noise-scale       Generator noise (default from model config)
--noise-w-scale     Phoneme width noise (default from model config)
--length-scale      Phoneme length (default from model config)
```

### How ffmpeg mixes audio

`buildAudioFilterComplex()` in `src/runner/ffmpeg.ts` delay-normalises each
`.wav` and mixes them:

```text
[1:a]loudnorm=I=-16:TP=-1.5:LRA=11[norm0];[norm0]adelay=0|0[a0];
[2:a]loudnorm=I=-16:TP=-1.5:LRA=11[norm1];[norm1]adelay=7950|7950[a1];
…
[a0][a1]…amix=inputs=N:duration=longest:normalize=0[aout]
```

Key choices:

- `loudnorm` normalises each segment to **-16 LUFS** before mixing so no single
  clip dominates
- `adelay` positions each clip at the correct start time in milliseconds
- `amix normalize=0` keeps each stream at constant volume. The default
  (`normalize=1`) divides the sum by active input count, which causes volume to
  rise as earlier segments end — the "shouting" effect

### Audio variance

#### Symptoms

Narration sounds like several different people saying one sentence each. Pitch
and speaking rate shift noticeably between segments despite all audio coming
from the same model.

#### Root causes

#### 1 — Per-segment stochastic synthesis (primary cause)

The pipeline calls piper once per `narration` field. VITS samples from a noise
distribution on every inference call. With `noise_scale = 0.667` and
`noise_w = 0.8`, each independent call draws fresh noise samples — so each
segment sounds like a distinct read rather than a continuous delivery.

```text
call 1 → "First, clone the repository…"   → noise sample A
call 2 → "Git downloads the repository…"  → noise sample B
call 3 → "Let's see what's inside."        → noise sample C
```

No shared noise state exists across calls, and the ONNX runtime provides no
supported way to fix a seed.

#### 2 — Loss of prosodic continuity

Each synthesis call receives a single isolated sentence. The eSpeak-NG
phonemiser applies sentence-boundary prosody independently to every call —
short sentences get an aggressive falling tone, adjacent sentences each have
their own prosodic arc. This occurs even with `noise_scale 0` and `noise_w 0`.

#### 3 — Per-segment loudnorm

`loudnorm=I=-16:TP=-1.5:LRA=11` applied per segment in ffmpeg buffers and
analyses each clip independently. A short segment and a long segment get
different gain curves, which can introduce audible differences between adjacent
segments even when the raw audio is consistent.

#### Fixes to try

#### Fix A — Reduce noise scales (low risk)

Pass lower noise parameters to `piper`. Narrows variance without eliminating it:

```ts
// src/runner/piper.ts — synthesise()
'--noise-scale', '0.33',   // was: 0.667
'--noise-w-scale', '0.4',  // was: 0.8
```

These values are half the defaults. Benchmark by ear against a 7-segment tape.
These could also appear in `PlaybackConfig` for per-episode tuning.

#### Fix B — Batch synthesis (higher impact, more complex)

Concatenate all narration segments into a single `piper` call, then split the
resulting audio using silence detection (`ffmpeg -af silencedetect`) or a
marker tone. Removes prosody discontinuity almost entirely. Requires changes to
`src/runner/piper.ts` and `src/extractor/tts.ts`.

#### Fix C — Sentence silence

Adding trailing silence reduces the hard-cut feel between segments without
fixing prosody:

```sh
--sentence-silence 0.15
```

#### Fix D — Test alternative models

The `northern_english_male` model uses the `en-gb-x-rp` eSpeak voice. The
`alba` and `alan` models may use different eSpeak phonemisers and could have
better cross-segment continuity. Worth benchmarking once the pipeline supports them.
