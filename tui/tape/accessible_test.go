package tape

import (
	"bytes"
	"fmt"
	"strings"
	"testing"
)

// runAccessibleSession simulates an accessible mode session by feeding
// the given commands (one per line) and returning the output.
func runAccessibleSession(t *testing.T, data *TapeData, commands []string) string {
	t.Helper()
	input := strings.Join(commands, "\n") + "\n"
	var output bytes.Buffer
	RunAccessible(strings.NewReader(input), &output, data, BuildStatus{}, DefaultNudgeStep)
	return output.String()
}

func testAccessibleData() *TapeData {
	pause2 := 2.0
	pause1 := 1.0
	return &TapeData{
		Dir: "/tmp/test",
		Tape: Tape{
			Title:  "Test Episode",
			Output: "test/output",
			Steps: []Step{
				{Action: "type", Command: "echo hello", Narration: "Say hello.", Pause: &pause2},
				{Action: "run", Pause: &pause1},
				{Action: "comment", Narration: "That is all."},
			},
		},
	}
}

// --- Welcome ---

func TestAccessible_ShowsWelcome(t *testing.T) {
	out := runAccessibleSession(t, testAccessibleData(), []string{"q"})

	if !strings.Contains(out, "accessible mode") {
		t.Error("should show accessible mode welcome")
	}
	if !strings.Contains(out, "Test Episode") {
		t.Error("should show tape title")
	}
	if !strings.Contains(out, "3") {
		t.Error("should show step count")
	}
}

// --- Navigation ---

func TestAccessible_StartsAtFirstStep(t *testing.T) {
	out := runAccessibleSession(t, testAccessibleData(), []string{"q"})

	if !strings.Contains(out, "Step 1 of 3") {
		t.Error("should start at step 1")
	}
}

func TestAccessible_NextStep(t *testing.T) {
	out := runAccessibleSession(t, testAccessibleData(), []string{"n", "q"})

	if !strings.Contains(out, "Step 2 of 3") {
		t.Error("'n' should advance to step 2")
	}
}

func TestAccessible_EmptyInputAdvances(t *testing.T) {
	out := runAccessibleSession(t, testAccessibleData(), []string{"", "q"})

	if !strings.Contains(out, "Step 2 of 3") {
		t.Error("Enter should advance to next step")
	}
}

func TestAccessible_PrevStep(t *testing.T) {
	out := runAccessibleSession(t, testAccessibleData(), []string{"n", "p", "q"})

	// Should end back at step 1 after n then p.
	lines := strings.Split(out, "\n")
	lastStepMention := ""
	for _, line := range lines {
		if strings.Contains(line, "Step ") && strings.Contains(line, " of 3") {
			lastStepMention = line
		}
	}
	if !strings.Contains(lastStepMention, "Step 1 of 3") {
		t.Errorf("should be back at step 1, last mention: %q", lastStepMention)
	}
}

func TestAccessible_ClampsAtLastStep(t *testing.T) {
	out := runAccessibleSession(t, testAccessibleData(), []string{"n", "n", "n", "q"})

	if !strings.Contains(out, "Already at the last step") {
		t.Error("should warn when trying to go past the last step")
	}
}

func TestAccessible_ClampsAtFirstStep(t *testing.T) {
	out := runAccessibleSession(t, testAccessibleData(), []string{"p", "q"})

	if !strings.Contains(out, "Already at the first step") {
		t.Error("should warn when trying to go before the first step")
	}
}

// --- Step announcements ---

func TestAccessible_AnnouncesStepDetails(t *testing.T) {
	out := runAccessibleSession(t, testAccessibleData(), []string{"q"})

	if !strings.Contains(out, "Start time:") {
		t.Error("should announce start time")
	}
	if !strings.Contains(out, "Duration:") {
		t.Error("should announce duration")
	}
	if !strings.Contains(out, "Pause:") {
		t.Error("should announce pause")
	}
}

func TestAccessible_AnnouncesNarration(t *testing.T) {
	out := runAccessibleSession(t, testAccessibleData(), []string{"q"})

	if !strings.Contains(out, "Say hello.") {
		t.Error("should announce narration text")
	}
}

func TestAccessible_AnnouncesCommand(t *testing.T) {
	out := runAccessibleSession(t, testAccessibleData(), []string{"q"})

	if !strings.Contains(out, "echo hello") {
		t.Error("should announce command for type steps")
	}
}

func TestAccessible_AnnouncesNoNarration(t *testing.T) {
	// Step 2 (run) has no narration.
	out := runAccessibleSession(t, testAccessibleData(), []string{"n", "q"})

	if !strings.Contains(out, "No narration") {
		t.Error("should announce when a step has no narration")
	}
}

// --- Nudge ---

func TestAccessible_NudgeIncrease(t *testing.T) {
	out := runAccessibleSession(t, testAccessibleData(), []string{"+", "q"})

	if !strings.Contains(out, "increased") {
		t.Error("should confirm pause increase")
	}
	want := 2.0 + DefaultNudgeStep
	if !strings.Contains(out, fmt.Sprintf("%.2f", want)) {
		t.Errorf("should show new pause value %.2f", want)
	}
}

func TestAccessible_NudgeDecrease(t *testing.T) {
	out := runAccessibleSession(t, testAccessibleData(), []string{"-", "q"})

	if !strings.Contains(out, "decreased") {
		t.Error("should confirm pause decrease")
	}
	want := 2.0 - DefaultNudgeStep
	if !strings.Contains(out, fmt.Sprintf("%.2f", want)) {
		t.Errorf("should show new pause value %.2f", want)
	}
}

// --- Undo ---

func TestAccessible_Undo(t *testing.T) {
	out := runAccessibleSession(t, testAccessibleData(), []string{"+", "u", "q"})

	if !strings.Contains(out, "Undone") {
		t.Error("should confirm undo")
	}
	if !strings.Contains(out, "2.00") {
		t.Error("should restore original pause value")
	}
}

func TestAccessible_UndoEmptyStack(t *testing.T) {
	out := runAccessibleSession(t, testAccessibleData(), []string{"u", "q"})

	if !strings.Contains(out, "Nothing to undo") {
		t.Error("should warn when undo stack is empty")
	}
}

// --- Help ---

func TestAccessible_Help(t *testing.T) {
	out := runAccessibleSession(t, testAccessibleData(), []string{"?", "q"})

	if !strings.Contains(out, "Available commands") {
		t.Error("should show help text")
	}
	if !strings.Contains(out, "next step") {
		t.Error("help should describe navigation")
	}
}

// --- Quit ---

func TestAccessible_QuitNoChanges(t *testing.T) {
	out := runAccessibleSession(t, testAccessibleData(), []string{"q"})

	if !strings.Contains(out, "No changes made") {
		t.Error("should confirm no changes on quit")
	}
}

func TestAccessible_QuitWithChanges(t *testing.T) {
	out := runAccessibleSession(t, testAccessibleData(), []string{"+", "q"})

	if !strings.Contains(out, "1 change") {
		t.Error("should report change count on quit")
	}
}

// --- Unknown command ---

func TestAccessible_UnknownCommand(t *testing.T) {
	out := runAccessibleSession(t, testAccessibleData(), []string{"xyz", "q"})

	if !strings.Contains(out, "Unknown command") {
		t.Error("should warn about unknown commands")
	}
}
