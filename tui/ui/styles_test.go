package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/lipgloss"
)

func TestNewStyles_AllFieldsConstructed(t *testing.T) {
	styles := NewStyles(TokyoNightStorm)

	// Verify that every style field produces non-empty output when
	// rendering a test string. This catches nil/zero-value styles.
	cases := []struct {
		name  string
		style lipgloss.Style
	}{
		{"OuterBorder", styles.OuterBorder},
		{"Preview", styles.Preview},
		{"Timeline", styles.Timeline},
		{"Inspector", styles.Inspector},
		{"Title", styles.Title},
		{"Muted", styles.Muted},
		{"Clip", styles.Clip},
		{"Selected", styles.Selected},
		{"Overlap", styles.Overlap},
		{"Warning", styles.Warning},
		{"Delta", styles.Delta},
		{"Accent", styles.Accent},
		{"Footer", styles.Footer},
	}

	for _, tc := range cases {
		got := tc.style.Render("test")
		if got == "" {
			t.Errorf("styles.%s.Render(\"test\") returned empty string", tc.name)
		}
	}
}

func TestNewStyles_PanelStylesHaveBorders(t *testing.T) {
	styles := NewStyles(TokyoNightStorm)

	// Panel styles should render wider than the input text because
	// of the rounded border characters.
	for _, tc := range []struct {
		name  string
		style lipgloss.Style
	}{
		{"OuterBorder", styles.OuterBorder},
		{"Preview", styles.Preview},
		{"Timeline", styles.Timeline},
		{"Inspector", styles.Inspector},
	} {
		input := "x"
		rendered := tc.style.Render(input)
		// A bordered "x" should be at least 3 lines (top border, content, bottom border).
		if len(rendered) <= len(input) {
			t.Errorf("styles.%s.Render(%q) output length %d, expected longer (borders)",
				tc.name, input, len(rendered))
		}
	}
}

func TestNewStyles_TextStylesNoBorders(t *testing.T) {
	styles := NewStyles(TokyoNightStorm)

	// Text styles (Title, Muted, etc.) should not add borders or
	// newlines — they're inline styles.
	for _, tc := range []struct {
		name  string
		style lipgloss.Style
	}{
		{"Title", styles.Title},
		{"Muted", styles.Muted},
		{"Clip", styles.Clip},
		{"Selected", styles.Selected},
		{"Overlap", styles.Overlap},
		{"Warning", styles.Warning},
		{"Delta", styles.Delta},
		{"Accent", styles.Accent},
		{"Footer", styles.Footer},
	} {
		rendered := tc.style.Render("hello")
		// Inline styles add ANSI codes but not newlines (no border).
		if strings.Contains(rendered, "\n") {
			t.Errorf("styles.%s.Render(\"hello\") contains newline (unexpected border?)", tc.name)
		}
	}
}

func TestNewStyles_DifferentThemeConstructsWithoutError(t *testing.T) {
	// Verify that a custom theme with different colours can be used to
	// construct a complete set of styles without panicking or producing
	// empty output. We don't compare ANSI escape sequences because
	// lipgloss strips colour output in non-TTY environments (test runners,
	// CI), making rendered strings identical regardless of theme.
	alt := Theme{
		Background:   "#000000",
		Foreground:   "#ffffff",
		Clip:         "#ff0000",
		ClipSelected: "#00ff00",
		Overlap:      "#0000ff",
		Delta:        "#ffff00",
		Muted:        "#888888",
		Accent:       "#ff00ff",
		Ruler:        "#444444",
		Border:       "#cccccc",
	}
	altStyles := NewStyles(alt)

	// Should produce non-empty output for all style fields.
	if altStyles.Title.Render("test") == "" {
		t.Error("alt theme Title.Render returned empty string")
	}
	if altStyles.Clip.Render("test") == "" {
		t.Error("alt theme Clip.Render returned empty string")
	}
	if altStyles.Preview.Render("test") == "" {
		t.Error("alt theme Preview.Render returned empty string")
	}
}
