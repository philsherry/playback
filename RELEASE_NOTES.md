# Release notes — v1.2.x

## Web audio output and caption improvements

Version 1.2.x adds web audio output with per-voice M4A files and a browser-ready manifest, multi-voice MKV bundling with selectable audio tracks, and caption word-wrapping at sixty-five characters per line. The playlist command gains pristine-tape support, and the manifest gains an Open Graph image placeholder. Patch release 1.2.3 fixes bugs identified in Copilot code review.

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

## Patch releases

Patches do not have release tapes. These notes are an addendum to the 1.2.x
minor release above.

### v1.2.1 — Poster extraction crash fix

A playlist run would stop dead if any tape had a `poster` frame number in
`meta.yaml` and `ffmpeg`'s `select` filter found no matching frame at that
timestamp. `ffmpeg` exits 0 in that case but writes nothing (or an empty
file), and the card-generation step would fail with exit code 254 trying to open
it as input.

The pipeline now checks that the extracted poster exists and has non-zero
content before passing it to `generateCard`. If the check fails the poster
and card are silently skipped — the rest of the pipeline continues.

Five new tests cover the guard: missing file, zero-byte file, valid file,
explicit `posterSourceFile` (where the guard is not consulted), and the
no-poster-at-all case.

### v1.2.2 — Web audio output and caption improvements

The main feature release for this series. See the sections above for full
details. Key additions:

- **`--web` flag** — per-voice M4A audio, shared silent MP4, and `manifest.json`
  for browser-based voice switching without re-downloading the video
- **`--manifest-only` flag** — regenerates `manifest.json` without re-running
  the pipeline
- **Multi-voice MKV bundling** — one MKV with selectable audio and subtitle
  tracks per voice
- **Caption word-wrapping** — ≤ 65 characters per line across VTT, SRT, and ASS
- **Open Graph image placeholder** — `og` field in manifest, `null` until a
  generation strategy lands
- **`tape.pristine.yaml` support** — playlist copies the pristine file to
  `tape.yaml` before recording when no `tape.yaml` is present
- **MKV container metadata fix** — `-map_metadata` replaced with `-map_chapters`
  to stop chapter embedding from clearing the explicit metadata flags
- **`docs/OUTPUT_FORMATS.md`** — reference for all output modes, caption sizing
  rules, and flag combinations

### v1.2.3 — Copilot review fixes (PRs #7, #8, #13)

- **`vhs.shell` schema validation** — `meta.yaml` now rejects shell values
  containing `"` characters; VHS `Set Shell "..."` has no escape sequence for
  them and would silently produce an invalid `.tape` file
- **Shell override in `generateVhsFromTimeline`** — the timeline VHS generator
  hard-coded `Set Shell "zsh"` regardless of `meta.yaml`'s `vhs.shell`
  override, diverging from `generateVhsTape`
- **Chapter marker priority in TUI** — the `§` chapter marker overwrote the
  `▸` cursor and `!` overlap markers for selected or flagged chapter steps;
  cursor and overlap markers now take precedence
- **`scaffold.ts` YAML frontmatter quoting** — titles containing `:` or `#`
  appeared unquoted in output, producing invalid YAML
- **FFMETADATA1 chapter title escaping** — `=`, `;`, `#`, `\`, and newlines
  in chapter titles went unescaped; ffmpeg rejects files with bare `=` or `;` in values
- **Redundant conditional in `scaffold.ts`** removed
- **`--captions-only`** no longer records the terminal or runs the web
  pre-loop video/GIF/poster encoding — `runVhs` is now guarded by
  `!captionsOnly` throughout
- **`--web` poster** is now copied into `webOutputDir` with the card generated
  from the copy, so the manifest is self-contained
- **Multi-voice non-web GIF** is now named `slug.gif` rather than
  `slug.<voice>.gif`
- **`buildM4aArgs`** now throws a descriptive error on empty segments instead
  of emitting an invalid `amix=inputs=0` ffmpeg filter
- Test coverage added for each fix
