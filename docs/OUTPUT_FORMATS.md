# Output formats

Playback produces different output depending on the flags you pass to `playback tape`.
This document describes what each mode produces and when to use it.

## Default (no flags)

Suitable for sharing as standalone files — download, embed in a README, or distribute directly.

Each voice listed in `meta.yaml` produces its own output set:

```text
blockbuster/<tape>/
├── slug.gif                ← one GIF shared across voices (video only)
├── slug.alan.mp4           ← padded 1280×720, burned-in captions, baked audio
├── slug.alan.vtt           ← WebVTT captions
├── slug.alan.srt           ← SRT captions
├── slug.alan.ass           ← ASS captions (used for burn-in; kept for reference)
├── slug.alba.mp4
├── slug.alba.vtt
├── slug.alba.srt
├── slug.alba.ass
├── ...                     (one set per voice)
├── slug.poster.png         ← 1280×720 poster image (if configured)
├── slug.card.png           ← 640×360 card image (if configured)
├── slug.tape               ← generated VHS tape file
├── slug.raw.mp4            ← raw terminal recording before audio and caption mix
└── segments/               ← per-voice synthesised WAV files
```

Single-voice tapes produce `slug.mp4` (no voice suffix).

## `--web`

Suitable for a web player that needs to switch between voices without re-downloading the video.

All voices share the terminal recording. The primary voice also produces a standalone MP4
for sharing and download. Each voice provides its own audio track and caption files. The
web player keeps them in sync via `currentTime`.

The **primary voice** is `voices[0]` from `meta.yaml`, falling back to `defaultVoices[0]`
from `playback.config.ts`.

```text
blockbuster/<tape>/
└── web/
    ├── slug.silent.mp4         ← shared padded video (no audio, no burned captions — for web player)
    ├── slug.mp4                ← primary voice: burned-in captions, baked audio (single-voice)
    ├── slug.alan.mp4           ← primary voice: burned-in captions, baked audio (multi-voice)
    ├── slug.gif                ← shared GIF (from silent video)
    ├── slug.alan.m4a           ← mixed audio for this voice
    ├── slug.alan.vtt           ← captions for this voice
    ├── slug.alan.srt
    ├── slug.alba.m4a
    ├── slug.alba.vtt
    ├── slug.alba.srt
    ├── ...                     (one M4A + captions per voice; shareable MP4 for primary voice only)
    ├── slug.poster.png
    ├── slug.card.png
    └── slug.manifest.json      ← machine-readable index of all assets
```

### Manifest format

All paths in the manifest are relative to the output directory.

```json
{
  "card": "slug.card.png",
  "description": "...",
  "download": "slug.mp4",
  "episode": 1,
  "gif": "slug.gif",
  "locale": "en-GB",
  "og": null,
  "poster": "slug.poster.png",
  "series": "s6-quality",
  "title": "Run the linter",
  "video": "slug.silent.mp4",
  "voices": [
    {
      "audio": "slug.alan.m4a",
      "captions": {
        "srt": "slug.alan.srt",
        "vtt": "slug.alan.vtt"
      },
      "voice": "alan"
    }
  ]
}
```

- `video` — the audio-free `slug.silent.mp4` used by the web player for voice switching
- `download` — the primary voiced MP4 for sharing and offline viewing

### Web player sync

```javascript
const audio = new Audio(selectedVoice.audio);

video.addEventListener('play',   () => audio.play());
video.addEventListener('pause',  () => audio.pause());
video.addEventListener('seeked', () => { audio.currentTime = video.currentTime; });
```

The M4A contains silence at t=0 and between narration segments, so keeping `audio.currentTime`
mirroring `video.currentTime` maintains timing.

## `--mkv`

Suitable for archiving or distributing a single file that contains everything.

One MKV file with all voices as selectable audio streams and all captions as subtitle streams.
Most video players (VLC, mpv) let the viewer switch between them at playback time.

```text
blockbuster/<tape>/
├── slug.mkv                ← all voices, all captions in one container
└── ...                     (default output files also produced)
```

The MKV container metadata labels audio and subtitle streams with the voice name.

## Caption sizing

Captions are word-wrapped at **65 characters per line**, with a hard ceiling of **2 lines**.

Two reasons drive these limits:

1. **Layout** — the caption bar is 60px tall (1280×720 minus the 660px terminal recording area).
   At 18px font, it holds 2 lines. A third line would overflow into the terminal content.

2. **Authoring** — if a narration segment cannot fit in two lines at 65 characters, that segment
   says too much at once. The 65ch limit follows the GOV.UK style guide for readable line lengths.

The pipeline emits a warning during synthesis when any narration segment exceeds 25 words
(approximately 10 seconds of speech at 150 WPM). This is advisory — the build continues —
but serves as a useful signal that the segment warrants splitting.

## Combining flags

You can use `--web` and `--mkv` together:

```sh
playback tape tapes/s6-quality/01-run-the-linter --web --mkv
```

This produces the full web output set (shared video, M4A files, manifest) and the MKV bundle
alongside it.
