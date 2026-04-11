package main

import (
	"fmt"
	"os"
	"path/filepath"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/philsherry/playback/tui/editor"
	"github.com/philsherry/playback/tui/tape"
	"github.com/philsherry/playback/tui/ui"
	"github.com/spf13/cobra"
)

// Flags.
var (
	reportFlag       bool
	accessibleFlag   bool
	highContrastFlag bool
)

// rootCmd is the cobra root command. It expects a single positional argument:
// the path to a tape directory containing tape.yaml (required) and meta.yaml
// (optional). By default it starts the interactive TUI; with --report it
// prints a structured plain-text timing report instead.
var rootCmd = &cobra.Command{
	Use:   "playback-tui <tape-directory>",
	Short: "Post-production timing editor for playback tapes",
	Long: `A TUI for visualising and adjusting narration timing in playback tape files.

Use --report for a screen-reader-friendly plain-text timing report.
Use --accessible for a sequential interactive mode with no alt screen.`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		initCwd := os.Getenv("INIT_CWD")
		tapePath := resolvePathWithINIT_CWD(args[0], initCwd)

		// Determine the project root. INIT_CWD is set by npm to the
		// directory where "npm run" was invoked — that's the project root.
		// When running directly via "go run .", fall back to the parent of
		// the tui/ directory (i.e. the project root).
		projectRoot := initCwd
		if projectRoot == "" {
			if wd, err := os.Getwd(); err == nil {
				projectRoot = filepath.Dir(wd)
			}
		}

		// Load and validate the tape directory contents.
		data, err := tape.Load(tapePath)
		if err != nil {
			return fmt.Errorf("failed to load tape: %w", err)
		}

		status := tape.CheckBuildStatus(projectRoot, data.Tape)

		// --report: print a structured plain-text timing report and exit.
		if reportFlag {
			editor.WriteReport(os.Stdout, data, status)
			return nil
		}

		// --accessible: sequential interactive mode — no alt screen, no
		// redraws, line-by-line prompts. Works with screen readers.
		if accessibleFlag {
			editor.RunAccessible(os.Stdin, os.Stdout, &data, status, tape.DefaultNudgeStep)
			return nil
		}

		// Interactive TUI mode. Resolve theme: --high-contrast always wins;
		// otherwise use the XDG config theme (if set and recognised); fall
		// back to the default Tokyo Night Storm.
		theme := ui.TokyoNightStorm
		if highContrastFlag {
			theme = ui.HighContrast
		} else if cfg := tape.LoadXdgConfig(); cfg != nil && cfg.Theme != "" {
			if t, ok := ui.ThemeForName(cfg.Theme); ok {
				theme = t
			}
		}
		model := ui.NewModelWithTheme(data, projectRoot, theme)
		p := tea.NewProgram(model, tea.WithAltScreen())

		if _, err := p.Run(); err != nil {
			return fmt.Errorf("TUI error: %w", err)
		}

		return nil
	},
}

func init() {
	rootCmd.Flags().BoolVar(&reportFlag, "report", false,
		"Print a plain-text timing report instead of starting the TUI (screen-reader-friendly)")
	rootCmd.Flags().BoolVar(&accessibleFlag, "accessible", false,
		"Sequential interactive mode — no alt screen, line-by-line prompts (screen-reader-friendly)")
	rootCmd.Flags().BoolVar(&highContrastFlag, "high-contrast", false,
		"Use high-contrast theme for low-vision users (WCAG AAA contrast ratios)")
}

// resolvePathWithINIT_CWD resolves a tape path to an absolute path.
// When invoked via "cd tui && go run .", the working directory is tui/,
// but the user passes paths relative to the project root. npm sets
// INIT_CWD to the original directory where "npm run" was invoked, so
// we join against that. Falls back to filepath.Abs (which resolves
// against the actual working directory) when INIT_CWD is not set.
func resolvePathWithINIT_CWD(tapePath, initCwd string) string {
	if filepath.IsAbs(tapePath) {
		return tapePath
	}
	if initCwd != "" {
		return filepath.Join(initCwd, tapePath)
	}
	if abs, err := filepath.Abs(tapePath); err == nil {
		return abs
	}
	return tapePath
}

// Execute runs the root command. Called from main().
// Cobra handles argument validation and --help output automatically.
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
