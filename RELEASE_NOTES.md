# Release notes — v1.0.6

## `--tapes-dir` flag for `playlist:build`

Point `playlist:build` at any tape directory without changing `playback.config.ts`:

```sh
npm run playlist:build -- --tapes-dir /path/to/tapes
npm run playlist:build -- --tapes-dir /path/to/tapes --web
```

Accepts absolute paths, so tapes that live in a separate repo are now first-class
targets. Other forwarded flags (`--web`, `--vhs-only`, etc.) continue to work
alongside it.

---

## Web output images

`--web` now produces two poster images per episode instead of one:

- `*.poster.png` — full-resolution frame extracted from the video (renamed from `*.png`)
- `*.card.png` — 50%-scaled version for use as a thumbnail or embed image

`manifest.json` includes both. A third field, `og`, holds `null` until a generation
strategy lands — it will carry a 1200×630 Open Graph image.

---

## ffmpeg warning fixes

Three recurring ffmpeg warnings are now suppressed:

**`Too many bits 8192 > 6144 per frame`** — Piper outputs mono WAV at 22050 Hz. At
that sample rate the AAC encoder computed ~8192 bits/frame, exceeding the 6144
per-channel limit. Adding `-ar 44100` resamples before encoding, dropping the
per-frame count to ~2973.

**`image sequence pattern`** — `generateCard` was missing `-frames:v 1 -update 1`,
which `extractPoster` already had. ffmpeg requires these flags when writing a
single image to a plain `.png` path.

**`Guessed Channel Layout: mono`** — ffmpeg was guessing the channel layout of each
Piper WAV input. Explicit `-channel_layout mono` per-input provides the answer
upfront.

**GIF palette `Duped color` / `255(+1)`** — `palettegen` was reserving one palette
slot for transparency (terminal video has none) and sampling all pixels including
large static background regions. `reserve_transparent=0` reclaims the slot;
`stats_mode=diff` limits sampling to pixels that actually change between frames,
which suits terminal recordings and eliminates the duplicate entries. `paletteuse`
now uses `dither=bayer:bayer_scale=5:diff_mode=rectangle` for crisper text
rendering. The filtergraph separator between the two parallel chains after `split`
was also corrected from `,` to `;`.
