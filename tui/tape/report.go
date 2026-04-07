package tape

import (
	"fmt"
	"io"
	"strings"
)

// WriteReport writes a structured plain-text timing report to w. This is
// the accessible alternative to the TUI — it outputs the same information
// that the timeline and inspector panels show, but as sequential text that
// screen readers can parse line by line.
//
// The report includes:
//   - Tape title and output path
//   - Build status
//   - Per-step breakdown: index, action, start time, duration, pause, narration
//   - Overlap warnings where narration segments would collide
//   - Total duration summary
func WriteReport(w io.Writer, data TapeData, status BuildStatus) {
	steps := data.Tape.Steps

	// Header.
	fmt.Fprintf(w, "Tape: %s\n", data.Tape.Title)
	fmt.Fprintf(w, "Output: %s\n", data.Tape.Output)
	fmt.Fprintf(w, "Directory: %s\n", data.Dir)

	// Build status.
	switch {
	case status.Built():
		fmt.Fprintf(w, "Build status: Built (%s)\n", status.MP4Path)
	case status.Partial():
		fmt.Fprintln(w, "Build status: Partial (raw recording exists, no final video)")
	default:
		fmt.Fprintln(w, "Build status: Not built")
	}

	// Metadata.
	if data.Meta.Title != "" {
		fmt.Fprintf(w, "Series: %s", data.Meta.Series)
		if data.Meta.Episode != nil {
			fmt.Fprintf(w, ", Episode %d", *data.Meta.Episode)
		}
		fmt.Fprintln(w)
	}
	if len(data.Meta.Voices) > 0 {
		fmt.Fprintf(w, "Voices: %s\n", strings.Join(data.Meta.Voices, ", "))
	} else {
		fmt.Fprintln(w, "Voices: northern_english_male (default)")
	}

	fmt.Fprintln(w)

	// Step table header.
	fmt.Fprintln(w, "Steps:")
	fmt.Fprintln(w, strings.Repeat("-", 78))
	fmt.Fprintf(w, "%-4s  %-7s  %8s  %8s  %8s  %s\n",
		"#", "Action", "Start", "Duration", "Pause", "Narration")
	fmt.Fprintln(w, strings.Repeat("-", 78))

	// Step rows.
	var overlaps []string
	for i, step := range steps {
		startTime := StepStartTime(steps, i)
		dur := StepDuration(step)
		pause := DefaultPause
		if step.Pause != nil {
			pause = *step.Pause
		}

		narr := ""
		if step.Narration != "" {
			narr = step.Narration
			// Truncate for the table — full text is accessible below.
			if len(narr) > 40 {
				narr = narr[:39] + "…"
			}
		}

		fmt.Fprintf(w, "%-4d  %-7s  %7.2fs  %7.2fs  %7.2fs  %s\n",
			i+1, step.Action, startTime, dur, pause, narr)

		// Check for overlap with next step's narration.
		if step.Narration != "" && i+1 < len(steps) {
			narrEnd := startTime + NarrationDuration(step.Narration)
			nextStart := StepStartTime(steps, i+1)
			if narrEnd > nextStart && steps[i+1].Narration != "" {
				overlaps = append(overlaps, fmt.Sprintf(
					"  WARNING: Step %d narration ends at %.2fs but step %d starts at %.2fs (overlap: %.2fs)",
					i+1,
					narrEnd,
					i+2,
					nextStart,
					narrEnd-nextStart,
				))
			}
		}
	}

	fmt.Fprintln(w, strings.Repeat("-", 78))

	// Totals.
	totalDur := TotalDuration(steps)
	narrCount := 0
	for _, s := range steps {
		if s.Narration != "" {
			narrCount++
		}
	}
	fmt.Fprintf(w, "Total: %d steps, %d with narration, ~%.1fs estimated duration\n",
		len(steps), narrCount, totalDur)

	// Overlaps.
	if len(overlaps) > 0 {
		fmt.Fprintln(w)
		fmt.Fprintf(w, "Overlap warnings (%d):\n", len(overlaps))
		for _, o := range overlaps {
			fmt.Fprintln(w, o)
		}
	} else {
		fmt.Fprintln(w)
		fmt.Fprintln(w, "No overlapping narration detected.")
	}

	// Full narration text for screen readers — the truncated table
	// isn't sufficient, so we list each narration in full below.
	hasNarration := false
	for _, s := range steps {
		if s.Narration != "" {
			hasNarration = true
			break
		}
	}
	if hasNarration {
		fmt.Fprintln(w)
		fmt.Fprintln(w, "Full narration text:")
		fmt.Fprintln(w, strings.Repeat("-", 78))
		for i, step := range steps {
			if step.Narration == "" {
				continue
			}
			narrDur := NarrationDuration(step.Narration)
			fmt.Fprintf(w, "Step %d (%s, ~%.1fs):\n", i+1, step.Action, narrDur)
			fmt.Fprintf(w, "  %s\n\n", step.Narration)
		}
	}
}
