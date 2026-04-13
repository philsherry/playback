# Release notes — v1.2.2

## Web audio output and caption improvements

### `--web` flag

A new `--web` flag produces a web-optimised output set alongside (or instead of) the
standard per-voice MP4s.

The web output lives in a `web/` subdirectory of the tape's output directory:

- **`slug.silent.mp4`** — shared padded video with no baked audio and no burned-in
  captions. All voices share this file, so the browser only downloads the video once.
- **`slug.mp4` / `slug.<voice>.mp4`** — primary voice with burned-in captions and baked
  audio, for sharing and offline download.
- **Per-voice M4A** — each voice gets its own mixed audio file. Silence at `t=0`
  and between narration segments keeps `audio.currentTime` locked to `video.currentTime`
  without any server-side synchronisation.
- **Per-voice captions** — WebVTT and SRT files per voice, referenced from the manifest.
- **`manifest.json`** — machine-readable index of all assets. The `video` key points to
  the silent MP4 for the web player; `download` points to the primary voiced MP4 for
  sharing. A web player loads the manifest to populate a voice selector and wire up the
  correct audio and caption files.

A minimal web player loop looks like this:

```javascript
video.addEventListener('play',   () => audio.play());
video.addEventListener('pause',  () => audio.pause());
video.addEventListener('seeked', () => { audio.currentTime = video.currentTime; });
```

### `--manifest-only` flag

Regenerates `manifest.json` from existing web output files without re-running the
pipeline. Useful when you need to update metadata or add a poster after an initial build.

### Multi-voice MKV bundling

`--mkv` now produces a single MKV with one audio stream and one subtitle stream per
voice, rather than a per-voice MKV. Players such as VLC and mpv expose these as
selectable tracks at playback time. Stream labels carry the voice name.

`--web` and `--mkv` combine freely to produce both formats in one pass.

### Caption word-wrapping

Narration text is now word-wrapped at ≤ 65 characters per line (GOV.UK style guide
recommendation) with a hard ceiling of 2 lines. This prevents long narration segments
from overflowing the 60px caption bar at 18px font.

- VTT and SRT: lines separated by `\n`
- ASS: lines separated by `\N` (ASS hard line break)

The pipeline already warns when a narration segment exceeds 25 words; wrapping is
the last line of defence for segments that slip through.

### Open Graph image placeholder

The manifest now includes an `og` field for a 1200×630 Open Graph image alongside
the existing `poster` (1280×720) and `card` (640×360) fields. The value stays `null`
until a generation strategy lands; adding the field now avoids a manifest schema change later.

### `tape.pristine.yaml` support in playlist

`playback playlist` now handles tape directories that contain only a
`tape.pristine.yaml` file (no `tape.yaml`). The pipeline copies the pristine file to
`tape.yaml` before recording, matching the behaviour of `build-studio.sh`. Useful
for demo tapes that need a clean reset before each build.

### MKV container metadata fix

MKV files were missing all container metadata (title, artist, description, etc.)
in players such as VLC. The cause: chapter embedding used `-map_metadata ${n}`,
which copies *global* metadata from the chapter file rather than the chapter
markers themselves. FFMETADATA1 chapter files carry no global tags, so this
cleared the metadata the explicit `-metadata` flags were about to write.

All three ffmpeg paths now use `-map_chapters ${n}` for chapter embedding,
separating it cleanly from global metadata handling.

### New documentation

`docs/OUTPUT_FORMATS.md` documents all output modes (`default`, `--web`, `--mkv`),
caption sizing rules, the web player sync pattern, and how to combine flags.
