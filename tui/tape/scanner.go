package tape

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// TapeEntry represents a discovered tape directory in the project.
type TapeEntry struct {
	// Dir is the absolute path to the tape directory.
	Dir string
	// RelPath is the path relative to the tapes root (e.g. "s1-getting-started/01-install").
	RelPath string
	// Title is the tape title from tape.yaml.
	Title string
}

// ScanTapes walks the tapesDir and returns all directories that contain
// a tape.yaml file. Each entry includes the parsed title for display.
// Results are sorted by relative path.
func ScanTapes(tapesDir string) ([]TapeEntry, error) {
	tapesDir = filepath.Clean(tapesDir)
	var entries []TapeEntry

	err := filepath.WalkDir(tapesDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // skip inaccessible directories
		}

		// We're looking for tape.yaml files.
		if d.IsDir() || d.Name() != "tape.yaml" {
			return nil
		}

		dir := filepath.Dir(path)
		relPath, _ := filepath.Rel(tapesDir, dir)
		if relPath == "" {
			relPath = "."
		}

		// Read just the title from tape.yaml — we don't need full validation.
		title := readTapeTitle(path)

		entries = append(entries, TapeEntry{
			Dir:     dir,
			RelPath: relPath,
			Title:   title,
		})

		return nil
	})
	if err != nil {
		return nil, err
	}

	sort.Slice(entries, func(i, j int) bool {
		return entries[i].RelPath < entries[j].RelPath
	})

	return entries, nil
}

// readTapeTitle does a quick parse of tape.yaml to extract just the title.
// Returns an empty string if the file can't be read or parsed.
func readTapeTitle(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	// Quick line scan — faster than full YAML parse for just the title.
	for _, line := range strings.Split(string(data), "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "title:") {
			title := strings.TrimPrefix(trimmed, "title:")
			title = strings.TrimSpace(title)
			// Strip quotes if present.
			title = strings.Trim(title, "\"'")
			return title
		}
	}
	return ""
}
