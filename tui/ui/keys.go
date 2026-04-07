// Package ui provides the bubbletea TUI components for the playback timing
// editor — model, views, keybindings, themes, and Charm component integration.
package ui

import "github.com/charmbracelet/bubbles/key"

// KeyMap defines all keybindings for the TUI. It implements the
// help.KeyMap interface so the bubbles help component can render
// contextual keybinding hints automatically.
type KeyMap struct {
	// Navigation — move through the step list.
	Up   key.Binding
	Down key.Binding

	// Audio nudge — slide the narration .wav clip earlier/later.
	AudioLeft  key.Binding
	AudioRight key.Binding

	// Pause nudge — adjust the step's pause value (video timing).
	PauseUp   key.Binding
	PauseDown key.Binding

	// Editing
	EditPause key.Binding
	Undo      key.Binding
	Save      key.Binding

	// Pipeline
	RunFull    key.Binding
	RunVHSOnly key.Binding

	// General
	OpenTape   key.Binding
	ViewPrompt key.Binding
	EditMeta   key.Binding
	Deselect   key.Binding
	Help       key.Binding
	Quit       key.Binding
}

// DefaultKeyMap returns the default keybindings. All bindings include
// help text for display in the help component.
func DefaultKeyMap() KeyMap {
	return KeyMap{
		Up: key.NewBinding(
			key.WithKeys("k"),
			key.WithHelp("k", "up"),
		),
		Down: key.NewBinding(
			key.WithKeys("j"),
			key.WithHelp("j", "down"),
		),
		AudioLeft: key.NewBinding(
			key.WithKeys("h"),
			key.WithHelp("h", "audio ←"),
		),
		AudioRight: key.NewBinding(
			key.WithKeys("l"),
			key.WithHelp("l", "audio →"),
		),
		PauseUp: key.NewBinding(
			key.WithKeys("up"),
			key.WithHelp("↑", "pause +"),
		),
		PauseDown: key.NewBinding(
			key.WithKeys("down"),
			key.WithHelp("↓", "pause −"),
		),
		EditPause: key.NewBinding(
			key.WithKeys("e"),
			key.WithHelp("e", "edit pause"),
		),
		Undo: key.NewBinding(
			key.WithKeys("u"),
			key.WithHelp("u", "undo"),
		),
		Save: key.NewBinding(
			key.WithKeys("s"),
			key.WithHelp("s", "save"),
		),
		RunFull: key.NewBinding(
			key.WithKeys("r"),
			key.WithHelp("r", "run pipeline"),
		),
		RunVHSOnly: key.NewBinding(
			key.WithKeys("R"),
			key.WithHelp("R", "VHS only"),
		),
		OpenTape: key.NewBinding(
			key.WithKeys("o"),
			key.WithHelp("o", "open tape"),
		),
		ViewPrompt: key.NewBinding(
			key.WithKeys("m"),
			key.WithHelp("m", "view PROMPT.md"),
		),
		EditMeta: key.NewBinding(
			key.WithKeys("M"),
			key.WithHelp("M", "edit metadata"),
		),
		Deselect: key.NewBinding(
			key.WithKeys("esc"),
			key.WithHelp("esc", "deselect"),
		),
		Help: key.NewBinding(
			key.WithKeys("?"),
			key.WithHelp("?", "help"),
		),
		Quit: key.NewBinding(
			key.WithKeys("q", "ctrl+c"),
			key.WithHelp("q", "quit"),
		),
	}
}

// ShortHelp returns the keybindings for the short help view (one line).
func (k KeyMap) ShortHelp() []key.Binding {
	return []key.Binding{
		k.Up, k.Down,
		k.AudioLeft, k.AudioRight,
		k.PauseUp, k.PauseDown,
		k.Undo, k.Save,
		k.OpenTape, k.RunFull, k.Quit, k.Help,
	}
}

// FullHelp returns keybindings grouped by category for the expanded help view.
func (k KeyMap) FullHelp() [][]key.Binding {
	return [][]key.Binding{
		{k.Up, k.Down, k.Deselect},                             // navigation
		{k.AudioLeft, k.AudioRight},                            // audio nudge
		{k.PauseUp, k.PauseDown, k.EditPause, k.Undo, k.Save},  // pause editing
		{k.RunFull, k.RunVHSOnly},                              // pipeline
		{k.OpenTape, k.ViewPrompt, k.EditMeta, k.Help, k.Quit}, // general
	}
}
