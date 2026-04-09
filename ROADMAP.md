# Roadmap

Ideas and planned improvements. Not committed to any timeline, but worth
tracking. Pull requests welcome on any of these.

## Tape authoring

- [ ] Template library — common action patterns (install, test, run dev, git
      flow) as reusable partials
- [x] Auto-generate `PROMPT.md` from tape metadata — the CLI could scaffold it
      from `tape.yaml` + `meta.yaml` instead of hand-writing
- [ ] Automatic timing calculation — estimate `pause` values from command
      complexity rather than hand-tuning
- [ ] Preview / dry-run mode — show what the pipeline would produce without
      running VHS or TTS
- [ ] Watch mode — re-run the pipeline on tape file changes while iterating

## Audio & voice

- [ ] Voice picker in TUI — toggle voices per tape from `voices.yaml` via the
      metadata editor (`M` key) or a dedicated `v` key
- [ ] Voice catalogue browser — browse all available piper-tts voices from the
      [piper samples](https://rhasspy.github.io/piper-samples/), preview audio,
      download on demand
- [ ] Speech rate and pitch control per narration step
- [ ] Silence trimming — auto-detect and trim dead air in generated audio
- [ ] Batch piper synthesis — concatenate all narration segments into one call
      per voice to restore prosodic continuity (see `docs/VOICE.md`)
- [ ] Multi-locale tapes — `tape.{locale}.yaml` files share one terminal
      recording (`tape.yaml` as fallback); `meta.yaml` keeps a `locale` key for
      the default; voice selection moves into the locale-specific tape file

## Captions

- [ ] Colour theming — define a palette in config, apply consistently across
      all caption output
- [ ] Caption positioning rules — sensible defaults that avoid obscuring the
      prompt line
- [ ] Burn-in option — embed captions directly into the video as a fallback for
      platforms that strip sidecar files

## Output

- [x] MKV archival output — `--mkv` flag produces a single self-contained file
      with video, voiceover, and all caption tracks bundled; no new
      dependencies, ffmpeg handles it natively
- [ ] Thumbnail generation — first or nominated frame as a `.png` for embeds
- [ ] Configurable output directory per tape (set globally in config for now)

## TUI

- [ ] Waveform timeline view — zoom into the audio timeline to see WAV
      amplitude as a sparkline with narration words overlaid at their cue
      positions; WAV files are 22 kHz mono PCM (trivial to decode in Go),
      downsampled to terminal-column resolution
- [ ] Investigate [`libghostty-vt`](https://mitchellh.com/writing/libghostty-is-coming)
      for the terminal simulator — replace the hand-rolled `termsim.go` with a
      real terminal state machine for pixel-accurate parity with the VHS
      recording; depends on a stable release

## Storage

- [ ] Adopt [`adrg/xdg`](https://github.com/adrg/xdg) in the Go TUI — use XDG
      paths for TUI-specific config and cache; the TypeScript pipeline already
      uses XDG for voice models

## CLI polish

- [x] Styled CLI help — replace the plain `console.log` help text with
      `gum style` output, consistent with the setup scripts
- [ ] Progress output — replace bare status lines with `gum spin` or structured
      progress display

## Project & workflow

- [ ] End-to-end test — run the full pipeline against the example tape and
      verify captions sync with voiceover
- [ ] Integration tests for each runner (VHS, piper, ffmpeg) — unit tests are
      done; runner integration tests are outstanding
- [ ] Batch mode — process all tape files in a directory in one run
- [ ] GitHub Actions workflow — auto-generate videos on push to a release branch

## Web front-end

Architecture notes for a future web-based viewer:

- **One raw recording per tape** — the `.raw.mp4` is the constant across all
  voice variants; each voice produces its own audio tracks but shares the
  terminal recording
- **Runtime voice selection** — the web front-end would play `.raw.mp4` with
  the chosen voice track overlaid, rather than serving a pre-stitched video per
  voice
- **`voices.yaml` as the catalogue** — the same file that drives the pipeline
  populates the web UI voice picker
- **`narrationOffset`** — per-step audio offsets from `tape.yaml` determine
  when each segment plays relative to the video timeline
- **Caption sync** — `.vtt` files are already per-voice; the web player
  switches caption tracks alongside the audio

## Localisation

1. Multi-locale tapes — `tape.{locale}.yaml` files share one terminal
   recording (`tape.yaml` as the single-locale fallback); `meta.yaml` keeps
   a `locale` key for the default; voice selection moves into the
   locale-specific tape file
2. Longest-locale VHS timing — synthesise all locales first, then use the
   locale with the longest total audio to drive the VHS recording; shorter
      locales mix against that timeline and end when their audio ends
3. Multi-locale MKV bundle — `--mkv` extended to bundle one video track with
   N audio tracks and N subtitle tracks, each tagged with a BCP 47 language
   code; desktop players (VLC, mpv) handle track selection at playback time

## Stretch goals

- [ ] VS Code extension — tape authoring with syntax highlighting, inline
      preview, and run commands from the editor
