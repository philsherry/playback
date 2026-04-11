package tape

import (
	"os"
	"sort"

	"github.com/adrg/xdg"
	"gopkg.in/yaml.v3"
)

// VoiceEntry represents a single voice in the catalogue.
type VoiceEntry struct {
	Gender  string `yaml:"gender"`
	Locale  string `yaml:"locale"`
	Model   string `yaml:"model"`
	Quality string `yaml:"quality"`
	URL     string `yaml:"url"`
}

// VoiceCatalogue is the full catalogue keyed by voice identifier.
type VoiceCatalogue map[string]VoiceEntry

// voiceCatalogueFile is the top-level YAML structure for voices.yaml.
type voiceCatalogueFile struct {
	Voices VoiceCatalogue `yaml:"voices"`
}

// LoadVoiceCatalogue reads the XDG voice catalogue from
// $XDG_CONFIG_HOME/playback/voices.yaml.
//
// Returns nil when the file does not exist or cannot be parsed — callers
// should treat nil as "catalogue unavailable" and fall back to displaying
// whatever voice identifiers are stored in the tape's meta.yaml.
func LoadVoiceCatalogue() VoiceCatalogue {
	path, err := xdg.SearchConfigFile("playback/voices.yaml")
	if err != nil {
		return nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	var f voiceCatalogueFile
	if err := yaml.Unmarshal(data, &f); err != nil {
		return nil
	}

	if len(f.Voices) == 0 {
		return nil
	}

	return f.Voices
}

// IDs returns the sorted list of voice identifiers from the catalogue.
func (c VoiceCatalogue) IDs() []string {
	ids := make([]string, 0, len(c))
	for id := range c {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}
