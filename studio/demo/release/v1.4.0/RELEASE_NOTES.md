# Release notes — v1.4.0

## Multi-speaker piper voices

Playback 1.4.0 adds optional `speaker` support to the piper voice pipeline.
Some piper models pack multiple distinct characters into a single `.onnx` file.
You can now select the one you want by adding a `speaker` field to your voice entry.

### One model, multiple characters

The `en_GB-aru-medium` model ships with 12 speakers from the Liverpool ARU Speech
Corpus — each a distinct voice. Until now, Playback had no way to select between
them: piper would always use speaker zero.

Now you can name each speaker as a separate voice entry in your `voices.yaml`,
pointing at the same model file with a different `speaker` value:

```yaml
voices:
  aru_09:
    gender: female
    locale: en-GB
    model: en_GB-aru-medium
    quality: medium
    url: en/en_GB/aru/medium
    speaker: 4

  aru_11:
    gender: female
    locale: en-GB
    model: en_GB-aru-medium
    quality: medium
    url: en/en_GB/aru/medium
    speaker: 6
```

Both entries share the same model file. Playback downloads it once.
Each entry is a distinct voice you can assign to a tape.

### Setting up a multi-speaker voice

Define your speaker voices in a project-local `voices.yaml` (the one that stays
out of git), then reference one of them in `meta.yaml` as you would any voice:

```yaml
voices:
  - aru_09
```

The selected character narrates the whole tape. Run `npm run setup -- --local`
to download the model file. Playback passes `--speaker 4` (or whichever ID you
set) to piper automatically.

### No changes required for existing voices

The `speaker` field is optional. Single-speaker voices continue to work as before —
no field needed, no migration required. If a voice has no entry in
the internal tuning table, Playback now applies sensible defaults rather than
crashing, so consumer-defined voices work without any changes to this package.
