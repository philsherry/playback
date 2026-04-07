// Package main is the entry point for the playback TUI — a post-production
// timing editor for adjusting narration placement in playback tape files.
//
// The TUI loads a tape directory (containing tape.yaml and meta.yaml),
// displays the video alongside an audio timeline, and lets the user
// nudge narration clips to eliminate overlaps. Edits are saved back
// to tape.yaml as adjusted pause values.
package main

func main() {
	Execute()
}
