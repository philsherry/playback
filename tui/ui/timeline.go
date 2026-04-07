package ui

import (
	"fmt"
	"math"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/philsherry/playback/tui/tape"
)

// clip represents a narration segment positioned on the horizontal timeline.
type clip struct {
	stepIndex int    // index into the step slice
	startCol  int    // first column on the bar (0-based)
	endCol    int    // last column (exclusive)
	label     string // text to show inside the block
	lane      int    // vertical lane (0 = top, assigned during stacking)
}

// renderAudioTimeline builds the horizontal clip bar visualisation.
// width is the available character width for the bar area.
// height is the maximum number of rows available for lanes + ruler.
// Returns the rendered string.
func (m Model) renderAudioTimeline(width, height int) string {
	steps := m.tapeData.Tape.Steps
	totalDur := tape.TotalDuration(steps)
	if totalDur == 0 || width < 10 {
		return ""
	}

	// Build overlap set for colouring.
	overlapSteps := make(map[int]bool)
	for _, o := range m.overlaps {
		overlapSteps[o.StepA] = true
		overlapSteps[o.StepB] = true
	}

	// Build clips for narrated steps only.
	var clips []clip
	for i, step := range steps {
		if step.Narration == "" {
			continue
		}
		startTime := tape.StepStartTime(steps, i)
		narrDur := tape.NarrationDuration(step.Narration)

		// Apply narration offset — shifts the audio clip position.
		offset := 0.0
		if step.NarrationOffset != nil {
			offset = *step.NarrationOffset
		}
		audioStart := startTime + offset

		startCol := int(math.Floor(audioStart / totalDur * float64(width)))
		endCol := int(math.Ceil((audioStart + narrDur) / totalDur * float64(width)))

		// Clamp to bounds.
		if startCol < 0 {
			startCol = 0
		}
		if endCol > width {
			endCol = width
		}
		// Minimum 1 char wide.
		if endCol <= startCol {
			endCol = startCol + 1
		}

		label := fmt.Sprintf("%d", i+1)
		clips = append(clips, clip{
			stepIndex: i,
			startCol:  startCol,
			endCol:    endCol,
			label:     label,
		})
	}

	// Assign lanes — stack clips that overlap horizontally.
	assignLanes(clips)

	// Determine how many lanes we need.
	maxLane := 0
	for _, c := range clips {
		if c.lane > maxLane {
			maxLane = c.lane
		}
	}
	numLanes := maxLane + 1

	// Cap lanes to available height minus 2 (ruler + scale).
	maxLaneRows := height - 2
	if maxLaneRows < 1 {
		maxLaneRows = 1
	}
	if numLanes > maxLaneRows {
		numLanes = maxLaneRows
	}

	// Render each lane row.
	var rows []string
	for lane := 0; lane < numLanes; lane++ {
		row := m.renderLane(clips, lane, width, overlapSteps)
		rows = append(rows, row)
	}

	// Render the ruler.
	rows = append(rows, m.renderRuler(width, totalDur))

	return strings.Join(rows, "\n")
}

// renderLane renders a single horizontal lane of clip blocks.
func (m Model) renderLane(clips []clip, lane, width int, overlapSteps map[int]bool) string {
	// Build a character buffer for the lane.
	buf := make([]rune, width)
	styles := make([]lipgloss.Style, width)
	defaultStyle := lipgloss.NewStyle().Foreground(m.theme.Ruler)

	for i := range buf {
		buf[i] = ' '
		styles[i] = defaultStyle
	}

	for _, c := range clips {
		if c.lane != lane {
			continue
		}

		// Choose style based on state.
		style := lipgloss.NewStyle().Foreground(m.theme.Clip)
		blockChar := '█'
		if c.stepIndex == m.cursor {
			style = lipgloss.NewStyle().Foreground(m.theme.ClipSelected).Bold(true)
		} else if overlapSteps[c.stepIndex] {
			style = lipgloss.NewStyle().Foreground(m.theme.Overlap).Bold(true)
		}

		// Fill the block.
		for col := c.startCol; col < c.endCol && col < width; col++ {
			buf[col] = blockChar
			styles[col] = style
		}

		// Place the label in the centre of the block.
		blockWidth := c.endCol - c.startCol
		if blockWidth >= len(c.label) {
			labelStart := c.startCol + (blockWidth-len(c.label))/2
			for j, ch := range c.label {
				col := labelStart + j
				if col >= 0 && col < width {
					buf[col] = ch
				}
			}
		}
	}

	// Render with per-character styling.
	var sb strings.Builder
	for i, ch := range buf {
		sb.WriteString(styles[i].Render(string(ch)))
	}
	return sb.String()
}

// renderRuler renders the time scale at the bottom of the clip area.
func (m Model) renderRuler(width int, totalDur float64) string {
	rulerStyle := lipgloss.NewStyle().Foreground(m.theme.Ruler)
	scaleStyle := lipgloss.NewStyle().Foreground(m.theme.Muted)

	// Build ruler line with tick marks.
	ruler := make([]rune, width)
	for i := range ruler {
		ruler[i] = '─'
	}

	// Determine tick interval — aim for roughly one tick every 10 chars.
	tickInterval := chooseTickInterval(totalDur, width)
	if tickInterval <= 0 {
		tickInterval = totalDur
	}

	// Build scale labels.
	scale := make([]rune, width)
	for i := range scale {
		scale[i] = ' '
	}

	for t := 0.0; t <= totalDur; t += tickInterval {
		col := int(t / totalDur * float64(width-1))
		if col >= 0 && col < width {
			ruler[col] = '┼'
		}

		label := formatTimeShort(t)
		labelStart := col
		// Right-align the last label.
		if col+len(label) > width {
			labelStart = width - len(label)
		}
		for j, ch := range label {
			pos := labelStart + j
			if pos >= 0 && pos < width {
				scale[pos] = ch
			}
		}
	}

	return rulerStyle.Render(string(ruler)) + "\n" + scaleStyle.Render(string(scale))
}

// assignLanes assigns each clip to a lane such that no two clips in the
// same lane overlap horizontally. Uses a greedy first-fit algorithm.
func assignLanes(clips []clip) {
	// laneEnds tracks the rightmost column used by each lane.
	var laneEnds []int

	for i := range clips {
		placed := false
		for lane, end := range laneEnds {
			if clips[i].startCol >= end {
				clips[i].lane = lane
				laneEnds[lane] = clips[i].endCol
				placed = true
				break
			}
		}
		if !placed {
			clips[i].lane = len(laneEnds)
			laneEnds = append(laneEnds, clips[i].endCol)
		}
	}
}

// chooseTickInterval picks a clean time interval for ruler ticks.
func chooseTickInterval(totalDur float64, width int) float64 {
	if width <= 0 {
		return totalDur
	}
	// Aim for a tick every ~12 characters.
	approxTicks := float64(width) / 12.0
	if approxTicks < 1 {
		approxTicks = 1
	}
	raw := totalDur / approxTicks

	// Snap to a clean value.
	candidates := []float64{1, 2, 5, 10, 15, 20, 30, 60}
	for _, c := range candidates {
		if c >= raw {
			return c
		}
	}
	return math.Ceil(raw/60) * 60
}

// formatTimeShort formats seconds as a compact time string.
func formatTimeShort(seconds float64) string {
	if seconds < 60 {
		return fmt.Sprintf("%.0fs", seconds)
	}
	m := int(seconds) / 60
	s := int(seconds) % 60
	if s == 0 {
		return fmt.Sprintf("%dm", m)
	}
	return fmt.Sprintf("%dm%ds", m, s)
}
