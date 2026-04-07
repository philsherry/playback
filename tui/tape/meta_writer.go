package tape

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// WriteMeta writes the Meta struct to meta.yaml in the given directory.
// Unlike WritePauses (which does targeted line replacement), this does a
// full marshal since meta.yaml has no complex formatting to preserve.
func WriteMeta(dir string, meta Meta) error {
	data, err := yaml.Marshal(meta)
	if err != nil {
		return fmt.Errorf("failed to marshal meta.yaml: %w", err)
	}

	path := filepath.Join(dir, "meta.yaml")
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return fmt.Errorf("cannot write meta.yaml: %w", err)
	}
	return nil
}
