package tape

import (
	"os"
	"path/filepath"
	"testing"
)

// writeTempFile creates a file inside dir with the given name and content.
// It calls t.Fatal on error so tests can use it without checking err.
func writeTempFile(t *testing.T, dir, name, content string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("failed to write %s: %v", name, err)
	}
	return path
}

// --- Load ---

func TestLoad_ValidTapeAndMeta(t *testing.T) {
	dir := t.TempDir()
	writeTempFile(t, dir, "tape.yaml", `
title: Test Tape
output: test/output
steps:
  - action: type
    command: echo hello
    narration: Say hello.
    pause: 2
  - action: run
    pause: 1
  - action: comment
    narration: That is all.
`)
	writeTempFile(t, dir, "meta.yaml", `
title: Test Tape
description: A test tape for unit tests.
locale: en-GB
series: testing
episode: 1
version: "1.0.0"
tags:
  - test
  - unit
voices:
  - northern_english_male
  - southern_english_female
poster: 2
`)

	data, err := Load(dir)
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	// Verify tape fields.
	if data.Tape.Title != "Test Tape" {
		t.Errorf("Tape.Title = %q, want %q", data.Tape.Title, "Test Tape")
	}
	if data.Tape.Output != "test/output" {
		t.Errorf("Tape.Output = %q, want %q", data.Tape.Output, "test/output")
	}
	if len(data.Tape.Steps) != 3 {
		t.Fatalf("len(Steps) = %d, want 3", len(data.Tape.Steps))
	}

	// Verify step details.
	step0 := data.Tape.Steps[0]
	if step0.Action != "type" {
		t.Errorf("Steps[0].Action = %q, want %q", step0.Action, "type")
	}
	if step0.Command != "echo hello" {
		t.Errorf("Steps[0].Command = %q, want %q", step0.Command, "echo hello")
	}
	if step0.Narration != "Say hello." {
		t.Errorf("Steps[0].Narration = %q, want %q", step0.Narration, "Say hello.")
	}
	if step0.Pause == nil || *step0.Pause != 2 {
		t.Errorf("Steps[0].Pause = %v, want 2", step0.Pause)
	}

	step1 := data.Tape.Steps[1]
	if step1.Action != "run" {
		t.Errorf("Steps[1].Action = %q, want %q", step1.Action, "run")
	}
	if step1.Narration != "" {
		t.Errorf("Steps[1].Narration = %q, want empty", step1.Narration)
	}

	step2 := data.Tape.Steps[2]
	if step2.Action != "comment" {
		t.Errorf("Steps[2].Action = %q, want %q", step2.Action, "comment")
	}
	if step2.Pause != nil {
		t.Errorf("Steps[2].Pause = %v, want nil", *step2.Pause)
	}

	// Verify meta fields.
	if data.Meta.Title != "Test Tape" {
		t.Errorf("Meta.Title = %q, want %q", data.Meta.Title, "Test Tape")
	}
	if data.Meta.Description != "A test tape for unit tests." {
		t.Errorf(
			"Meta.Description = %q, want %q",
			data.Meta.Description,
			"A test tape for unit tests.",
		)
	}
	if data.Meta.Locale != "en-GB" {
		t.Errorf("Meta.Locale = %q, want %q", data.Meta.Locale, "en-GB")
	}
	if data.Meta.Series != "testing" {
		t.Errorf("Meta.Series = %q, want %q", data.Meta.Series, "testing")
	}
	if data.Meta.Episode == nil || *data.Meta.Episode != 1 {
		t.Errorf("Meta.Episode = %v, want 1", data.Meta.Episode)
	}
	if data.Meta.Version != "1.0.0" {
		t.Errorf("Meta.Version = %q, want %q", data.Meta.Version, "1.0.0")
	}
	if len(data.Meta.Tags) != 2 {
		t.Fatalf("len(Meta.Tags) = %d, want 2", len(data.Meta.Tags))
	}
	if data.Meta.Tags[0] != "test" || data.Meta.Tags[1] != "unit" {
		t.Errorf("Meta.Tags = %v, want [test unit]", data.Meta.Tags)
	}
	if len(data.Meta.Voices) != 2 {
		t.Fatalf("len(Meta.Voices) = %d, want 2", len(data.Meta.Voices))
	}
	if data.Meta.Poster == nil || *data.Meta.Poster != 2 {
		t.Errorf("Meta.Poster = %v, want 2", data.Meta.Poster)
	}

	// Verify Dir is the cleaned directory path.
	if data.Dir != dir {
		t.Errorf("Dir = %q, want %q", data.Dir, dir)
	}
}

func TestLoad_TapeOnly_MetaOptional(t *testing.T) {
	dir := t.TempDir()
	writeTempFile(t, dir, "tape.yaml", `
title: Minimal
output: minimal
steps:
  - action: comment
    narration: Just this.
`)

	data, err := Load(dir)
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	// Meta should be zero-value when meta.yaml is absent.
	if data.Meta.Title != "" {
		t.Errorf("Meta.Title = %q, want empty (no meta.yaml)", data.Meta.Title)
	}
	if data.Meta.Voices != nil {
		t.Errorf("Meta.Voices = %v, want nil", data.Meta.Voices)
	}

	// Tape should still load correctly.
	if data.Tape.Title != "Minimal" {
		t.Errorf("Tape.Title = %q, want %q", data.Tape.Title, "Minimal")
	}
}

func TestLoad_FilePathResolvesToParentDir(t *testing.T) {
	dir := t.TempDir()
	tapePath := writeTempFile(t, dir, "tape.yaml", `
title: Via File
output: via-file
steps:
  - action: run
`)

	// Pass the tape.yaml file path directly, not the directory.
	data, err := Load(tapePath)
	if err != nil {
		t.Fatalf("Load(%q) returned error: %v", tapePath, err)
	}

	if data.Tape.Title != "Via File" {
		t.Errorf("Tape.Title = %q, want %q", data.Tape.Title, "Via File")
	}
	if data.Dir != dir {
		t.Errorf("Dir = %q, want %q (parent of file path)", data.Dir, dir)
	}
}

func TestLoad_MissingTapeYaml(t *testing.T) {
	dir := t.TempDir()

	_, err := Load(dir)
	if err == nil {
		t.Fatal("Load() should return error for missing tape.yaml")
	}
}

func TestLoad_EmptySteps(t *testing.T) {
	dir := t.TempDir()
	writeTempFile(t, dir, "tape.yaml", `
title: Empty
output: empty
steps: []
`)

	_, err := Load(dir)
	if err == nil {
		t.Fatal("Load() should return error for tape.yaml with no steps")
	}
}

func TestLoad_InvalidTapeYaml(t *testing.T) {
	dir := t.TempDir()
	writeTempFile(t, dir, "tape.yaml", `{{invalid yaml`)

	_, err := Load(dir)
	if err == nil {
		t.Fatal("Load() should return error for invalid YAML")
	}
}

func TestLoad_InvalidMetaYaml_IgnoredGracefully(t *testing.T) {
	dir := t.TempDir()
	writeTempFile(t, dir, "tape.yaml", `
title: Good Tape
output: good
steps:
  - action: run
`)
	writeTempFile(t, dir, "meta.yaml", `{{invalid yaml`)

	// Should succeed — invalid meta.yaml is silently ignored.
	data, err := Load(dir)
	if err != nil {
		t.Fatalf("Load() returned error: %v (invalid meta.yaml should be ignored)", err)
	}
	if data.Tape.Title != "Good Tape" {
		t.Errorf("Tape.Title = %q, want %q", data.Tape.Title, "Good Tape")
	}
}

func TestLoad_NonexistentDirectory(t *testing.T) {
	_, err := Load("/nonexistent/path/to/tape")
	if err == nil {
		t.Fatal("Load() should return error for nonexistent path")
	}
}

func TestLoad_PauseZeroVsAbsent(t *testing.T) {
	dir := t.TempDir()
	writeTempFile(t, dir, "tape.yaml", `
title: Pause Test
output: pause
steps:
  - action: run
    pause: 0
  - action: run
`)

	data, err := Load(dir)
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	// Explicit pause: 0 should be a non-nil pointer to 0.
	step0 := data.Tape.Steps[0]
	if step0.Pause == nil {
		t.Fatal("Steps[0].Pause should be non-nil for explicit pause: 0")
	}
	if *step0.Pause != 0 {
		t.Errorf("Steps[0].Pause = %f, want 0", *step0.Pause)
	}

	// Absent pause should be nil (will use DefaultPause at runtime).
	step1 := data.Tape.Steps[1]
	if step1.Pause != nil {
		t.Errorf("Steps[1].Pause = %v, want nil (absent)", *step1.Pause)
	}
}

// --- Step struct YAML edge cases ---

func TestLoad_TypeStepWithoutCommand(t *testing.T) {
	dir := t.TempDir()
	writeTempFile(t, dir, "tape.yaml", `
title: No Command
output: no-cmd
steps:
  - action: type
    narration: Oops, forgot the command.
`)

	data, err := Load(dir)
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	// A type step without a command is valid YAML — it's just empty.
	// Validation of step semantics is a separate concern.
	if data.Tape.Steps[0].Command != "" {
		t.Errorf("Steps[0].Command = %q, want empty", data.Tape.Steps[0].Command)
	}
}

func TestLoad_MetaOptionalFields(t *testing.T) {
	dir := t.TempDir()
	writeTempFile(t, dir, "tape.yaml", `
title: X
output: x
steps:
  - action: run
`)
	writeTempFile(t, dir, "meta.yaml", `
title: Just a title
`)

	data, err := Load(dir)
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	// All optional fields should be zero-values.
	if data.Meta.Description != "" {
		t.Errorf("Meta.Description = %q, want empty", data.Meta.Description)
	}
	if data.Meta.Poster != nil {
		t.Errorf("Meta.Poster = %v, want nil", data.Meta.Poster)
	}
	if data.Meta.Episode != nil {
		t.Errorf("Meta.Episode = %v, want nil", data.Meta.Episode)
	}
	if data.Meta.Tags != nil {
		t.Errorf("Meta.Tags = %v, want nil", data.Meta.Tags)
	}
	if data.Meta.Voices != nil {
		t.Errorf("Meta.Voices = %v, want nil", data.Meta.Voices)
	}
}
