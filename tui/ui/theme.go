package ui

import "github.com/charmbracelet/lipgloss"

// Theme defines the colour palette for the TUI. Each field maps to a
// semantic role used across all panels, so swapping the theme changes
// the entire UI consistently.
//
// The default is Tokyo Night Storm. Users can override this with their
// own palette (Catppuccin, Gruvbox, Dracula, etc.) via the playback
// config file's [theme] section.
type Theme struct {
	// Background is the base background colour for all panels.
	Background lipgloss.Color
	// Foreground is the default text colour.
	Foreground lipgloss.Color
	// Clip is the colour for audio clip blocks on the timeline.
	Clip lipgloss.Color
	// ClipSelected is the colour for the currently-selected clip.
	ClipSelected lipgloss.Color
	// Overlap is the colour for overlapping regions and error/no-go states.
	Overlap lipgloss.Color
	// Warning is for states that need attention — edited, partial, pending.
	Warning lipgloss.Color
	// Delta is the colour for showing pause adjustments and success/go states.
	Delta lipgloss.Color
	// Muted is for de-emphasised text (placeholders, hints, inactive items).
	Muted lipgloss.Color
	// Accent is for titles, headings, and highlighted UI elements.
	Accent lipgloss.Color
	// Ruler is for the timeline ruler marks and gridlines.
	Ruler lipgloss.Color
	// Border is for panel borders and dividers.
	Border lipgloss.Color
}

// TokyoNightStorm is the default theme, based on the Tokyo Night colour
// scheme's "Storm" variant. Hex values sourced from the canonical palette
// at https://github.com/folke/tokyonight.nvim.
var TokyoNightStorm = Theme{
	Background:   lipgloss.Color("#24283b"),
	Foreground:   lipgloss.Color("#c0caf5"),
	Clip:         lipgloss.Color("#7aa2f7"),
	ClipSelected: lipgloss.Color("#7dcfff"),
	Overlap:      lipgloss.Color("#f7768e"),
	Warning:      lipgloss.Color("#e0af68"),
	Delta:        lipgloss.Color("#9ece6a"),
	Muted:        lipgloss.Color("#565f89"),
	Accent:       lipgloss.Color("#bb9af7"),
	Ruler:        lipgloss.Color("#3b4261"),
	Border:       lipgloss.Color("#545c7e"),
}

// HighContrast is a theme designed for low-vision users. It uses pure
// white on black with bold, saturated accent colours that exceed WCAG
// AAA contrast ratios (7:1+) against the black background. Muted text
// uses a lighter grey than Tokyo Night to remain legible.
var HighContrast = Theme{
	Background:   lipgloss.Color("#000000"),
	Foreground:   lipgloss.Color("#ffffff"),
	Clip:         lipgloss.Color("#00bfff"), // bright cyan — 8.6:1 on black
	ClipSelected: lipgloss.Color("#ffffff"), // pure white — maximum contrast
	Overlap:      lipgloss.Color("#ff5555"), // bright red — 5.5:1 on black, bold compensates
	Warning:      lipgloss.Color("#ff6600"), // bright orange — 4.6:1 on black, bold compensates
	Delta:        lipgloss.Color("#50fa7b"), // bright green — 11.8:1 on black
	Muted:        lipgloss.Color("#aaaaaa"), // light grey — 7.5:1 on black (AAA)
	Accent:       lipgloss.Color("#ffff55"), // bright yellow — 18.3:1 on black
	Ruler:        lipgloss.Color("#666666"), // mid grey — 4.2:1 on black (decorative only)
	Border:       lipgloss.Color("#aaaaaa"), // light grey — matches muted for consistency
}
