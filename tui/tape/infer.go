package tape

import (
	"os"
	"path/filepath"
)

// InferTapesDir walks up from a tape directory to find the root directory
// that contains all tapes. A tape can sit one level deep (studio/example/)
// or two levels deep (tapes/s1-getting-started/01-install/). The function
// checks whether the parent is one of several series directories grouped
// under a common grandparent. If so, the grandparent is the tapes root.
// Otherwise the parent is returned.
func InferTapesDir(tapeDir string) string {
	tapeDir = filepath.Clean(tapeDir)
	parent := filepath.Dir(tapeDir)
	grandparent := filepath.Dir(parent)

	// If the grandparent contains multiple series-like directories (no
	// tape.yaml of their own, but subdirectories with tape.yaml), the
	// parent is a series dir and the grandparent is the tapes root.
	if grandparent != parent && hasMultipleSeriesDirs(grandparent) {
		return grandparent
	}

	return parent
}

// hasMultipleSeriesDirs returns true if dir contains at least two
// subdirectories that look like series directories: each has no tape.yaml
// of its own but contains at least one child directory with a tape.yaml.
// This distinguishes a tapes root (tapes/ with s1-*, s2-*, ...) from a
// project root that happens to contain studio/.
func hasMultipleSeriesDirs(dir string) bool {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false
	}

	count := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		subdir := filepath.Join(dir, entry.Name())

		// A series directory does not contain tape.yaml itself.
		if _, err := os.Stat(filepath.Join(subdir, "tape.yaml")); err == nil {
			continue
		}

		// But it contains at least one subdirectory that does.
		if containsEpisode(subdir) {
			count++
			if count >= 2 {
				return true
			}
		}
	}

	return false
}

// containsEpisode returns true if dir has at least one immediate
// subdirectory containing a tape.yaml file.
func containsEpisode(dir string) bool {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if _, err := os.Stat(filepath.Join(dir, entry.Name(), "tape.yaml")); err == nil {
			return true
		}
	}

	return false
}
