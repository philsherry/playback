package main

import (
	"os"
	"path/filepath"
	"testing"
)

// --- resolvePathWithINIT_CWD ---

// TestResolvePath_WithINIT_CWD verifies that a relative tape path is
// resolved against INIT_CWD when set. This is the path npm takes:
// the npm script does "cd tui && go run .", which changes the working
// directory, but npm sets INIT_CWD to the original project root so
// we can recover the correct absolute path.
func TestResolvePath_WithINIT_CWD(t *testing.T) {
	projectRoot := t.TempDir()
	tapeDir := filepath.Join(projectRoot, "tapes", "test-episode")
	if err := os.MkdirAll(tapeDir, 0o755); err != nil {
		t.Fatalf("failed to create tape dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tapeDir, "tape.yaml"), []byte(`
title: Test
output: test
steps:
  - action: run
`), 0o644); err != nil {
		t.Fatalf("failed to write tape.yaml: %v", err)
	}

	relativePath := "tapes/test-episode"
	resolved := resolvePathWithINIT_CWD(relativePath, projectRoot)
	expected := filepath.Join(projectRoot, relativePath)
	if resolved != expected {
		t.Errorf("resolvePathWithINIT_CWD(%q, %q) = %q, want %q",
			relativePath, projectRoot, resolved, expected)
	}

	// Verify the resolved path actually exists.
	if _, err := os.Stat(resolved); err != nil {
		t.Errorf("resolved path does not exist: %v", err)
	}
}

// TestResolvePath_AbsolutePathUnchanged verifies that an absolute path
// is returned as-is, regardless of INIT_CWD.
func TestResolvePath_AbsolutePathUnchanged(t *testing.T) {
	absPath := "/tmp/some/absolute/path"
	resolved := resolvePathWithINIT_CWD(absPath, "/some/other/dir")
	if resolved != absPath {
		t.Errorf("absolute path should be unchanged: got %q, want %q", resolved, absPath)
	}
}

// TestResolvePath_EmptyINIT_CWD_FallsBackToAbs verifies that when
// INIT_CWD is empty, the path is made absolute against the current
// working directory via filepath.Abs.
func TestResolvePath_EmptyINIT_CWD_FallsBackToAbs(t *testing.T) {
	relativePath := "tapes/test"
	resolved := resolvePathWithINIT_CWD(relativePath, "")

	if !filepath.IsAbs(resolved) {
		t.Errorf("expected absolute path, got %q", resolved)
	}

	// Should end with the relative path we passed in.
	if !filepath.IsAbs(resolved) || filepath.Base(resolved) != "test" {
		t.Errorf("resolved path %q should end with 'test'", resolved)
	}
}

// TestResolvePath_INIT_CWD_TakesPriorityOverCwd verifies that INIT_CWD
// wins over the current working directory. This is important because
// "cd tui && go run ." means cwd is tui/, but the user's path is
// relative to the project root (which INIT_CWD points to).
func TestResolvePath_INIT_CWD_TakesPriorityOverCwd(t *testing.T) {
	initCwd := "/project/root"
	resolved := resolvePathWithINIT_CWD("tapes/foo", initCwd)

	expected := filepath.Join(initCwd, "tapes/foo")
	if resolved != expected {
		t.Errorf("INIT_CWD should take priority: got %q, want %q", resolved, expected)
	}
}

// TestResolvePath_TrailingSlashInINIT_CWD verifies that a trailing slash
// on INIT_CWD doesn't produce a malformed path.
func TestResolvePath_TrailingSlashInINIT_CWD(t *testing.T) {
	resolved := resolvePathWithINIT_CWD("tapes/foo", "/project/root/")
	expected := filepath.Join("/project/root/", "tapes/foo")
	if resolved != expected {
		t.Errorf("got %q, want %q", resolved, expected)
	}
}
