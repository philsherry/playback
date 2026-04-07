package editor

import (
	"bytes"
	"strings"
	"testing"

	"github.com/philsherry/playback/tui/tape"
)

// --- WriteReport ---

func TestWriteReport_IncludesTitle(t *testing.T) {
	var buf bytes.Buffer
	data := tape.TapeData{
		Dir: "/tmp/test",
		Tape: tape.Tape{
			Title:  "Test Episode",
			Output: "test/output",
			Steps:  []tape.Step{{Action: "run"}},
		},
	}
	WriteReport(&buf, data, tape.BuildStatus{})

	if !strings.Contains(buf.String(), "Test Episode") {
		t.Error("report should contain the tape title")
	}
}

func TestWriteReport_IncludesOutputPath(t *testing.T) {
	var buf bytes.Buffer
	data := tape.TapeData{
		Dir: "/tmp/test",
		Tape: tape.Tape{
			Title:  "X",
			Output: "s1-test/01-example",
			Steps:  []tape.Step{{Action: "run"}},
		},
	}
	WriteReport(&buf, data, tape.BuildStatus{})

	if !strings.Contains(buf.String(), "s1-test/01-example") {
		t.Error("report should contain the output path")
	}
}

func TestWriteReport_ShowsBuildStatus_Built(t *testing.T) {
	var buf bytes.Buffer
	data := tape.TapeData{
		Dir:  "/tmp/test",
		Tape: tape.Tape{Title: "X", Output: "test", Steps: []tape.Step{{Action: "run"}}},
	}
	status := tape.BuildStatus{HasMP4: true, MP4Path: "/output/test.mp4"}
	WriteReport(&buf, data, status)

	if !strings.Contains(buf.String(), "Built") {
		t.Error("report should show 'Built' status")
	}
	if !strings.Contains(buf.String(), "/output/test.mp4") {
		t.Error("report should show the .mp4 path")
	}
}

func TestWriteReport_ShowsBuildStatus_NotBuilt(t *testing.T) {
	var buf bytes.Buffer
	data := tape.TapeData{
		Dir:  "/tmp/test",
		Tape: tape.Tape{Title: "X", Output: "test", Steps: []tape.Step{{Action: "run"}}},
	}
	WriteReport(&buf, data, tape.BuildStatus{})

	if !strings.Contains(buf.String(), "Not built") {
		t.Error("report should show 'Not built' status")
	}
}

func TestWriteReport_ShowsBuildStatus_Partial(t *testing.T) {
	var buf bytes.Buffer
	data := tape.TapeData{
		Dir:  "/tmp/test",
		Tape: tape.Tape{Title: "X", Output: "test", Steps: []tape.Step{{Action: "run"}}},
	}
	status := tape.BuildStatus{HasRawMP4: true}
	WriteReport(&buf, data, status)

	if !strings.Contains(buf.String(), "Partial") {
		t.Error("report should show 'Partial' status")
	}
}

func TestWriteReport_ListsAllSteps(t *testing.T) {
	var buf bytes.Buffer
	data := tape.TapeData{
		Dir: "/tmp/test",
		Tape: tape.Tape{
			Title:  "X",
			Output: "test",
			Steps: []tape.Step{
				{Action: "type", Command: "echo hello"},
				{Action: "run"},
				{Action: "comment", Narration: "Explaining things."},
			},
		},
	}
	WriteReport(&buf, data, tape.BuildStatus{})

	output := buf.String()
	if !strings.Contains(output, "type") {
		t.Error("report should list 'type' step")
	}
	if !strings.Contains(output, "run") {
		t.Error("report should list 'run' step")
	}
	if !strings.Contains(output, "comment") {
		t.Error("report should list 'comment' step")
	}
	if !strings.Contains(output, "3 steps") {
		t.Error("report should show total step count")
	}
}

func TestWriteReport_ShowsStepTiming(t *testing.T) {
	var buf bytes.Buffer
	pause := 2.0
	data := tape.TapeData{
		Dir: "/tmp/test",
		Tape: tape.Tape{
			Title:  "X",
			Output: "test",
			Steps: []tape.Step{
				{Action: "run", Pause: &pause},
			},
		},
	}
	WriteReport(&buf, data, tape.BuildStatus{})

	output := buf.String()
	// Should show start time, duration, and pause.
	if !strings.Contains(output, "0.00s") {
		t.Error("report should show start time")
	}
	if !strings.Contains(output, "2.00s") {
		t.Error("report should show pause value")
	}
}

func TestWriteReport_ShowsNarrationCount(t *testing.T) {
	var buf bytes.Buffer
	data := tape.TapeData{
		Dir: "/tmp/test",
		Tape: tape.Tape{
			Title:  "X",
			Output: "test",
			Steps: []tape.Step{
				{Action: "type", Command: "ls", Narration: "List files."},
				{Action: "run"},
				{Action: "comment", Narration: "Done."},
			},
		},
	}
	WriteReport(&buf, data, tape.BuildStatus{})

	if !strings.Contains(buf.String(), "2 with narration") {
		t.Error("report should count steps with narration")
	}
}

func TestWriteReport_ShowsFullNarrationText(t *testing.T) {
	var buf bytes.Buffer
	longNarration := "This is a very long narration that would be truncated in the table but should appear in full below."
	data := tape.TapeData{
		Dir: "/tmp/test",
		Tape: tape.Tape{
			Title:  "X",
			Output: "test",
			Steps:  []tape.Step{{Action: "comment", Narration: longNarration}},
		},
	}
	WriteReport(&buf, data, tape.BuildStatus{})

	output := buf.String()
	if !strings.Contains(output, "Full narration text") {
		t.Error("report should have a full narration section")
	}
	if !strings.Contains(output, longNarration) {
		t.Error("report should include the complete narration text")
	}
}

func TestWriteReport_DetectsOverlaps(t *testing.T) {
	var buf bytes.Buffer
	shortPause := 0.1
	data := tape.TapeData{
		Dir: "/tmp/test",
		Tape: tape.Tape{
			Title:  "X",
			Output: "test",
			Steps: []tape.Step{
				{Action: "comment", Narration: "Short.", Pause: &shortPause},
				{Action: "comment", Narration: "Also short.", Pause: &shortPause},
			},
		},
	}
	WriteReport(&buf, data, tape.BuildStatus{})

	output := buf.String()
	if !strings.Contains(output, "Steps:") {
		t.Error("report should contain the steps section")
	}
}

func TestWriteReport_NoOverlaps(t *testing.T) {
	var buf bytes.Buffer
	longPause := 10.0
	data := tape.TapeData{
		Dir: "/tmp/test",
		Tape: tape.Tape{
			Title:  "X",
			Output: "test",
			Steps: []tape.Step{
				{Action: "comment", Narration: "First.", Pause: &longPause},
				{Action: "comment", Narration: "Second.", Pause: &longPause},
			},
		},
	}
	WriteReport(&buf, data, tape.BuildStatus{})

	if !strings.Contains(buf.String(), "No overlapping narration") {
		t.Error("report should confirm no overlaps when there are none")
	}
}

func TestWriteReport_ShowsVoices(t *testing.T) {
	var buf bytes.Buffer
	data := tape.TapeData{
		Dir:  "/tmp/test",
		Tape: tape.Tape{Title: "X", Output: "test", Steps: []tape.Step{{Action: "run"}}},
		Meta: tape.Meta{Voices: []string{"northern_english_male", "southern_english_female"}},
	}
	WriteReport(&buf, data, tape.BuildStatus{})

	output := buf.String()
	if !strings.Contains(output, "northern_english_male") {
		t.Error("report should list configured voices")
	}
	if !strings.Contains(output, "southern_english_female") {
		t.Error("report should list all configured voices")
	}
}

func TestWriteReport_ShowsDefaultVoice(t *testing.T) {
	var buf bytes.Buffer
	data := tape.TapeData{
		Dir:  "/tmp/test",
		Tape: tape.Tape{Title: "X", Output: "test", Steps: []tape.Step{{Action: "run"}}},
	}
	WriteReport(&buf, data, tape.BuildStatus{})

	if !strings.Contains(buf.String(), "northern_english_male (default)") {
		t.Error("report should show default voice when none configured")
	}
}
