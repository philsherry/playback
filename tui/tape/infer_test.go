package tape

import (
	"os"
	"path/filepath"
	"testing"
)

func TestInferTapesDir_SeriesStructure(t *testing.T) {
	// tapes/s1-getting-started/01-install/tape.yaml
	// tapes/s2-setup/01-cursor/tape.yaml
	root := t.TempDir()
	tapesDir := filepath.Join(root, "tapes")

	for _, path := range []string{
		"s1-getting-started/01-install",
		"s2-setup/01-cursor",
	} {
		dir := filepath.Join(tapesDir, path)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(
			filepath.Join(dir, "tape.yaml"), []byte("title: test"), 0o644,
		); err != nil {
			t.Fatal(err)
		}
	}

	got := InferTapesDir(filepath.Join(tapesDir, "s1-getting-started", "01-install"))
	if got != tapesDir {
		t.Errorf("InferTapesDir() = %q, want %q", got, tapesDir)
	}
}

func TestInferTapesDir_SingleSeries(t *testing.T) {
	// With only one series, falls back to the series directory as root.
	root := t.TempDir()
	tapesDir := filepath.Join(root, "tapes")
	episodeDir := filepath.Join(tapesDir, "s1-getting-started", "01-install")
	if err := os.MkdirAll(episodeDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(episodeDir, "tape.yaml"), []byte("title: test"), 0o644,
	); err != nil {
		t.Fatal(err)
	}

	seriesDir := filepath.Join(tapesDir, "s1-getting-started")
	got := InferTapesDir(episodeDir)
	if got != seriesDir {
		t.Errorf("InferTapesDir() = %q, want %q", got, seriesDir)
	}
}

func TestInferTapesDir_FlatStructure(t *testing.T) {
	// flat/single-level structure: studio/tape/tape.yaml
	root := t.TempDir()
	studioDir := filepath.Join(root, "studio")
	exampleDir := filepath.Join(studioDir, "tape")
	if err := os.MkdirAll(exampleDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(exampleDir, "tape.yaml"), []byte("title: test"), 0o644,
	); err != nil {
		t.Fatal(err)
	}

	got := InferTapesDir(exampleDir)
	if got != studioDir {
		t.Errorf("InferTapesDir() = %q, want %q", got, studioDir)
	}
}

func TestInferTapesDir_MultipleSeries(t *testing.T) {
	// Verify it picks the grandparent when multiple series exist.
	root := t.TempDir()
	tapesDir := filepath.Join(root, "tapes")

	for _, series := range []string{"s1-foo", "s2-bar"} {
		ep := filepath.Join(tapesDir, series, "01-ep")
		if err := os.MkdirAll(ep, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(
			filepath.Join(ep, "tape.yaml"), []byte("title: test"), 0o644,
		); err != nil {
			t.Fatal(err)
		}
	}

	got := InferTapesDir(filepath.Join(tapesDir, "s1-foo", "01-ep"))
	if got != tapesDir {
		t.Errorf("InferTapesDir() = %q, want %q", got, tapesDir)
	}
}
