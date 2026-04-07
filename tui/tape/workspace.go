package tape

import (
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// workspaceFile is the workspace config read from workspace.yaml.
// Only the constants field is used by the TUI — sources and mounts
// are handled by the TypeScript pipeline.
type workspaceFile struct {
	Constants map[string]string `yaml:"constants"`
}

// LoadWorkspaceConstants reads workspace.yaml from the project root
// and returns the constants map. Returns an empty map if the file is
// absent or cannot be parsed.
func LoadWorkspaceConstants(projectRoot string) map[string]string {
	path := filepath.Join(projectRoot, "workspace.yaml")

	data, err := os.ReadFile(path)
	if err != nil {
		return map[string]string{}
	}

	var ws workspaceFile
	if err := yaml.Unmarshal(data, &ws); err != nil {
		return map[string]string{}
	}

	if ws.Constants == nil {
		return map[string]string{}
	}

	return ws.Constants
}
