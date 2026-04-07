// Package editor provides interactive editing modes for playback tapes.
//
// The accessible mode is a sequential, line-by-line interactive interface
// for adjusting narration timing. It uses no alternate screen buffer, no
// full-screen redraws, and no spatial layout — just standard input/output
// that screen readers can follow.
package editor

import (
	"bufio"
	"fmt"
	"io"
	"strings"

	"github.com/philsherry/playback/tui/tape"
)

// RunAccessible starts the accessible interactive mode. It reads from r
// (typically os.Stdin) and writes to w (typically os.Stdout). The user
// steps through clips one at a time and can nudge pause values, then
// the session prints a summary of changes on exit.
//
// Commands (one per line):
//
//	n / next / Enter  — move to the next step
//	p / prev          — move to the previous step
//	+ / right / l     — increase pause by nudgeStep
//	- / left / h      — decrease pause by nudgeStep
//	u / undo          — undo the last change
//	s / status        — reprint the current step
//	q / quit          — exit
//	? / help          — show available commands
func RunAccessible(
	r io.Reader,
	w io.Writer,
	data *tape.TapeData,
	status tape.BuildStatus,
	nudgeStep float64,
) {
	steps := data.Tape.Steps
	scanner := bufio.NewScanner(r)
	cursor := 0
	undoStack := []pauseEntry{}

	// Welcome message.
	fmt.Fprintln(w, "Playback timing editor — accessible mode")
	fmt.Fprintln(w, strings.Repeat("-", 50))
	fmt.Fprintf(w, "Tape: %s\n", data.Tape.Title)
	fmt.Fprintf(w, "Steps: %d, estimated duration: ~%.1fs\n", len(steps), tape.TotalDuration(steps))

	switch {
	case status.Built():
		fmt.Fprintln(w, "Build status: Built")
	case status.Partial():
		fmt.Fprintln(w, "Build status: Partial")
	default:
		fmt.Fprintln(w, "Build status: Not built")
	}

	fmt.Fprintln(w)
	fmt.Fprintln(w, "Type ? for help, or press Enter to step through clips.")
	fmt.Fprintln(w)

	// Print the first step.
	announceStep(w, steps, cursor, nudgeStep)

	// Interactive loop.
	for {
		fmt.Fprint(w, "> ")
		if !scanner.Scan() {
			break
		}

		input := strings.TrimSpace(scanner.Text())

		switch strings.ToLower(input) {
		case "", "n", "next":
			if cursor < len(steps)-1 {
				cursor++
				announceStep(w, steps, cursor, nudgeStep)
			} else {
				fmt.Fprintln(w, "Already at the last step.")
			}

		case "p", "prev":
			if cursor > 0 {
				cursor--
				announceStep(w, steps, cursor, nudgeStep)
			} else {
				fmt.Fprintln(w, "Already at the first step.")
			}

		case "+", "right", "l":
			undoStack = append(
				undoStack,
				pauseEntry{index: cursor, value: currentPause(steps[cursor])},
			)
			newPause := tape.NudgePause(steps[cursor], nudgeStep)
			steps[cursor].Pause = &newPause
			fmt.Fprintf(w, "Pause increased to %.2fs\n", newPause)
			announceStep(w, steps, cursor, nudgeStep)

		case "-", "left", "h":
			undoStack = append(
				undoStack,
				pauseEntry{index: cursor, value: currentPause(steps[cursor])},
			)
			newPause := tape.NudgePause(steps[cursor], -nudgeStep)
			steps[cursor].Pause = &newPause
			fmt.Fprintf(w, "Pause decreased to %.2fs\n", newPause)
			announceStep(w, steps, cursor, nudgeStep)

		case "u", "undo":
			if len(undoStack) == 0 {
				fmt.Fprintln(w, "Nothing to undo.")
			} else {
				entry := undoStack[len(undoStack)-1]
				undoStack = undoStack[:len(undoStack)-1]
				val := entry.value
				steps[entry.index].Pause = &val
				fmt.Fprintf(w, "Undone. Step %d pause restored to %.2fs\n", entry.index+1, val)
				if entry.index == cursor {
					announceStep(w, steps, cursor, nudgeStep)
				}
			}

		case "s", "status":
			announceStep(w, steps, cursor, nudgeStep)

		case "?", "help":
			printAccessibleHelp(w, nudgeStep)

		case "q", "quit":
			// Print summary of changes.
			if len(undoStack) > 0 {
				fmt.Fprintf(w, "\n%d change(s) made during this session.\n", len(undoStack))
				fmt.Fprintln(w, "Note: changes are held in memory. Save support coming soon.")
			} else {
				fmt.Fprintln(w, "\nNo changes made.")
			}
			return

		default:
			fmt.Fprintf(w, "Unknown command: %q. Type ? for help.\n", input)
		}
	}
}

// pauseEntry records a single undo-able change for the accessible mode.
type pauseEntry struct {
	index int
	value float64
}

// currentPause returns the effective pause value for a step.
func currentPause(step tape.Step) float64 {
	if step.Pause != nil {
		return *step.Pause
	}
	return tape.DefaultPause
}

// announceStep prints a full description of the step at the given index,
// designed to be read sequentially by a screen reader.
func announceStep(w io.Writer, steps []tape.Step, index int, nudgeStep float64) {
	step := steps[index]
	startTime := tape.StepStartTime(steps, index)
	dur := tape.StepDuration(step)
	pause := currentPause(step)

	fmt.Fprintf(w, "\nStep %d of %d: %s\n", index+1, len(steps), step.Action)
	fmt.Fprintf(w, "  Start time: %.2fs\n", startTime)
	fmt.Fprintf(w, "  Duration: %.2fs\n", dur)
	fmt.Fprintf(w, "  Pause: %.2fs\n", pause)

	if step.Action == "type" && step.Command != "" {
		typingTime := float64(len(step.Command)*tape.TypingSpeedMS) / 1000.0
		fmt.Fprintf(w, "  Command: %s (typing: %.2fs)\n", step.Command, typingTime)
	}

	if step.Narration != "" {
		narrDur := tape.NarrationDuration(step.Narration)
		fmt.Fprintf(w, "  Narration (~%.1fs): %s\n", narrDur, step.Narration)
	} else {
		fmt.Fprintln(w, "  No narration on this step.")
	}

	fmt.Fprintf(w, "  Nudge: +/- adjusts pause by %.2fs\n", nudgeStep)
}

// printAccessibleHelp prints the available commands for the accessible mode.
func printAccessibleHelp(w io.Writer, nudgeStep float64) {
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Available commands:")
	fmt.Fprintln(w, "  Enter or n  — next step")
	fmt.Fprintln(w, "  p           — previous step")
	fmt.Fprintf(w, "  + or l      — increase pause by %.2fs\n", nudgeStep)
	fmt.Fprintf(w, "  - or h      — decrease pause by %.2fs\n", nudgeStep)
	fmt.Fprintln(w, "  u           — undo last change")
	fmt.Fprintln(w, "  s           — reprint current step")
	fmt.Fprintln(w, "  ?           — this help")
	fmt.Fprintln(w, "  q           — quit")
	fmt.Fprintln(w)
}
