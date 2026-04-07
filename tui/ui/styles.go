package ui

import "github.com/charmbracelet/lipgloss"

// Styles holds all lipgloss styles derived from the active theme.
// These are constructed once via NewStyles and stored on the Model,
// so we don't rebuild styles on every render cycle.
type Styles struct {
	// OuterBorder wraps everything below the title bar in one rounded border.
	OuterBorder lipgloss.Style
	// Preview is the panel style for the video preview area (top).
	Preview lipgloss.Style
	// Timeline is the panel style for the audio timeline (middle).
	Timeline lipgloss.Style
	// Inspector is the panel style for the clip inspector (bottom).
	Inspector lipgloss.Style
	// Title is for panel headings and the tape title.
	Title lipgloss.Style
	// Muted is for placeholder text, hints, and inactive content.
	Muted lipgloss.Style
	// Clip is for audio clip labels and blocks on the timeline.
	Clip lipgloss.Style
	// Selected is for the currently-selected clip (brighter, bold).
	Selected lipgloss.Style
	// Overlap is for overlapping clip regions and error/no-go states.
	Overlap lipgloss.Style
	// Warning is for states needing attention (edited, partial, pending).
	Warning lipgloss.Style
	// Delta is for showing pause value changes and success/go states.
	Delta lipgloss.Style
	// Accent is for status messages and highlights (e.g. pipeline running).
	Accent lipgloss.Style
	// Footer is for the contextual keybinding hints at the bottom.
	Footer lipgloss.Style
}

// NewStyles constructs all styles from a theme. The three panel styles
// share a common rounded border; text styles vary by semantic role.
func NewStyles(t Theme) Styles {
	// Base panel style shared by all three panels. Individual panels
	// override Width and Height at render time via CalculateLayout.
	panel := lipgloss.NewStyle().
		BorderStyle(lipgloss.RoundedBorder()).
		BorderForeground(t.Border).
		Foreground(t.Foreground)

	outer := lipgloss.NewStyle().
		BorderStyle(lipgloss.RoundedBorder()).
		BorderForeground(t.Border)

	return Styles{
		OuterBorder: outer,
		Preview:     panel.Background(lipgloss.Color("#000000")),
		Timeline:    panel,
		Inspector:   panel,
		Title: lipgloss.NewStyle().
			Bold(true).
			Foreground(t.Accent),
		Muted: lipgloss.NewStyle().
			Foreground(t.Muted),
		Clip: lipgloss.NewStyle().
			Foreground(t.Clip),
		Selected: lipgloss.NewStyle().
			Foreground(t.ClipSelected).
			Bold(true),
		Overlap: lipgloss.NewStyle().
			Foreground(t.Overlap).
			Bold(true),
		Warning: lipgloss.NewStyle().
			Foreground(t.Warning).
			Bold(true),
		Delta: lipgloss.NewStyle().
			Foreground(t.Delta),
		Accent: lipgloss.NewStyle().
			Foreground(t.Accent),
		Footer: lipgloss.NewStyle().
			Foreground(t.Muted),
	}
}
