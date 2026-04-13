# TL;DR

## Installing requirements

This primarily runs on macOS, but should work fine on Linux using the same `brew` steps. Windows users will want to use WSL.

We assume an updated [Homebrew](https://brew.sh) is in working order.

```sh
brew install asdf   ## We install one package manager with another.
asdf install        ## Installs the things from `.tool-versions`
npm install         ## Installs the Node.js dependencies.
npm run setup       ## Sets us up the bomb.
```

## What Playback is

This comes in two parts:

1. `playback-cli`
2. `playback-tui`

You can write the script for what you want to run in the CLI: `tape.yaml`

Add some metadata for it: `meta.yaml`

You run this using `playback-cli`.

## `playback-cli`

Run the `playback-cli` command to build the TUI demo.

```sh
npm run playback:tape -- studio/demo/tui --web --mkv
```

That’s the Playback CLI.

If it seems a bit out of sync, use the `playback-tui`.

## `playback-tui`

Run the `playback-cli` command to edit the TUI demo.

```sh
npm run playback:edit -- studio/demo/tui
```

That’s the Playback TUI.

——END OF LINE
