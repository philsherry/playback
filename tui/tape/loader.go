// Package tape handles loading and validating playback tape files.
//
// A tape directory contains two YAML files that define a terminal recording:
//   - tape.yaml (required): the recording script — a sequence of steps
//     (type, run, comment) with optional narration and pause values.
//   - meta.yaml (optional): episode metadata — title, description, voice
//     selection, series/episode numbering, tags, and poster frame.
//
// The loader reads both files, unmarshals them into Go structs, and returns
// a TapeData bundle that the rest of the TUI operates on.
package tape

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// Step represents a single tape step. There are four action types:
//   - "type": types a shell command into the terminal and presses Enter.
//   - "key": sends a keystroke without pressing Enter (for interactive TUIs).
//   - "run": waits for the previous command to complete.
//   - "comment": pure narration over the current screen, no terminal input.
//
// Pause is a pointer so we can distinguish "not set" (nil, uses DefaultPause)
// from an explicit zero value.
type Step struct {
	Action          string   `yaml:"action"`
	Command         string   `yaml:"command,omitempty"`
	Commands        []string `yaml:"commands,omitempty"`
	Narration       string   `yaml:"narration,omitempty"`
	Pause           *float64 `yaml:"pause,omitempty"`
	NarrationOffset *float64 `yaml:"narrationOffset,omitempty"`
	Title           string   `yaml:"title,omitempty"`
}

// Tape represents a parsed tape.yaml document. Title is shown as a VHS
// banner, Output is the subdirectory path for generated artefacts, and
// Steps is the ordered sequence of recording actions.
type Tape struct {
	Title  string `yaml:"title"`
	Output string `yaml:"output"`
	Steps  []Step `yaml:"steps"`
}

// Meta represents a parsed meta.yaml document. All fields except Title
// are optional. Voices lists which piper-tts voice models to synthesise
// with — one output video is produced per voice.
type Meta struct {
	Title       string   `yaml:"title"`
	Description string   `yaml:"description,omitempty"`
	Locale      string   `yaml:"locale,omitempty"`
	Poster      *int     `yaml:"poster,omitempty"`
	Episode     *int     `yaml:"episode,omitempty"`
	Series      string   `yaml:"series,omitempty"`
	Tags        []string `yaml:"tags,omitempty"`
	Version     string   `yaml:"version,omitempty"`
	Voices      []string `yaml:"voices,omitempty"`
}

// TapeData bundles the loaded tape and its metadata, along with the
// absolute path to the source directory.
type TapeData struct {
	Dir  string
	Tape Tape
	Meta Meta
}

// Load reads tape.yaml and meta.yaml from the given directory path.
// If the path points to a file rather than a directory, the parent
// directory is used instead (so passing "tapes/foo/tape.yaml" works).
// meta.yaml is optional — a missing or unparseable meta file is silently
// ignored, since metadata has sensible defaults elsewhere in the pipeline.
func Load(dir string) (TapeData, error) {
	dir = filepath.Clean(dir)

	// Allow the user to pass a file path; we'll use its parent directory.
	info, err := os.Stat(dir)
	if err != nil {
		return TapeData{}, fmt.Errorf("cannot access %s: %w", dir, err)
	}
	if !info.IsDir() {
		dir = filepath.Dir(dir)
	}

	// tape.yaml is required — fail early if it's missing or invalid.
	t, err := loadTape(filepath.Join(dir, "tape.yaml"))
	if err != nil {
		return TapeData{}, err
	}

	// meta.yaml is optional — ignore errors (missing file, parse failure).
	m, _ := loadMeta(filepath.Join(dir, "meta.yaml"))

	return TapeData{
		Dir:  dir,
		Tape: t,
		Meta: m,
	}, nil
}

// loadTape reads and validates a tape.yaml file. Returns an error if the
// file is missing, contains invalid YAML, or has no steps defined.
func loadTape(path string) (Tape, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Tape{}, fmt.Errorf("cannot read tape.yaml: %w", err)
	}

	var t Tape
	if err := yaml.Unmarshal(data, &t); err != nil {
		return Tape{}, fmt.Errorf("invalid tape.yaml: %w", err)
	}

	if len(t.Steps) == 0 {
		return Tape{}, fmt.Errorf("tape.yaml has no steps")
	}

	return t, nil
}

// loadMeta reads and validates a meta.yaml file. Returns a zero-value Meta
// and an error if the file is missing or invalid — callers are expected to
// treat errors as non-fatal since metadata is optional.
func loadMeta(path string) (Meta, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Meta{}, fmt.Errorf("cannot read meta.yaml: %w", err)
	}

	var m Meta
	if err := yaml.Unmarshal(data, &m); err != nil {
		return Meta{}, fmt.Errorf("invalid meta.yaml: %w", err)
	}

	return m, nil
}
