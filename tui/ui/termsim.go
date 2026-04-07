package ui

import (
	"regexp"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/philsherry/playback/tui/tape"
)

// Terminal background colour — a dark shade that contrasts with the
// panel border background, mimicking a real terminal window.
const termBg = "#1a1b26"

// termSimStyle holds styles for the simulated terminal.
type termSimStyle struct {
	// cmdLine styles a full command line (prompt + command) with the
	// terminal background spanning the full width.
	cmdLine lipgloss.Style
	prompt  lipgloss.Style
	command lipgloss.Style
	cursor  lipgloss.Style
	muted   lipgloss.Style
	blank   lipgloss.Style // empty lines between commands
	caption lipgloss.Style
}

// newTermSimStyle creates styles for the terminal simulator.
func newTermSimStyle(t Theme) termSimStyle {
	bg := lipgloss.Color(termBg)

	return termSimStyle{
		cmdLine: lipgloss.NewStyle().
			Background(bg),
		prompt: lipgloss.NewStyle().
			Foreground(lipgloss.Color("#9ece6a")).
			Background(bg).
			Bold(true),
		command: lipgloss.NewStyle().
			Foreground(lipgloss.Color("#ff9900")).
			Background(bg),
		cursor: lipgloss.NewStyle().
			Foreground(lipgloss.Color(termBg)).
			Background(lipgloss.Color("#cc6600")),
		muted: lipgloss.NewStyle().
			Foreground(t.Muted).
			Background(bg),
		blank: lipgloss.NewStyle().
			Background(bg),
		caption: lipgloss.NewStyle().
			Foreground(lipgloss.Color("#ffffff")).
			Background(lipgloss.Color("#000000")).
			Padding(0, 1),
	}
}

// placeholderRe matches {{PLACEHOLDER_NAME}} in commands.
var placeholderRe = regexp.MustCompile(`\{\{\s*([A-Z0-9_]+)\s*\}\}`)

// resolvePlaceholders replaces {{KEY}} placeholders in a command string
// with their concrete values from the provided constants map.
func resolvePlaceholders(command string, constants map[string]string) string {
	return placeholderRe.ReplaceAllStringFunc(command, func(match string) string {
		key := placeholderRe.FindStringSubmatch(match)[1]
		if val, ok := constants[key]; ok {
			return val
		}
		return match // leave unknown placeholders as-is
	})
}

// captionHeight is the number of rows reserved for the caption bar
// at the bottom of the preview panel.
const captionHeight = 4

// RenderTerminalSim renders the preview panel content in two parts:
//   - Terminal area (top): accumulated commands up to the selected step
//   - Caption bar (bottom): narration text pinned to the bottom, like
//     real video captions
//
// Both parts are returned as a single string. The caller should set
// the terminal area in a viewport and render the caption bar below it.
//
// Returns termContent and captionContent separately so the caller can
// lay them out with proper pinning.
func RenderTerminalSim(
	steps []tape.Step,
	cursor int,
	width, height int,
	theme Theme,
	constants map[string]string,
) (termContent string, captionContent string) {
	if len(steps) == 0 || width < 10 || height < 2 {
		return "", ""
	}

	styles := newTermSimStyle(theme)

	var termLines []string

	end := max(cursor, 0)
	end = min(end, len(steps)-1)

	// padLine pads a line with the terminal background to fill the width.
	padLine := func(content string) string {
		return styles.cmdLine.Width(width).Render(content)
	}

	for i := 0; i <= end; i++ {
		step := steps[i]

		switch step.Action {
		case "type":
			if step.Command == "" {
				continue
			}

			// Resolve placeholders like {{GDS_SKILLS_ROOT}}.
			cmd := resolvePlaceholders(step.Command, constants)
			promptStr := styles.prompt.Render("$ ")

			if i == end {
				// Current step — show with block cursor.
				termLines = append(termLines, padLine(
					promptStr+styles.command.Render(cmd)+styles.cursor.Render(" "),
				))
			} else {
				// Past step — command was typed and Enter pressed.
				termLines = append(termLines, padLine(
					promptStr+styles.command.Render(cmd),
				))
			}

		case "key":
			// Key steps send a single keystroke — they don't show a prompt
			// or change the terminal visually. The TUI they're driving
			// handles the rendering.

		case "run":
			if i == end {
				termLines = append(termLines, padLine(
					styles.muted.Render("  (running…)"),
				))
			}
			if i < end {
				// Blank line with terminal background (simulates output gap).
				termLines = append(termLines, padLine(""))
			}

		case "comment":
			// Comments don't change the terminal screen.
		}
	}

	termContent = strings.Join(termLines, "\n")

	// Caption bar — narration text for the current step, pinned at the
	// bottom like real video captions.
	if end >= 0 && end < len(steps) {
		step := steps[end]
		if step.Narration != "" {
			captionContent = renderCaption(step.Narration, width, styles)
		}
	}

	return termContent, captionContent
}

// renderCaption renders narration text in a caption bar style — white text
// on a dark background, word-wrapped to fit the width.
func renderCaption(text string, width int, styles termSimStyle) string {
	wrapWidth := width - 2 // -2 for padding
	if wrapWidth < 10 {
		wrapWidth = 10
	}

	wrapped := wordWrap(text, wrapWidth)

	// Limit to captionHeight lines.
	lines := strings.Split(wrapped, "\n")
	if len(lines) > captionHeight {
		lines = lines[len(lines)-captionHeight:]
	}

	return styles.caption.Width(width).Render(strings.Join(lines, "\n"))
}

// wordWrap wraps text at word boundaries to fit within maxWidth characters.
func wordWrap(text string, maxWidth int) string {
	words := strings.Fields(text)
	if len(words) == 0 {
		return ""
	}

	var lines []string
	currentLine := words[0]

	for _, word := range words[1:] {
		if len(currentLine)+1+len(word) <= maxWidth {
			currentLine += " " + word
		} else {
			lines = append(lines, currentLine)
			currentLine = word
		}
	}

	lines = append(lines, currentLine)
	return strings.Join(lines, "\n")
}
