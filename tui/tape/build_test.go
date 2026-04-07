package tape

import (
	"os"
	"path/filepath"
	"testing"
)

// makeOutputDir creates a fake pipeline output directory with the given
// files. Returns the project root path.
func makeOutputDir(t *testing.T, tapeOutput string, files []string) string {
	t.Helper()
	projectRoot := t.TempDir()
	slug := filepath.Base(tapeOutput)
	outputDir := filepath.Join(projectRoot, DefaultOutputDir, tapeOutput)
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		t.Fatalf("failed to create output dir: %v", err)
	}
	for _, f := range files {
		path := filepath.Join(outputDir, slug+f)
		if err := os.WriteFile(path, []byte("fake"), 0o644); err != nil {
			t.Fatalf("failed to write %s: %v", f, err)
		}
	}
	return projectRoot
}

// --- CheckBuildStatus ---

func TestCheckBuildStatus_NoOutput(t *testing.T) {
	projectRoot := t.TempDir()
	tape := Tape{Output: "s1-test/01-example"}

	status := CheckBuildStatus(projectRoot, tape)

	if status.Built() {
		t.Error("Built() should be false when no output exists")
	}
	if status.Partial() {
		t.Error("Partial() should be false when no output exists")
	}
	if status.HasMP4 {
		t.Error("HasMP4 should be false")
	}
	if status.HasRawMP4 {
		t.Error("HasRawMP4 should be false")
	}
}

func TestCheckBuildStatus_FullBuild(t *testing.T) {
	projectRoot := makeOutputDir(t, "s1-test/01-example",
		[]string{".mp4", ".raw.mp4", ".vtt", ".srt", ".ass", ".gif"})
	tape := Tape{Output: "s1-test/01-example"}

	status := CheckBuildStatus(projectRoot, tape)

	if !status.Built() {
		t.Error("Built() should be true when .mp4 exists")
	}
	if status.Partial() {
		t.Error("Partial() should be false when full build exists")
	}
	if !status.HasMP4 {
		t.Error("HasMP4 should be true")
	}
	if !status.HasRawMP4 {
		t.Error("HasRawMP4 should be true")
	}
	if !status.HasVTT {
		t.Error("HasVTT should be true")
	}
	if !status.HasGIF {
		t.Error("HasGIF should be true")
	}
}

func TestCheckBuildStatus_PartialBuild(t *testing.T) {
	// Only the raw recording exists — VHS ran but ffmpeg didn't.
	projectRoot := makeOutputDir(t, "s1-test/01-example",
		[]string{".raw.mp4"})
	tape := Tape{Output: "s1-test/01-example"}

	status := CheckBuildStatus(projectRoot, tape)

	if status.Built() {
		t.Error("Built() should be false when only raw recording exists")
	}
	if !status.Partial() {
		t.Error("Partial() should be true when raw exists but not final")
	}
	if !status.HasRawMP4 {
		t.Error("HasRawMP4 should be true")
	}
	if status.HasMP4 {
		t.Error("HasMP4 should be false")
	}
}

func TestCheckBuildStatus_MP4Path(t *testing.T) {
	projectRoot := t.TempDir()
	tape := Tape{Output: "s1-test/01-example"}

	status := CheckBuildStatus(projectRoot, tape)

	expected := filepath.Join(projectRoot, DefaultOutputDir, "s1-test/01-example", "01-example.mp4")
	if status.MP4Path != expected {
		t.Errorf("MP4Path = %q, want %q", status.MP4Path, expected)
	}
}

func TestCheckBuildStatus_OutputDir(t *testing.T) {
	projectRoot := t.TempDir()
	tape := Tape{Output: "s1-test/01-example"}

	status := CheckBuildStatus(projectRoot, tape)

	expected := filepath.Join(projectRoot, DefaultOutputDir, "s1-test/01-example")
	if status.OutputDir != expected {
		t.Errorf("OutputDir = %q, want %q", status.OutputDir, expected)
	}
}

func TestCheckBuildStatus_SimpleOutput(t *testing.T) {
	// Output with no subdirectory nesting (just "install").
	projectRoot := makeOutputDir(t, "install", []string{".mp4"})
	tape := Tape{Output: "install"}

	status := CheckBuildStatus(projectRoot, tape)

	if !status.Built() {
		t.Error("Built() should be true for simple output path")
	}
}
