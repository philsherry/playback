package tape

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// --- formatPause ---

func TestFormatPause_Integer(t *testing.T) {
	if got := formatPause(2.0); got != "2" {
		t.Errorf("formatPause(2.0) = %q, want %q", got, "2")
	}
}

func TestFormatPause_Zero(t *testing.T) {
	if got := formatPause(0.0); got != "0" {
		t.Errorf("formatPause(0.0) = %q, want %q", got, "0")
	}
}

func TestFormatPause_Quarter(t *testing.T) {
	if got := formatPause(0.25); got != "0.25" {
		t.Errorf("formatPause(0.25) = %q, want %q", got, "0.25")
	}
}

func TestFormatPause_Half(t *testing.T) {
	if got := formatPause(0.5); got != "0.5" {
		t.Errorf("formatPause(0.5) = %q, want %q", got, "0.5")
	}
}

func TestFormatPause_ThreeDecimals(t *testing.T) {
	if got := formatPause(1.125); got != "1.125" {
		t.Errorf("formatPause(1.125) = %q, want %q", got, "1.125")
	}
}

func TestFormatPause_LargeInteger(t *testing.T) {
	if got := formatPause(10.0); got != "10" {
		t.Errorf("formatPause(10.0) = %q, want %q", got, "10")
	}
}

// --- updateStepFields ---

func TestUpdatePauseLines_ReplacesExistingPause(t *testing.T) {
	lines := strings.Split(`---
title: Test
output: test
steps:
  - action: type
    command: echo hello
    pause: 2`, "\n")

	newPause := 3.5
	steps := []Step{{Action: "type", Command: "echo hello", Pause: &newPause}}

	result := updateStepFields(lines, steps)
	output := strings.Join(result, "\n")

	if !strings.Contains(output, "pause: 3.5") {
		t.Errorf("should replace pause with 3.5, got:\n%s", output)
	}
	if strings.Contains(output, "pause: 2") {
		t.Error("should not contain old pause value")
	}
}

func TestUpdatePauseLines_PreservesIndentation(t *testing.T) {
	lines := strings.Split(`steps:
  - action: run
    pause: 1`, "\n")

	newPause := 2.25
	steps := []Step{{Action: "run", Pause: &newPause}}

	result := updateStepFields(lines, steps)

	for _, line := range result {
		if strings.Contains(line, "pause: 2.25") {
			indent := leadingWhitespace(line)
			if indent != "    " {
				t.Errorf("pause line indent = %q, want 4 spaces", indent)
			}
			return
		}
	}
	t.Error("pause: 2.25 not found in output")
}

func TestUpdatePauseLines_InsertsNewPause(t *testing.T) {
	lines := strings.Split(`steps:
  - action: run

  - action: type
    command: ls`, "\n")

	pause1 := 1.5
	pause2 := 2.0
	steps := []Step{
		{Action: "run", Pause: &pause1},
		{Action: "type", Command: "ls", Pause: &pause2},
	}

	result := updateStepFields(lines, steps)
	output := strings.Join(result, "\n")

	if !strings.Contains(output, "pause: 1.5") {
		t.Errorf("should insert pause: 1.5 for step 1, got:\n%s", output)
	}
	if !strings.Contains(output, "pause: 2") {
		t.Errorf("should insert pause: 2 for step 2, got:\n%s", output)
	}
}

func TestUpdatePauseLines_PreservesBlankLines(t *testing.T) {
	input := `---
title: Test
output: test
steps:
  - action: type
    command: echo hello
    pause: 2

  - action: run
    pause: 1`

	lines := strings.Split(input, "\n")
	pause1 := 2.0
	pause2 := 1.0
	steps := []Step{
		{Action: "type", Command: "echo hello", Pause: &pause1},
		{Action: "run", Pause: &pause2},
	}

	result := updateStepFields(lines, steps)
	output := strings.Join(result, "\n")

	// Should preserve the blank line between steps.
	if !strings.Contains(output, "\n\n") {
		t.Error("should preserve blank lines between steps")
	}
}

func TestUpdatePauseLines_PreservesFoldedScalars(t *testing.T) {
	input := `steps:
  - action: run
    narration: >
      This is a long narration
      that spans multiple lines.
    pause: 1`

	lines := strings.Split(input, "\n")
	newPause := 2.5
	steps := []Step{
		{
			Action:    "run",
			Narration: "This is a long narration that spans multiple lines.",
			Pause:     &newPause,
		},
	}

	result := updateStepFields(lines, steps)
	output := strings.Join(result, "\n")

	// Folded scalar should be preserved.
	if !strings.Contains(output, "narration: >") {
		t.Error("should preserve folded scalar style")
	}
	if !strings.Contains(output, "pause: 2.5") {
		t.Errorf("should update pause to 2.5, got:\n%s", output)
	}
}

func TestUpdatePauseLines_PreservesDocumentStartMarker(t *testing.T) {
	input := `---
title: Test
output: test
steps:
  - action: run
    pause: 1`

	lines := strings.Split(input, "\n")
	newPause := 1.0
	steps := []Step{{Action: "run", Pause: &newPause}}

	result := updateStepFields(lines, steps)
	output := strings.Join(result, "\n")

	if !strings.HasPrefix(output, "---") {
		t.Error("should preserve --- document start marker")
	}
}

func TestUpdatePauseLines_NilPauseLeavesOriginal(t *testing.T) {
	input := `steps:
  - action: run
    pause: 3`

	lines := strings.Split(input, "\n")
	steps := []Step{{Action: "run"}} // nil pause

	result := updateStepFields(lines, steps)
	output := strings.Join(result, "\n")

	if !strings.Contains(output, "pause: 3") {
		t.Error("nil pause should leave the original value unchanged")
	}
}

func TestUpdatePauseLines_MultipleStepsPartialUpdate(t *testing.T) {
	input := `steps:
  - action: type
    command: echo a
    pause: 1
  - action: run
    pause: 2
  - action: comment
    narration: Done.`

	lines := strings.Split(input, "\n")
	newPause := 5.0
	steps := []Step{
		{Action: "type", Command: "echo a"},     // nil — keep original
		{Action: "run", Pause: &newPause},       // update to 5
		{Action: "comment", Narration: "Done."}, // nil, no original — no change
	}

	result := updateStepFields(lines, steps)
	output := strings.Join(result, "\n")

	if !strings.Contains(output, "pause: 1") {
		t.Error("step 1 should keep original pause: 1")
	}
	if !strings.Contains(output, "pause: 5") {
		t.Error("step 2 should be updated to pause: 5")
	}
}

func TestUpdatePauseLines_IntegerFormat(t *testing.T) {
	lines := strings.Split(`steps:
  - action: run
    pause: 1.5`, "\n")

	newPause := 3.0
	steps := []Step{{Action: "run", Pause: &newPause}}

	result := updateStepFields(lines, steps)
	output := strings.Join(result, "\n")

	if !strings.Contains(output, "pause: 3") {
		t.Errorf("should format integer pause without decimals, got:\n%s", output)
	}
	if strings.Contains(output, "pause: 3.0") {
		t.Error("should not have trailing .0")
	}
}

// --- WritePauses (integration) ---

func TestWritePauses_WritesFile(t *testing.T) {
	dir := t.TempDir()
	original := `---
title: Test
output: test
steps:
  - action: type
    command: echo hello
    pause: 2

  - action: run
    pause: 1
`
	if err := os.WriteFile(filepath.Join(dir, "tape.yaml"), []byte(original), 0o644); err != nil {
		t.Fatalf("failed to write tape.yaml: %v", err)
	}

	newPause := 4.25
	steps := []Step{
		{Action: "type", Command: "echo hello", Pause: &newPause},
		{Action: "run"},
	}

	if err := WritePauses(dir, steps); err != nil {
		t.Fatalf("WritePauses() returned error: %v", err)
	}

	// Read back and verify.
	data, err := os.ReadFile(filepath.Join(dir, "tape.yaml"))
	if err != nil {
		t.Fatalf("failed to read tape.yaml: %v", err)
	}

	output := string(data)
	if !strings.Contains(output, "pause: 4.25") {
		t.Errorf("file should contain updated pause, got:\n%s", output)
	}
	if !strings.Contains(output, "pause: 1") {
		t.Error("file should preserve unchanged pause")
	}
	if !strings.HasPrefix(output, "---") {
		t.Error("file should preserve --- document start marker")
	}
}

func TestWritePauses_MissingFile(t *testing.T) {
	err := WritePauses("/nonexistent/path", []Step{})
	if err == nil {
		t.Error("WritePauses should return error for missing file")
	}
}
