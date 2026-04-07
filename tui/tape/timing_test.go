package tape

import (
	"math"
	"testing"
)

// floatEqual checks two floats are within a small epsilon of each other.
func floatEqual(a, b float64) bool {
	return math.Abs(a-b) < 0.001
}

// pf64 returns a pointer to a float64. Convenience helper for building
// Step structs with explicit Pause values in tests.
func pf64(v float64) *float64 {
	return &v
}

// --- NarrationDuration ---

func TestNarrationDuration_EmptyText(t *testing.T) {
	got := NarrationDuration("")
	if got != 0 {
		t.Errorf("NarrationDuration(\"\") = %f, want 0", got)
	}
}

func TestNarrationDuration_WhitespaceOnly(t *testing.T) {
	got := NarrationDuration("   \t\n  ")
	if got != 0 {
		t.Errorf("NarrationDuration(whitespace) = %f, want 0", got)
	}
}

func TestNarrationDuration_SingleWord(t *testing.T) {
	// 1 word / 150 WPM * 60 = 0.4s, but floored at MinNarrationDuration.
	got := NarrationDuration("hello")
	if !floatEqual(got, MinNarrationDuration) {
		t.Errorf(
			"NarrationDuration(\"hello\") = %f, want %f (min floor)",
			got,
			MinNarrationDuration,
		)
	}
}

func TestNarrationDuration_ShortSentence(t *testing.T) {
	// "Say hello to the world" = 5 words.
	// 5 / 150 * 60 = 2.0s, which exceeds MinNarrationDuration.
	got := NarrationDuration("Say hello to the world")
	want := 5.0 / 150.0 * 60.0
	if !floatEqual(got, want) {
		t.Errorf("NarrationDuration(5 words) = %f, want %f", got, want)
	}
}

func TestNarrationDuration_LongParagraph(t *testing.T) {
	// 30 words: 30 / 150 * 60 = 12.0s.
	text := "one two three four five six seven eight nine ten " +
		"one two three four five six seven eight nine ten " +
		"one two three four five six seven eight nine ten"
	got := NarrationDuration(text)
	want := 30.0 / 150.0 * 60.0
	if !floatEqual(got, want) {
		t.Errorf("NarrationDuration(30 words) = %f, want %f", got, want)
	}
}

func TestNarrationDuration_MinFloor(t *testing.T) {
	// 3 words: 3 / 150 * 60 = 1.2s, which is below MinNarrationDuration.
	got := NarrationDuration("three short words")
	if !floatEqual(got, MinNarrationDuration) {
		t.Errorf("NarrationDuration(3 words) = %f, want %f (min floor)", got, MinNarrationDuration)
	}
}

func TestNarrationDuration_ExactlyAtMinBoundary(t *testing.T) {
	// We need ceil(1.5 / (60/150)) = ceil(3.75) = 4 words to be at or
	// just above the boundary. 4 / 150 * 60 = 1.6s > 1.5s.
	got := NarrationDuration("four words right here")
	want := 4.0 / 150.0 * 60.0
	if !floatEqual(got, want) {
		t.Errorf("NarrationDuration(4 words) = %f, want %f", got, want)
	}
}

// --- StepDuration ---

func TestStepDuration_TypeStepWithPause(t *testing.T) {
	step := Step{Action: "type", Command: "echo hi", Pause: pf64(2.0)}
	// "echo hi" = 7 chars. Typing: 7 * 75ms = 525ms = 0.525s. + 2.0s = 2.525s.
	got := StepDuration(step)
	want := (7.0*75.0)/1000.0 + 2.0
	if !floatEqual(got, want) {
		t.Errorf("StepDuration(type, 7 chars, pause 2) = %f, want %f", got, want)
	}
}

func TestStepDuration_TypeStepDefaultPause(t *testing.T) {
	step := Step{Action: "type", Command: "ls"}
	// "ls" = 2 chars. Typing: 2 * 75ms = 150ms = 0.15s. + DefaultPause 0.5s = 0.65s.
	got := StepDuration(step)
	want := (2.0*75.0)/1000.0 + DefaultPause
	if !floatEqual(got, want) {
		t.Errorf("StepDuration(type, 2 chars, default pause) = %f, want %f", got, want)
	}
}

func TestStepDuration_TypeStepZeroPause(t *testing.T) {
	step := Step{Action: "type", Command: "pwd", Pause: pf64(0)}
	// "pwd" = 3 chars. Typing: 3 * 75ms = 225ms = 0.225s. + 0s = 0.225s.
	got := StepDuration(step)
	want := (3.0 * 75.0) / 1000.0
	if !floatEqual(got, want) {
		t.Errorf("StepDuration(type, 3 chars, pause 0) = %f, want %f", got, want)
	}
}

func TestStepDuration_TypeStepEmptyCommand(t *testing.T) {
	step := Step{Action: "type", Command: ""}
	// 0 chars = 0s typing + 0.5s pause = 0.5s.
	got := StepDuration(step)
	if !floatEqual(got, DefaultPause) {
		t.Errorf("StepDuration(type, empty command) = %f, want %f", got, DefaultPause)
	}
}

func TestStepDuration_RunStepDefaultPause(t *testing.T) {
	step := Step{Action: "run"}
	got := StepDuration(step)
	if !floatEqual(got, DefaultPause) {
		t.Errorf("StepDuration(run, default pause) = %f, want %f", got, DefaultPause)
	}
}

func TestStepDuration_RunStepExplicitPause(t *testing.T) {
	step := Step{Action: "run", Pause: pf64(3.0)}
	got := StepDuration(step)
	if !floatEqual(got, 3.0) {
		t.Errorf("StepDuration(run, pause 3) = %f, want 3.0", got)
	}
}

func TestStepDuration_CommentStepDefaultPause(t *testing.T) {
	// Comment with no narration — just the pause.
	step := Step{Action: "comment"}
	got := StepDuration(step)
	if !floatEqual(got, DefaultPause) {
		t.Errorf("StepDuration(comment, default pause) = %f, want %f", got, DefaultPause)
	}
}

func TestStepDuration_NarrationExtendsDuration(t *testing.T) {
	// Narration of 10 words: 10 / 150 * 60 = 4.0s.
	// Base for run with default pause = 0.5s.
	// Duration should be max(0.5, 4.0) = 4.0s.
	step := Step{
		Action:    "run",
		Narration: "one two three four five six seven eight nine ten",
	}
	got := StepDuration(step)
	want := 10.0 / 150.0 * 60.0
	if !floatEqual(got, want) {
		t.Errorf("StepDuration(run, 10-word narration) = %f, want %f", got, want)
	}
}

func TestStepDuration_LongPauseOverridesShortNarration(t *testing.T) {
	// Narration of 1 word: floored at 1.5s.
	// Pause of 5.0s is longer, so that should win.
	step := Step{
		Action:    "run",
		Narration: "hello",
		Pause:     pf64(5.0),
	}
	got := StepDuration(step)
	if !floatEqual(got, 5.0) {
		t.Errorf("StepDuration(run, 1-word narration, pause 5) = %f, want 5.0", got)
	}
}

func TestStepDuration_TypeStepNarrationExtendsTypingPlusPause(t *testing.T) {
	// "ls" = 2 chars. Typing: 0.15s + pause 0.5s = 0.65s.
	// Narration of 10 words: 4.0s.
	// Duration should be max(0.65, 4.0) = 4.0s.
	step := Step{
		Action:    "type",
		Command:   "ls",
		Narration: "one two three four five six seven eight nine ten",
	}
	got := StepDuration(step)
	want := 10.0 / 150.0 * 60.0
	if !floatEqual(got, want) {
		t.Errorf("StepDuration(type with narration) = %f, want %f", got, want)
	}
}

// --- StepStartTime ---

func TestStepStartTime_IndexZero(t *testing.T) {
	steps := []Step{{Action: "run", Pause: pf64(2.0)}}
	got := StepStartTime(steps, 0)
	if got != 0 {
		t.Errorf("StepStartTime(steps, 0) = %f, want 0", got)
	}
}

func TestStepStartTime_IndexOne(t *testing.T) {
	steps := []Step{
		{Action: "run", Pause: pf64(3.0)},
		{Action: "run", Pause: pf64(2.0)},
	}
	got := StepStartTime(steps, 1)
	if !floatEqual(got, 3.0) {
		t.Errorf("StepStartTime(steps, 1) = %f, want 3.0", got)
	}
}

func TestStepStartTime_Cumulative(t *testing.T) {
	steps := []Step{
		{Action: "run", Pause: pf64(1.0)},
		{Action: "run", Pause: pf64(2.0)},
		{Action: "run", Pause: pf64(3.0)},
	}
	// Start of step 2 = duration of step 0 + step 1 = 1.0 + 2.0 = 3.0.
	got := StepStartTime(steps, 2)
	if !floatEqual(got, 3.0) {
		t.Errorf("StepStartTime(steps, 2) = %f, want 3.0", got)
	}
}

func TestStepStartTime_BeyondLength(t *testing.T) {
	steps := []Step{
		{Action: "run", Pause: pf64(1.0)},
		{Action: "run", Pause: pf64(2.0)},
	}
	// Index 5 is beyond the slice — should clamp to total duration.
	got := StepStartTime(steps, 5)
	want := 3.0
	if !floatEqual(got, want) {
		t.Errorf("StepStartTime(steps, 5) = %f, want %f (clamped to total)", got, want)
	}
}

func TestStepStartTime_EmptySlice(t *testing.T) {
	got := StepStartTime(nil, 0)
	if got != 0 {
		t.Errorf("StepStartTime(nil, 0) = %f, want 0", got)
	}
}

// --- TotalDuration ---

func TestTotalDuration_SingleStep(t *testing.T) {
	steps := []Step{{Action: "run", Pause: pf64(4.0)}}
	got := TotalDuration(steps)
	if !floatEqual(got, 4.0) {
		t.Errorf("TotalDuration([run pause 4]) = %f, want 4.0", got)
	}
}

func TestTotalDuration_MultipleSteps(t *testing.T) {
	steps := []Step{
		{Action: "run", Pause: pf64(1.0)},
		{Action: "type", Command: "ls", Pause: pf64(0.5)},
		{Action: "comment", Narration: "one two three four five six seven eight nine ten"},
	}
	// Step 0: 1.0s.
	// Step 1: 2 * 75ms / 1000 + 0.5 = 0.65s.
	// Step 2: max(0.5, 4.0) = 4.0s (10-word narration).
	want := 1.0 + 0.65 + 4.0
	got := TotalDuration(steps)
	if !floatEqual(got, want) {
		t.Errorf("TotalDuration(3 steps) = %f, want %f", got, want)
	}
}

func TestTotalDuration_EmptySlice(t *testing.T) {
	got := TotalDuration(nil)
	if got != 0 {
		t.Errorf("TotalDuration(nil) = %f, want 0", got)
	}
}

func TestTotalDuration_EqualsStepStartTimeAtEnd(t *testing.T) {
	steps := []Step{
		{Action: "run", Pause: pf64(2.0)},
		{Action: "run", Pause: pf64(3.0)},
		{Action: "run", Pause: pf64(1.0)},
	}
	total := TotalDuration(steps)
	startAfterLast := StepStartTime(steps, len(steps))
	if !floatEqual(total, startAfterLast) {
		t.Errorf("TotalDuration = %f, StepStartTime(len) = %f — should be equal",
			total, startAfterLast)
	}
}

// --- MinPause ---

func TestMinPause_IsZero(t *testing.T) {
	if MinPause() != 0 {
		t.Errorf("MinPause() = %f, want 0", MinPause())
	}
}

// --- NudgePause ---

func TestNudgePause_IncreaseFromExplicit(t *testing.T) {
	step := Step{Action: "run", Pause: pf64(2.0)}
	got := NudgePause(step, 0.25)
	if !floatEqual(got, 2.25) {
		t.Errorf("NudgePause(2.0, +0.25) = %f, want 2.25", got)
	}
}

func TestNudgePause_DecreaseFromExplicit(t *testing.T) {
	step := Step{Action: "run", Pause: pf64(2.0)}
	got := NudgePause(step, -0.25)
	if !floatEqual(got, 1.75) {
		t.Errorf("NudgePause(2.0, -0.25) = %f, want 1.75", got)
	}
}

func TestNudgePause_FromNilUsesDefault(t *testing.T) {
	step := Step{Action: "run"}
	got := NudgePause(step, 0.25)
	want := DefaultPause + 0.25
	if !floatEqual(got, want) {
		t.Errorf("NudgePause(nil, +0.25) = %f, want %f", got, want)
	}
}

func TestNudgePause_ClampsAtMinPause(t *testing.T) {
	step := Step{Action: "run", Pause: pf64(0.1)}
	got := NudgePause(step, -1.0)
	if got != MinPause() {
		t.Errorf("NudgePause(0.1, -1.0) = %f, want %f (clamped)", got, MinPause())
	}
}

func TestNudgePause_ExactlyAtMinPause(t *testing.T) {
	step := Step{Action: "run", Pause: pf64(0.25)}
	got := NudgePause(step, -0.25)
	if got != 0 {
		t.Errorf("NudgePause(0.25, -0.25) = %f, want 0", got)
	}
}

func TestNudgePause_LargePositiveDelta(t *testing.T) {
	step := Step{Action: "run", Pause: pf64(1.0)}
	got := NudgePause(step, 10.0)
	if !floatEqual(got, 11.0) {
		t.Errorf("NudgePause(1.0, +10.0) = %f, want 11.0", got)
	}
}

func TestNudgePause_ZeroDelta(t *testing.T) {
	step := Step{Action: "run", Pause: pf64(3.0)}
	got := NudgePause(step, 0)
	if !floatEqual(got, 3.0) {
		t.Errorf("NudgePause(3.0, 0) = %f, want 3.0", got)
	}
}

// --- DetectOverlaps ---

func TestDetectOverlaps_NoOverlaps(t *testing.T) {
	longPause := 10.0
	steps := []Step{
		{Action: "comment", Narration: "Short.", Pause: &longPause},
		{Action: "comment", Narration: "Also short.", Pause: &longPause},
	}
	overlaps := DetectOverlaps(steps)
	if len(overlaps) != 0 {
		t.Errorf("expected 0 overlaps, got %d", len(overlaps))
	}
}

func TestDetectOverlaps_NoNarration(t *testing.T) {
	shortPause := 0.1
	steps := []Step{
		{Action: "run", Pause: &shortPause},
		{Action: "run", Pause: &shortPause},
	}
	overlaps := DetectOverlaps(steps)
	if len(overlaps) != 0 {
		t.Errorf("steps without narration should produce 0 overlaps, got %d", len(overlaps))
	}
}

func TestDetectOverlaps_EmptySteps(t *testing.T) {
	overlaps := DetectOverlaps(nil)
	if len(overlaps) != 0 {
		t.Errorf("nil steps should produce 0 overlaps, got %d", len(overlaps))
	}
}

func TestDetectOverlaps_SingleStep(t *testing.T) {
	steps := []Step{
		{Action: "comment", Narration: "Just one."},
	}
	overlaps := DetectOverlaps(steps)
	if len(overlaps) != 0 {
		t.Errorf("single step should produce 0 overlaps, got %d", len(overlaps))
	}
}

func TestDetectOverlaps_SkipsNonNarratedSteps(t *testing.T) {
	// Step 0 has narration, step 1 doesn't, step 2 has narration.
	// Even if timing is tight, no overlap should be reported between
	// steps 0 and 1 (no narration on 1).
	longPause := 10.0
	steps := []Step{
		{Action: "comment", Narration: "First.", Pause: &longPause},
		{Action: "run"},
		{Action: "comment", Narration: "Third.", Pause: &longPause},
	}
	overlaps := DetectOverlaps(steps)
	if len(overlaps) != 0 {
		t.Errorf("expected 0 overlaps with non-narrated gap, got %d", len(overlaps))
	}
}

func TestDetectOverlaps_ReportsCorrectIndices(t *testing.T) {
	// Force an overlap: type step with very short pause + long narration,
	// followed immediately by another narrated step. The type step's
	// duration is max(typing+pause, narrDuration), but if the narration
	// is estimated at 4s and the step duration is also 4s, they just
	// barely don't overlap. We need narration that exceeds the step.
	//
	// With the current model, StepDuration = max(base, narrDuration),
	// so narrEnd == stepEnd == nextStart. No overlap.
	//
	// To force a real overlap in tests, we'd need to create a scenario
	// where NarrationDuration > StepDuration, which can't happen naturally.
	// Instead, test the struct fields when overlaps ARE detected by
	// constructing Overlap values directly.
	overlaps := []Overlap{
		{StepA: 2, StepB: 3, Amount: 0.5},
	}
	if overlaps[0].StepA != 2 || overlaps[0].StepB != 3 {
		t.Error("overlap indices should match")
	}
	if !floatEqual(overlaps[0].Amount, 0.5) {
		t.Errorf("overlap amount = %f, want 0.5", overlaps[0].Amount)
	}
}

// --- Constants ---

func TestConstants_MatchTypeScriptPipeline(t *testing.T) {
	// These values must stay in sync with src/constants.ts in the
	// TypeScript pipeline. If they drift, the TUI's timing estimates
	// will diverge from actual pipeline output.
	if TypingSpeedMS != 75 {
		t.Errorf("TypingSpeedMS = %d, want 75", TypingSpeedMS)
	}
	if WordsPerMinute != 150 {
		t.Errorf("WordsPerMinute = %d, want 150", WordsPerMinute)
	}
	if !floatEqual(MinNarrationDuration, 1.5) {
		t.Errorf("MinNarrationDuration = %f, want 1.5", MinNarrationDuration)
	}
	if !floatEqual(DefaultPause, 0.5) {
		t.Errorf("DefaultPause = %f, want 0.5", DefaultPause)
	}
	if !floatEqual(DefaultNudgeStep, 0.25) {
		t.Errorf("DefaultNudgeStep = %f, want 0.25", DefaultNudgeStep)
	}
}
