package tape

import (
	"os"
	"path/filepath"
	"testing"
)

// makeTapeDir creates a tape directory with a minimal tape.yaml.
func makeTapeDir(t *testing.T, root, relPath, title string) {
	t.Helper()
	dir := filepath.Join(root, relPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("failed to create %s: %v", dir, err)
	}
	content := "title: " + title + "\noutput: " + relPath + "\nsteps:\n  - action: run\n"
	if err := os.WriteFile(filepath.Join(dir, "tape.yaml"), []byte(content), 0o644); err != nil {
		t.Fatalf("failed to write tape.yaml: %v", err)
	}
}

func TestScanTapes_FindsAll(t *testing.T) {
	root := t.TempDir()
	makeTapeDir(t, root, "s1/01-install", "Install")
	makeTapeDir(t, root, "s1/02-setup", "Setup")
	makeTapeDir(t, root, "s2/01-build", "Build")

	entries, err := ScanTapes(root)
	if err != nil {
		t.Fatalf("ScanTapes() error: %v", err)
	}
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(entries))
	}
}

func TestScanTapes_SortedByPath(t *testing.T) {
	root := t.TempDir()
	makeTapeDir(t, root, "s2/01-build", "Build")
	makeTapeDir(t, root, "s1/01-install", "Install")
	makeTapeDir(t, root, "s1/02-setup", "Setup")

	entries, err := ScanTapes(root)
	if err != nil {
		t.Fatalf("ScanTapes() error: %v", err)
	}

	if entries[0].RelPath != "s1/01-install" {
		t.Errorf("entries[0].RelPath = %q, want s1/01-install", entries[0].RelPath)
	}
	if entries[1].RelPath != "s1/02-setup" {
		t.Errorf("entries[1].RelPath = %q, want s1/02-setup", entries[1].RelPath)
	}
	if entries[2].RelPath != "s2/01-build" {
		t.Errorf("entries[2].RelPath = %q, want s2/01-build", entries[2].RelPath)
	}
}

func TestScanTapes_ParsesTitle(t *testing.T) {
	root := t.TempDir()
	makeTapeDir(t, root, "ep1", "My Episode")

	entries, err := ScanTapes(root)
	if err != nil {
		t.Fatalf("ScanTapes() error: %v", err)
	}
	if entries[0].Title != "My Episode" {
		t.Errorf("Title = %q, want %q", entries[0].Title, "My Episode")
	}
}

func TestScanTapes_QuotedTitle(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "ep1")
	os.MkdirAll(dir, 0o755)
	os.WriteFile(
		filepath.Join(dir, "tape.yaml"),
		[]byte("title: \"Quoted Title\"\noutput: ep1\nsteps:\n  - action: run\n"),
		0o644,
	)

	entries, _ := ScanTapes(root)
	if len(entries) == 0 {
		t.Fatal("expected 1 entry")
	}
	if entries[0].Title != "Quoted Title" {
		t.Errorf("Title = %q, want %q", entries[0].Title, "Quoted Title")
	}
}

func TestScanTapes_EmptyDir(t *testing.T) {
	root := t.TempDir()

	entries, err := ScanTapes(root)
	if err != nil {
		t.Fatalf("ScanTapes() error: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("expected 0 entries for empty dir, got %d", len(entries))
	}
}

func TestScanTapes_IgnoresDirsWithoutTapeYaml(t *testing.T) {
	root := t.TempDir()
	// Create a directory without tape.yaml.
	os.MkdirAll(filepath.Join(root, "not-a-tape"), 0o755)
	os.WriteFile(filepath.Join(root, "not-a-tape", "README.md"), []byte("hi"), 0o644)

	makeTapeDir(t, root, "real-tape", "Real")

	entries, _ := ScanTapes(root)
	if len(entries) != 1 {
		t.Errorf("expected 1 entry (ignoring dir without tape.yaml), got %d", len(entries))
	}
}

func TestScanTapes_AbsoluteDir(t *testing.T) {
	root := t.TempDir()
	makeTapeDir(t, root, "ep1", "Test")

	entries, _ := ScanTapes(root)
	if len(entries) == 0 {
		t.Fatal("expected entries")
	}
	if !filepath.IsAbs(entries[0].Dir) {
		t.Errorf("Dir should be absolute, got %q", entries[0].Dir)
	}
}

func TestReadTapeTitle_NoTitle(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "tape.yaml")
	os.WriteFile(path, []byte("output: test\nsteps:\n  - action: run\n"), 0o644)

	title := readTapeTitle(path)
	if title != "" {
		t.Errorf("expected empty title, got %q", title)
	}
}

func TestReadTapeTitle_MissingFile(t *testing.T) {
	title := readTapeTitle("/nonexistent/tape.yaml")
	if title != "" {
		t.Errorf("expected empty title for missing file, got %q", title)
	}
}
