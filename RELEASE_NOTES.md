# Release notes — v1.4.x

## Full VHS override coverage and per-voice synthesis tuning

Playback 1.4.1 fills two extensibility gaps needed by consumer projects that
use playback as a library.

### All VHS constants are now overridable per tape

The `vhs` block in `meta.yaml` covered five recording constants.
Every remaining hardcoded VHS constant now has an override:

```yaml
vhs:
  borderRadius: 0
  fontFamily: "ProggyClean TT NF"
  fontSize: 14
  framerate: 60
  height: 480
  margin: 0
  marginFill: "#1a1b26"
  shell: bash
  theme: '{"background":"#1a1b26",...}'
  typingSpeed: 50ms
  width: 720
  windowBar: Hidden
```

All fields remain optional — omit any to keep the project default. This is
the complete set; there are no remaining hardcoded VHS constants that a tape
cannot override.

### Per-voice synthesis tuning in `voices.yaml`

Consumer projects can now tune piper synthesis parameters directly in their
own `voices.yaml`, without modifying the playback package or adding entries to
the internal `VOICE_CONFIG` table:

```yaml
voices:
  tars:
    gender: male
    lengthScale: 0.9    # faster — TARS: clipped, utilitarian
    locale: en-GB
    model: en_GB-alan-medium
    noiseScale: 0.05    # locks speaker identity across sentences
    noiseW: 0.4
    quality: medium
    url: en/en_GB/alan/medium
```

The three VITS parameters (`lengthScale`, `noiseScale`, `noiseW`) are all
optional. Set only what you need — unset fields fall back to the built-in
value for that voice, or to the package default if the voice has no built-in
entry. The priority chain is:

1. `voices.yaml` entry fields (highest — consumer project wins)
2. Built-in `VOICE_CONFIG` table
3. `DEFAULT_SYNTH_CONFIG` (`lengthScale: 1.0`, `noiseScale: 0.1`, `noiseW: 0.6`)
