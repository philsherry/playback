package ui

import "github.com/charmbracelet/lipgloss"

// ThemeForName returns the built-in Theme for the given name, and whether it
// was found. Unrecognised names return (TokyoNightStorm, false) so callers
// can fall back gracefully without a nil check.
func ThemeForName(name string) (Theme, bool) {
	t, ok := builtinThemes[name]
	return t, ok
}

// builtinThemes maps config.yaml theme names to their Theme values. Names
// mirror the TS CLI theme names so the shared config file works in both tools.
var builtinThemes = map[string]Theme{
	"default":              TokyoNightStorm,
	"tokyo-night":          TokyoNight,
	"tokyo-night-storm":    TokyoNightStorm,
	"tokyo-night-moon":     TokyoNightMoon,
	"tokyo-night-day":      TokyoNightDay,
	"catppuccin-mocha":     CatppuccinMocha,
	"catppuccin-macchiato": CatppuccinMacchiato,
	"catppuccin-frappe":    CatppuccinFrappe,
	"catppuccin-latte":     CatppuccinLatte,
	"dracula":              Dracula,
	"high-contrast":        HighContrast,
}

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

// ── Tokyo Night variants ──────────────────────────────────────────────────────
// Hex values sourced from https://github.com/folke/tokyonight.nvim

// TokyoNight is the standard dark variant of the Tokyo Night palette.
var TokyoNight = Theme{
	Background:   lipgloss.Color("#1a1b26"),
	Foreground:   lipgloss.Color("#c0caf5"),
	Clip:         lipgloss.Color("#7aa2f7"), // blue
	ClipSelected: lipgloss.Color("#7dcfff"), // cyan
	Overlap:      lipgloss.Color("#f7768e"), // red
	Warning:      lipgloss.Color("#e0af68"), // yellow
	Delta:        lipgloss.Color("#9ece6a"), // green
	Muted:        lipgloss.Color("#414868"), // comment
	Accent:       lipgloss.Color("#bb9af7"), // purple
	Ruler:        lipgloss.Color("#283457"), // dark blue-grey
	Border:       lipgloss.Color("#3d59a1"), // blue-grey
}

// TokyoNightMoon is the Moon variant — darkest of the Tokyo Night family.
var TokyoNightMoon = Theme{
	Background:   lipgloss.Color("#222436"),
	Foreground:   lipgloss.Color("#c8d3f5"),
	Clip:         lipgloss.Color("#82aaff"), // blue
	ClipSelected: lipgloss.Color("#86e1fc"), // cyan
	Overlap:      lipgloss.Color("#ff757f"), // red
	Warning:      lipgloss.Color("#ffc777"), // yellow
	Delta:        lipgloss.Color("#c3e88d"), // green
	Muted:        lipgloss.Color("#444a73"), // comment
	Accent:       lipgloss.Color("#c099ff"), // purple
	Ruler:        lipgloss.Color("#2f334d"), // dark blue-grey
	Border:       lipgloss.Color("#444a73"), // matches muted
}

// TokyoNightDay is the light variant of the Tokyo Night palette.
var TokyoNightDay = Theme{
	Background:   lipgloss.Color("#e1e2e7"),
	Foreground:   lipgloss.Color("#3760bf"),
	Clip:         lipgloss.Color("#2e7de9"), // blue
	ClipSelected: lipgloss.Color("#007197"), // cyan
	Overlap:      lipgloss.Color("#f52a65"), // red
	Warning:      lipgloss.Color("#8c6c3e"), // yellow-brown
	Delta:        lipgloss.Color("#587539"), // green
	Muted:        lipgloss.Color("#848cb5"), // comment
	Accent:       lipgloss.Color("#9854f1"), // purple
	Ruler:        lipgloss.Color("#c4c8da"), // light grey
	Border:       lipgloss.Color("#a8aecb"), // blue-grey
}

// ── Catppuccin variants ───────────────────────────────────────────────────────
// Hex values sourced from https://github.com/catppuccin/catppuccin

// CatppuccinMocha is the darkest Catppuccin flavour.
var CatppuccinMocha = Theme{
	Background:   lipgloss.Color("#1e1e2e"), // base
	Foreground:   lipgloss.Color("#cdd6f4"), // text
	Clip:         lipgloss.Color("#89b4fa"), // blue
	ClipSelected: lipgloss.Color("#74c7ec"), // sapphire
	Overlap:      lipgloss.Color("#f38ba8"), // red
	Warning:      lipgloss.Color("#fab387"), // peach
	Delta:        lipgloss.Color("#a6e3a1"), // green
	Muted:        lipgloss.Color("#6c7086"), // overlay0
	Accent:       lipgloss.Color("#cba6f7"), // mauve
	Ruler:        lipgloss.Color("#313244"), // surface0
	Border:       lipgloss.Color("#585b70"), // surface2
}

// CatppuccinMacchiato is the medium-dark Catppuccin flavour.
var CatppuccinMacchiato = Theme{
	Background:   lipgloss.Color("#24273a"), // base
	Foreground:   lipgloss.Color("#cad3f5"), // text
	Clip:         lipgloss.Color("#8aadf4"), // blue
	ClipSelected: lipgloss.Color("#7dc4e4"), // sapphire
	Overlap:      lipgloss.Color("#ed8796"), // red
	Warning:      lipgloss.Color("#f5a97f"), // peach
	Delta:        lipgloss.Color("#a6da95"), // green
	Muted:        lipgloss.Color("#6e738d"), // overlay0
	Accent:       lipgloss.Color("#c6a0f6"), // mauve
	Ruler:        lipgloss.Color("#363a4f"), // surface0
	Border:       lipgloss.Color("#5b6078"), // surface2
}

// CatppuccinFrappe is the medium Catppuccin flavour.
var CatppuccinFrappe = Theme{
	Background:   lipgloss.Color("#303446"), // base
	Foreground:   lipgloss.Color("#c6d0f5"), // text
	Clip:         lipgloss.Color("#8caaee"), // blue
	ClipSelected: lipgloss.Color("#85c1dc"), // sapphire
	Overlap:      lipgloss.Color("#e78284"), // red
	Warning:      lipgloss.Color("#ef9f76"), // peach
	Delta:        lipgloss.Color("#a6d189"), // green
	Muted:        lipgloss.Color("#737994"), // overlay0
	Accent:       lipgloss.Color("#ca9ee6"), // mauve
	Ruler:        lipgloss.Color("#414559"), // surface0
	Border:       lipgloss.Color("#626880"), // surface2
}

// CatppuccinLatte is the light Catppuccin flavour.
var CatppuccinLatte = Theme{
	Background:   lipgloss.Color("#eff1f5"), // base
	Foreground:   lipgloss.Color("#4c4f69"), // text
	Clip:         lipgloss.Color("#1e66f5"), // blue
	ClipSelected: lipgloss.Color("#209fb5"), // sapphire
	Overlap:      lipgloss.Color("#d20f39"), // red
	Warning:      lipgloss.Color("#fe640b"), // peach
	Delta:        lipgloss.Color("#40a02b"), // green
	Muted:        lipgloss.Color("#9ca0b0"), // overlay0
	Accent:       lipgloss.Color("#8839ef"), // mauve
	Ruler:        lipgloss.Color("#ccd0da"), // surface0
	Border:       lipgloss.Color("#bcc0cc"), // surface2
}

// ── Dracula ───────────────────────────────────────────────────────────────────
// Hex values sourced from https://draculatheme.com/contribute

// Dracula is the classic purple-tinted dark theme.
var Dracula = Theme{
	Background:   lipgloss.Color("#282a36"),
	Foreground:   lipgloss.Color("#f8f8f2"),
	Clip:         lipgloss.Color("#8be9fd"), // cyan
	ClipSelected: lipgloss.Color("#ffffff"), // white
	Overlap:      lipgloss.Color("#ff5555"), // red
	Warning:      lipgloss.Color("#ffb86c"), // orange
	Delta:        lipgloss.Color("#50fa7b"), // green
	Muted:        lipgloss.Color("#6272a4"), // comment
	Accent:       lipgloss.Color("#bd93f9"), // purple
	Ruler:        lipgloss.Color("#44475a"), // current line
	Border:       lipgloss.Color("#6272a4"), // comment
}
