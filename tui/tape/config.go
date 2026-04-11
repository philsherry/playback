package tape

import (
	"os"

	"github.com/adrg/xdg"
	"gopkg.in/yaml.v3"
)

// XdgConfig holds the fields from $XDG_CONFIG_HOME/playback/config.yaml that
// the TUI cares about. logLevel and voices are present in the shared config
// file but are CLI-only concerns — the TUI silently ignores them.
type XdgConfig struct {
	// Theme is the name of the built-in colour theme to use (e.g.
	// "tokyo-night-storm", "catppuccin-mocha"). Unrecognised names fall
	// back to the default Tokyo Night Storm theme.
	Theme string `yaml:"theme"`
}

// LoadXdgConfig reads and parses $XDG_CONFIG_HOME/playback/config.yaml.
//
// Returns nil when the file does not exist — callers should treat nil as
// "no user config" and fall through to built-in defaults. Malformed YAML
// is silently ignored for the same reason.
func LoadXdgConfig() *XdgConfig {
	path, err := xdg.SearchConfigFile("playback/config.yaml")
	if err != nil {
		// File not found in any XDG config directory.
		return nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	var cfg XdgConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil
	}

	return &cfg
}
