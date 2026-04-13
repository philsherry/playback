# Captions

Playback generates captions in three formats for every narrated tape. This document describes
what each format does, where to use it, and when.

---

## Formats

### WebVTT (`.vtt`)

The web standard. Loaded by browser `<video>` elements via a `<track kind="subtitles">` element,
and by most media players that support network streams.

```text
WEBVTT

00:00:02.400 --> 00:00:06.800
Let's set up a small project to explore.

00:00:08.100 --> 00:00:12.600
A typical project layout.
```

VTT supports basic inline styling (`<b>`, `<i>`, `<ruby>`) and CSS customisation via `::cue`
in the browser. The web player's `<track>` element uses this format.

[`<ruby>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/ruby) is an HTML element
for annotating East Asian text with pronunciation guides (furigana). In VTT it lets you pair
a word with a phonetic gloss — useful for technical terms or proper nouns that a screen reader
or foreign-language viewer may not recognise.

**Use when:** serving video on the web and letting the browser render captions as an overlay.

---

### SRT (`.srt`)

The universal fallback. No styling, no metadata — just a sequence number, a timestamp range,
and caption text. Every media player that has ever existed reads SRT.

```text
1
00:00:02,400 --> 00:00:06,800
Let's set up a small project to explore.

2
00:00:08,100 --> 00:00:12,600
A typical project layout.
```

Note the comma separator in timestamps — a common source of confusion when converting to VTT
(which uses a full stop).

**Use when:** distributing video files to an audience who will play them locally in any player,
or when submitting captions to a platform that does not accept VTT.

---

### ASS / Advanced SubStation Alpha (`.ass`)

The format ffmpeg uses internally for subtitle burn-in. ASS carries per-cue positioning,
font styling, background box, and — relevant to the karaoke feature — word-level timing tags.

```text
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:02.40,0:00:06.80,Default,,0,0,0,,Let's set up a small project to explore.
```

The pipeline keeps the generated `.ass` file in the output directory alongside the `.vtt` and
`.srt` files. ffmpeg's `subtitles=` filter reads it directly to burn captions into the MP4.
You do not need to open it.

**Use when:** you need to inspect or edit the burned-in captions before re-encoding — or when
building the karaoke variant (see below).

---

## Burned-in vs soft captions

| | Burned-in | Soft |
| --- | --- | --- |
| **Stored** | Baked into pixel data | External file loaded at playback time |
| **Format used** | ASS (via ffmpeg `subtitles=` filter) | VTT (browser `<track>`), SRT (players) |
| **Toggleable by viewer** | No | Yes (viewer can hide them) |
| **Works without a player** | Yes — visible in any viewer | No — player must load the file |
| **Recommended for** | Standalone MP4 downloads, GIFs, social sharing | Web player with `<track>`, MKV multi-stream |

The standard `playback tape` output bakes captions in. The `--web` output uses soft captions
loaded by the browser, because the shared silent video does not have a fixed audio track and
the player controls both together.

---

## Caption sizing

Captions are word-wrapped at **65 characters per line**, with a hard ceiling of **2 lines**.

Two constraints drive these numbers:

1. **Layout.** The video frame is 1280×720. The terminal recording occupies the top 660px,
   leaving a 60px caption bar at the bottom. At 18px font with standard line height (~23px),
   that bar holds two comfortable lines. A third line would overflow into the terminal
   content area.

2. **Authoring.** 65 characters per line follows the GOV.UK style guide recommendation for
   readable line lengths. If a narration segment cannot fit within two lines at 65 characters,
   the segment carries too much information for a single caption cue. The limit nudges authors
   toward shorter, more digestible narration.

The wrapping algorithm:

- **≤ 65ch** — single line, no wrap
- **66–130ch** — wrap at the word boundary nearest the midpoint; both lines stay ≤ 65ch
- **> 130ch** — force two lines, each up to `ceil(length / 2)` characters

Use `\N` for line breaks in ASS and `\n` in VTT and SRT.

---

## Word count guidance

The pipeline emits a warning during synthesis when any narration segment exceeds **25 words**:

```text
⚠ Step 4: narration is 31 words (limit: 25)
```

At 150 words per minute — a comfortable listening pace — 25 words takes approximately 10 seconds.
Beyond this, a single segment is too dense for comfortable listening and will produce
captions approaching the two-line ceiling.

This warning is advisory. The build continues — treat it as a signal that the segment is worth splitting,
not a hard error.

Word count is also visible in:

- The `--audit` timing table (`Words` column)
- The TUI inspector panel (step detail view, with an over-limit indicator)

---

## Recommendation

| Situation | Reach for |
| --- | --- |
| Sharing a standalone MP4 | Burned-in captions (default — already in the file) |
| Web player with voice switching | `.vtt` soft captions via `<track>` (`--web` output) |
| Local playback in any media player | `.srt` — universal support |
| Archiving all voices in one file | `.mkv` — subtitle streams per voice (`--mkv` flag) |
| Inspecting or editing burned-in timing | `.ass` — open in Aegisub or a text editor |

If in doubt: the burned-in MP4 is the most portable option. A viewer who cannot see or toggle
captions still gets them, without needing a sidecar file or a capable player.

---

## Karaoke captions

> **Status: planned.** This section documents the karaoke caption design —
> implementation comes later. The feature depends on WhisperX for
> forced-alignment word timing, which requires PyTorch ≥ 2.4 — a version
> with no wheels for Intel Mac x86_64. Containerised Python tool support
> must land first (see `ROADMAP.md`). Everything below describes the
> intended design.

The next step beyond line-level captions is word-level highlighting: the full cue is visible
throughout, and each word lights up as the voice speaks it. This is the "karaoke" style familiar from
Japanese subtitle conventions.

ASS supports this natively with `{\kf<duration>}` tags, where duration is in centiseconds:

```text
{\kf42}Let's {\kf31}set {\kf19}up {\kf24}a {\kf38}small {\kf57}project...
```

VTT supports word-level timestamps in the same spirit:

```text
00:00:02.400 --> 00:00:06.800
<00:00:02.400><c>Let's</c> <00:00:02.820><c>set</c> <00:00:03.130><c>up</c>...
```

Generating accurate per-word timing requires knowing when the voice spoke each word in the
synthesised audio. Piper provides timing at the segment level, not the word level. Playback uses
**WhisperX** (a forced-alignment wrapper around OpenAI Whisper) to run against each synthesised
`.wav` file and produce word timestamps.

### Why WhisperX is opt-in

WhisperX pulls in PyTorch and a per-language alignment model. On macOS arm64, the first-run
download is approximately 1 GB:

| Component | Approximate size |
| --- | --- |
| `torch` (CPU) | ~500–700 MB |
| `whisperx` and dependencies | ~50–100 MB |
| MMS alignment model (English) | ~300–400 MB |

This is too large to impose on every `playback` user. Standard narrated video — the common case —
does not need word-level alignment. Karaoke captions are opt-in, installed separately from
the main setup.

### Installing WhisperX

```sh
npm run setup -- --karaoke
```

This runs `uv tool install whisperx` in an isolated environment alongside `piper-tts`. The MMS
alignment model downloads on first use and caches in `$XDG_CACHE_HOME/playback/` — later runs
are fast.

To verify the installation:

```sh
uv tool run whisperx --version
```

### Using karaoke captions

Pass `--karaoke` to `playback tape`:

```sh
playback tape <dir> --karaoke
```

This produces `.vtt` and `.ass` variants with word-level timing alongside the standard caption
files. The standard files remain unchanged — karaoke variants use a `.karaoke.vtt` and
`.karaoke.ass` suffix.

Most useful in the `--web` output, where the browser renders captions as an overlay and the
`::cue` CSS can style the highlighted word differently from the rest of the cue.
