package tape

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWriteMeta_WritesFile(t *testing.T) {
	dir := t.TempDir()
	meta := Meta{
		Title:       "Test Episode",
		Description: "A test.",
		Locale:      "en-GB",
		Series:      "testing",
		Version:     "1.0.0",
	}

	if err := WriteMeta(dir, meta); err != nil {
		t.Fatalf("WriteMeta() error: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(dir, "meta.yaml"))
	if err != nil {
		t.Fatalf("failed to read meta.yaml: %v", err)
	}

	content := string(data)
	if !strings.Contains(content, "title: Test Episode") {
		t.Error("should contain title")
	}
	if !strings.Contains(content, "description: A test.") {
		t.Error("should contain description")
	}
	if !strings.Contains(content, "locale: en-GB") {
		t.Error("should contain locale")
	}
}

func TestWriteMeta_OmitsEmptyFields(t *testing.T) {
	dir := t.TempDir()
	meta := Meta{Title: "Minimal"}

	if err := WriteMeta(dir, meta); err != nil {
		t.Fatalf("WriteMeta() error: %v", err)
	}

	data, _ := os.ReadFile(filepath.Join(dir, "meta.yaml"))
	content := string(data)

	// Empty fields with omitempty should not appear.
	if strings.Contains(content, "description:") {
		t.Error("empty description should be omitted")
	}
	if strings.Contains(content, "locale:") {
		t.Error("empty locale should be omitted")
	}
}

func TestWriteMeta_IncludesVoices(t *testing.T) {
	dir := t.TempDir()
	meta := Meta{
		Title:  "With Voices",
		Voices: []string{"northern_english_male", "southern_english_female"},
	}

	if err := WriteMeta(dir, meta); err != nil {
		t.Fatalf("WriteMeta() error: %v", err)
	}

	data, _ := os.ReadFile(filepath.Join(dir, "meta.yaml"))
	content := string(data)

	if !strings.Contains(content, "northern_english_male") {
		t.Error("should contain voice")
	}
	if !strings.Contains(content, "southern_english_female") {
		t.Error("should contain second voice")
	}
}
