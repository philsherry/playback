package tape

import (
	"math"
	"strings"
)

// Timing constants ported from the TypeScript pipeline (src/constants.ts).
// These must stay in sync — the TUI uses them to estimate durations that
// match what the pipeline will actually produce.
const (
	// TypingSpeedMS is the delay between each character when VHS types a
	// command. The TypeScript pipeline uses "75ms" as the VHS Type speed.
	TypingSpeedMS = 75

	// WordsPerMinute is the assumed speech rate for narration duration
	// estimates. piper-tts output varies, but 150 WPM is a reasonable
	// average for the English voices we use.
	WordsPerMinute = 150

	// MinNarrationDuration is the floor for any narration segment. Even
	// a single word gets at least this many seconds, to avoid unnaturally
	// short audio clips.
	MinNarrationDuration = 1.5

	// DefaultPause is used when a step has no explicit pause value set.
	// Matches the TypeScript pipeline's fallback of 0.5 seconds.
	DefaultPause = 0.5

	// DefaultNudgeStep is the amount (in seconds) each arrow-key press
	// shifts a clip's pause value. Configurable via nudgeStep in
	// playback.config.ts; this is the fallback when not set.
	DefaultNudgeStep = 0.25
)

// NarrationDuration estimates audio duration in seconds from the narration
// text, using a fixed words-per-minute rate. Returns 0 for empty text.
// For non-empty text, the result is floored at MinNarrationDuration to
// prevent unnaturally short clips.
func NarrationDuration(text string) float64 {
	words := len(strings.Fields(text))
	if words == 0 {
		return 0
	}
	dur := float64(words) / float64(WordsPerMinute) * 60.0
	return math.Max(dur, MinNarrationDuration)
}

// StepDuration returns the estimated duration of a single step in seconds.
//
// For "type" steps: typing time (command length * 75ms) + pause.
// For "run" and "comment" steps: just the pause value.
//
// When narration is present, the result is the greater of the base duration
// and the estimated narration duration — the step must be at least as long
// as its voiceover.
func StepDuration(step Step) float64 {
	pause := DefaultPause
	if step.Pause != nil {
		pause = *step.Pause
	}

	var base float64
	if step.Action == "type" {
		// Each character takes TypingSpeedMS milliseconds to appear.
		typingTime := float64(len(step.Command)*TypingSpeedMS) / 1000.0
		base = typingTime + pause
	} else {
		base = pause
	}

	// If narration is present, the step must be at least as long as the
	// voiceover. This prevents the next step from starting before the
	// narration finishes.
	if step.Narration != "" {
		narrDur := NarrationDuration(step.Narration)
		return math.Max(base, narrDur)
	}

	return base
}

// MinPause returns the minimum pause value for a step. For "type" steps
// this is 0 (the typing animation has its own duration independent of
// pause). For all other steps the minimum is also 0 — a pause of 0 means
// the step starts immediately after the previous one ends.
func MinPause() float64 {
	return 0
}

// NudgePause adjusts a step's pause value by delta (positive = shift right,
// negative = shift left). The result is clamped to MinPause on the low end.
// Returns the new pause value.
func NudgePause(step Step, delta float64) float64 {
	current := DefaultPause
	if step.Pause != nil {
		current = *step.Pause
	}
	newPause := current + delta
	if newPause < MinPause() {
		newPause = MinPause()
	}
	return newPause
}

// StepStartTime returns the cumulative start time (in seconds) for the step
// at the given index. This is the sum of all preceding step durations.
// An index of 0 always returns 0. An index beyond the slice length is
// clamped to the total duration.
func StepStartTime(steps []Step, index int) float64 {
	var t float64
	for i := 0; i < index && i < len(steps); i++ {
		t += StepDuration(steps[i])
	}
	return t
}

// TotalDuration returns the total estimated duration across all steps, in
// seconds. This is the same as StepStartTime(steps, len(steps)).
func TotalDuration(steps []Step) float64 {
	var t float64
	for _, s := range steps {
		t += StepDuration(s)
	}
	return t
}

// Overlap describes a collision between two narration segments where one
// hasn't finished before the next begins.
type Overlap struct {
	// StepA is the index of the first (earlier) step.
	StepA int
	// StepB is the index of the second (later) step whose narration starts
	// before StepA's narration ends.
	StepB int
	// Amount is the overlap duration in seconds.
	Amount float64
}

// DetectOverlaps checks all adjacent narrated steps for timing collisions.
// A collision occurs when step A's audio (accounting for narrationOffset)
// hasn't finished before step B's audio starts. Only adjacent pairs where
// both steps have narration are checked.
func DetectOverlaps(steps []Step) []Overlap {
	var overlaps []Overlap

	for i := 0; i < len(steps)-1; i++ {
		if steps[i].Narration == "" {
			continue
		}

		// Find the next step that has narration.
		for j := i + 1; j < len(steps); j++ {
			if steps[j].Narration == "" {
				continue
			}

			// Audio start = step start + narration offset.
			offsetA := 0.0
			if steps[i].NarrationOffset != nil {
				offsetA = *steps[i].NarrationOffset
			}
			offsetB := 0.0
			if steps[j].NarrationOffset != nil {
				offsetB = *steps[j].NarrationOffset
			}

			audioStartA := StepStartTime(steps, i) + offsetA
			audioEndA := audioStartA + NarrationDuration(steps[i].Narration)
			audioStartB := StepStartTime(steps, j) + offsetB

			if audioEndA > audioStartB {
				overlaps = append(overlaps, Overlap{
					StepA:  i,
					StepB:  j,
					Amount: audioEndA - audioStartB,
				})
			}
			break // only check the next narrated step
		}
	}

	return overlaps
}
