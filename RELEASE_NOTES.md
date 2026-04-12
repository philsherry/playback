# Release notes — v1.2.1

## Poster extraction crash fix

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
