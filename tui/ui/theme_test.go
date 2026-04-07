package ui

import (
	"testing"

	"github.com/charmbracelet/lipgloss"
)

func TestTokyoNightStorm_AllFieldsPopulated(t *testing.T) {
	// Every field in the theme should be a non-empty colour string.
	// This catches accidental omissions when adding new theme fields.
	theme := TokyoNightStorm

	fields := []struct {
		name  string
		value lipgloss.Color
	}{
		{"Background", theme.Background},
		{"Foreground", theme.Foreground},
		{"Clip", theme.Clip},
		{"ClipSelected", theme.ClipSelected},
		{"Overlap", theme.Overlap},
		{"Warning", theme.Warning},
		{"Delta", theme.Delta},
		{"Muted", theme.Muted},
		{"Accent", theme.Accent},
		{"Ruler", theme.Ruler},
		{"Border", theme.Border},
	}

	for _, f := range fields {
		if string(f.value) == "" {
			t.Errorf("TokyoNightStorm.%s is empty", f.name)
		}
	}
}

func TestTokyoNightStorm_HexValues(t *testing.T) {
	// Verify exact hex values match the canonical Tokyo Night Storm
	// palette. These are sourced from folke/tokyonight.nvim.
	expected := map[string]lipgloss.Color{
		"Background":   "#24283b",
		"Foreground":   "#c0caf5",
		"Clip":         "#7aa2f7",
		"ClipSelected": "#7dcfff",
		"Overlap":      "#f7768e",
		"Warning":      "#e0af68",
		"Delta":        "#9ece6a",
		"Muted":        "#565f89",
		"Accent":       "#bb9af7",
		"Ruler":        "#3b4261",
		"Border":       "#545c7e",
	}

	theme := TokyoNightStorm
	actual := map[string]lipgloss.Color{
		"Background":   theme.Background,
		"Foreground":   theme.Foreground,
		"Clip":         theme.Clip,
		"ClipSelected": theme.ClipSelected,
		"Overlap":      theme.Overlap,
		"Warning":      theme.Warning,
		"Delta":        theme.Delta,
		"Muted":        theme.Muted,
		"Accent":       theme.Accent,
		"Ruler":        theme.Ruler,
		"Border":       theme.Border,
	}

	for name, want := range expected {
		got := actual[name]
		if got != want {
			t.Errorf("TokyoNightStorm.%s = %q, want %q", name, got, want)
		}
	}
}

func TestTokyoNightStorm_UniqueColours(t *testing.T) {
	// Each semantic role should have a distinct colour so they're
	// visually distinguishable in the TUI.
	theme := TokyoNightStorm
	colours := []struct {
		name  string
		value lipgloss.Color
	}{
		{"Background", theme.Background},
		{"Foreground", theme.Foreground},
		{"Clip", theme.Clip},
		{"ClipSelected", theme.ClipSelected},
		{"Overlap", theme.Overlap},
		{"Warning", theme.Warning},
		{"Delta", theme.Delta},
		{"Muted", theme.Muted},
		{"Accent", theme.Accent},
		{"Ruler", theme.Ruler},
		{"Border", theme.Border},
	}

	seen := make(map[lipgloss.Color]string)
	for _, c := range colours {
		if prev, exists := seen[c.value]; exists {
			t.Errorf("duplicate colour %q used by both %s and %s", c.value, prev, c.name)
		}
		seen[c.value] = c.name
	}
}

func TestHighContrast_AllFieldsPopulated(t *testing.T) {
	theme := HighContrast
	fields := []struct {
		name  string
		value lipgloss.Color
	}{
		{"Background", theme.Background},
		{"Foreground", theme.Foreground},
		{"Clip", theme.Clip},
		{"ClipSelected", theme.ClipSelected},
		{"Overlap", theme.Overlap},
		{"Warning", theme.Warning},
		{"Delta", theme.Delta},
		{"Muted", theme.Muted},
		{"Accent", theme.Accent},
		{"Ruler", theme.Ruler},
		{"Border", theme.Border},
	}

	for _, f := range fields {
		if string(f.value) == "" {
			t.Errorf("HighContrast.%s is empty", f.name)
		}
	}
}

func TestHighContrast_BlackBackground(t *testing.T) {
	if HighContrast.Background != "#000000" {
		t.Errorf("HighContrast.Background = %q, want #000000", HighContrast.Background)
	}
}

func TestHighContrast_WhiteForeground(t *testing.T) {
	if HighContrast.Foreground != "#ffffff" {
		t.Errorf("HighContrast.Foreground = %q, want #ffffff", HighContrast.Foreground)
	}
}

func TestHighContrast_ConstructsStyles(t *testing.T) {
	styles := NewStyles(HighContrast)
	rendered := styles.Title.Render("test")
	if rendered == "" {
		t.Error("HighContrast styles.Title.Render returned empty string")
	}
}

func TestTheme_CustomPalette(t *testing.T) {
	// Verify that a custom theme can be constructed and used with
	// NewStyles without panicking.
	custom := Theme{
		Background:   lipgloss.Color("#1e1e2e"),
		Foreground:   lipgloss.Color("#cdd6f4"),
		Clip:         lipgloss.Color("#89b4fa"),
		ClipSelected: lipgloss.Color("#74c7ec"),
		Overlap:      lipgloss.Color("#f38ba8"),
		Delta:        lipgloss.Color("#a6e3a1"),
		Muted:        lipgloss.Color("#6c7086"),
		Accent:       lipgloss.Color("#cba6f7"),
		Ruler:        lipgloss.Color("#313244"),
		Border:       lipgloss.Color("#585b70"),
	}

	// Should not panic.
	styles := NewStyles(custom)

	// Spot-check that the custom theme colours are applied.
	// lipgloss.Style doesn't expose its foreground directly, so we
	// just verify the styles were constructed without error by
	// rendering a sample string.
	rendered := styles.Title.Render("test")
	if rendered == "" {
		t.Error("styles.Title.Render returned empty string")
	}
}
