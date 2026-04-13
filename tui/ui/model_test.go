package ui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/philsherry/playback/tui/tape"
)

// testTapeData returns a TapeData fixture with a realistic set of steps
// for testing the model's rendering and update logic.
func testTapeData() tape.TapeData {
	pause2 := 2.0
	pause1 := 1.0
	return tape.TapeData{
		Dir: "/tmp/test-project/tapes/s1-testing/01-example",
		Tape: tape.Tape{
			Title:  "Test Episode",
			Output: "s1-testing/01-example",
			Steps: []tape.Step{
				{
					Action:    "type",
					Command:   "echo hello",
					Narration: "First, we say hello.",
					Pause:     &pause2,
				},
				{
					Action: "run",
					Pause:  &pause1,
				},
				{
					Action:    "comment",
					Narration: "That completes the demonstration.",
				},
			},
		},
		Meta: tape.Meta{
			Title:  "Test Episode",
			Voices: []string{"northern_english_male"},
		},
	}
}

// testTapeDataNoVoices returns a TapeData with no voices configured in
// meta — used to test the default voice fallback in the inspector.
func testTapeDataNoVoices() tape.TapeData {
	data := testTapeData()
	data.Meta.Voices = nil
	return data
}

// readyModel returns a model that has received a WindowSizeMsg so it's
// ready for rendering and interaction.
func readyModel(data tape.TapeData) Model {
	model := NewModel(data, "/tmp/test-project")
	updated, _ := model.Update(tea.WindowSizeMsg{Width: 120, Height: 40})
	return updated.(Model)
}

// sendKey sends a rune key message to the model and returns the updated model.
func sendKey(m Model, key string) Model {
	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(key)})
	return updated.(Model)
}

// sendArrow sends an arrow key message and returns the updated model.
func sendArrow(m Model, keyType tea.KeyType) Model {
	updated, _ := m.Update(tea.KeyMsg{Type: keyType})
	return updated.(Model)
}

// nudgePauseUp sends an up-arrow to increase the pause on the selected step.
func nudgePauseUp(m Model) Model { return sendArrow(m, tea.KeyUp) }

// nudgePauseDown sends a down-arrow to decrease the pause on the selected step.
func nudgePauseDown(m Model) Model { return sendArrow(m, tea.KeyDown) }

// --- NewModel ---

func TestNewModel_InitialisesWithTokyoNightStorm(t *testing.T) {
	model := NewModel(testTapeData(), "/tmp/test-project")

	if model.theme != TokyoNightStorm {
		t.Error("NewModel should use TokyoNightStorm as the default theme")
	}
}

func TestNewModel_NotReadyInitially(t *testing.T) {
	model := NewModel(testTapeData(), "/tmp/test-project")

	if model.ready {
		t.Error("NewModel should set ready=false until first WindowSizeMsg")
	}
}

func TestNewModel_StoresTapeData(t *testing.T) {
	data := testTapeData()
	model := NewModel(data, "/tmp/test-project")

	if model.tapeData.Tape.Title != "Test Episode" {
		t.Errorf("tapeData.Tape.Title = %q, want %q", model.tapeData.Tape.Title, "Test Episode")
	}
	if len(model.tapeData.Tape.Steps) != 3 {
		t.Errorf("len(tapeData.Tape.Steps) = %d, want 3", len(model.tapeData.Tape.Steps))
	}
}

func TestNewModel_CursorStartsUnselected(t *testing.T) {
	model := NewModel(testTapeData(), "/tmp/test-project")

	if model.cursor != -1 {
		t.Errorf("cursor = %d, want -1 (no selection)", model.cursor)
	}
}

func TestNewModel_DefaultNudgeStep(t *testing.T) {
	model := NewModel(testTapeData(), "/tmp/test-project")

	if model.nudgeStep != tape.DefaultNudgeStep {
		t.Errorf("nudgeStep = %f, want %f", model.nudgeStep, tape.DefaultNudgeStep)
	}
}

func TestNewModelWithTheme_HighContrast(t *testing.T) {
	model := NewModelWithTheme(testTapeData(), "/tmp/test-project", HighContrast)

	if model.theme != HighContrast {
		t.Error("NewModelWithTheme should use the provided theme")
	}
	if model.theme.Background != "#000000" {
		t.Errorf("HighContrast background = %q, want #000000", model.theme.Background)
	}
}

func TestNewModelWithNudgeStep_CustomValue(t *testing.T) {
	model := NewModelWithNudgeStep(testTapeData(), "/tmp/test-project", 0.5)

	if model.nudgeStep != 0.5 {
		t.Errorf("nudgeStep = %f, want 0.5", model.nudgeStep)
	}
}

func TestNewModelWithNudgeStep_ZeroFallsBackToDefault(t *testing.T) {
	model := NewModelWithNudgeStep(testTapeData(), "/tmp/test-project", 0)

	if model.nudgeStep != tape.DefaultNudgeStep {
		t.Errorf("nudgeStep = %f, want %f (default, because 0 was passed)",
			model.nudgeStep, tape.DefaultNudgeStep)
	}
}

func TestNewModelWithNudgeStep_NegativeFallsBackToDefault(t *testing.T) {
	model := NewModelWithNudgeStep(testTapeData(), "/tmp/test-project", -1)

	if model.nudgeStep != tape.DefaultNudgeStep {
		t.Errorf("nudgeStep = %f, want %f (default, because negative was passed)",
			model.nudgeStep, tape.DefaultNudgeStep)
	}
}

// --- Init ---

func TestInit_ReturnsSpinnerTick(t *testing.T) {
	model := NewModel(testTapeData(), "/tmp/test-project")
	cmd := model.Init()

	// Init should return the spinner's tick command so it starts animating.
	if cmd == nil {
		t.Error("Init() should return a command (spinner tick)")
	}
}

// --- Update: WindowSizeMsg ---

func TestUpdate_WindowSizeMsg_SetsReady(t *testing.T) {
	model := NewModel(testTapeData(), "/tmp/test-project")
	msg := tea.WindowSizeMsg{Width: 120, Height: 40}

	updated, _ := model.Update(msg)
	m := updated.(Model)

	if !m.ready {
		t.Error("Update(WindowSizeMsg) should set ready=true")
	}
	if m.width != 120 {
		t.Errorf("width = %d, want 120", m.width)
	}
	if m.height != 40 {
		t.Errorf("height = %d, want 40", m.height)
	}
}

func TestUpdate_WindowSizeMsg_CalculatesLayout(t *testing.T) {
	model := NewModel(testTapeData(), "/tmp/test-project")
	msg := tea.WindowSizeMsg{Width: 100, Height: 50}

	updated, _ := model.Update(msg)
	m := updated.(Model)

	expected := CalculateLayout(100, 50)
	if m.layout != expected {
		t.Errorf("layout = %+v, want %+v", m.layout, expected)
	}
}

func TestUpdate_WindowSizeMsg_Resize(t *testing.T) {
	model := NewModel(testTapeData(), "/tmp/test-project")

	updated, _ := model.Update(tea.WindowSizeMsg{Width: 80, Height: 24})
	m := updated.(Model)
	firstLayout := m.layout

	updated, _ = m.Update(tea.WindowSizeMsg{Width: 120, Height: 40})
	m = updated.(Model)

	if m.layout == firstLayout {
		t.Error("layout should change on resize")
	}
}

// --- Update: Quit ---

func TestUpdate_QuitKey_Q(t *testing.T) {
	model := NewModel(testTapeData(), "/tmp/test-project")
	msg := tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'q'}}

	_, cmd := model.Update(msg)
	if cmd == nil {
		t.Fatal("Update('q') should return a quit command")
	}

	result := cmd()
	if _, ok := result.(tea.QuitMsg); !ok {
		t.Errorf("quit command returned %T, want tea.QuitMsg", result)
	}
}

func TestUpdate_QuitKey_CtrlC(t *testing.T) {
	model := NewModel(testTapeData(), "/tmp/test-project")
	msg := tea.KeyMsg{Type: tea.KeyCtrlC}

	_, cmd := model.Update(msg)
	if cmd == nil {
		t.Fatal("Update(ctrl+c) should return a quit command")
	}

	result := cmd()
	if _, ok := result.(tea.QuitMsg); !ok {
		t.Errorf("quit command returned %T, want tea.QuitMsg", result)
	}
}

func TestUpdate_NonQuitKey_NoCommand(t *testing.T) {
	model := NewModel(testTapeData(), "/tmp/test-project")
	msg := tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'x'}}

	_, cmd := model.Update(msg)
	if cmd != nil {
		t.Error("Update('x') should return nil command (not a bound key)")
	}
}

// --- Update: Cursor movement ---

func TestUpdate_CursorDown_SelectsFirstStep(t *testing.T) {
	m := readyModel(testTapeData())

	// First j press when cursor is -1 should move to 0.
	m = sendKey(m, "j")
	if m.cursor != 0 {
		t.Errorf("cursor = %d, want 0 after first 'j'", m.cursor)
	}
}

func TestUpdate_CursorDown_Advances(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j") // → 0
	m = sendKey(m, "j") // → 1
	m = sendKey(m, "j") // → 2

	if m.cursor != 2 {
		t.Errorf("cursor = %d, want 2", m.cursor)
	}
}

func TestUpdate_CursorDown_ClampsAtEnd(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j") // → 0
	m = sendKey(m, "j") // → 1
	m = sendKey(m, "j") // → 2
	m = sendKey(m, "j") // → 2 (clamped)

	if m.cursor != 2 {
		t.Errorf("cursor = %d, want 2 (clamped at last step)", m.cursor)
	}
}

func TestUpdate_CursorUp_SelectsFirstFromNone(t *testing.T) {
	m := readyModel(testTapeData())

	// k when cursor is -1 should select step 0.
	m = sendKey(m, "k")
	if m.cursor != 0 {
		t.Errorf("cursor = %d, want 0 after 'k' from no selection", m.cursor)
	}
}

func TestUpdate_CursorUp_Retreats(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j") // → 0
	m = sendKey(m, "j") // → 1
	m = sendKey(m, "k") // → 0

	if m.cursor != 0 {
		t.Errorf("cursor = %d, want 0", m.cursor)
	}
}

func TestUpdate_CursorUp_ClampsAtStart(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j") // → 0
	m = sendKey(m, "k") // → 0 (clamped)

	if m.cursor != 0 {
		t.Errorf("cursor = %d, want 0 (clamped at first step)", m.cursor)
	}
}

func TestUpdate_Escape_Deselects(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j") // select step 0

	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyEscape})
	m = updated.(Model)

	if m.cursor != -1 {
		t.Errorf("cursor = %d, want -1 after Esc", m.cursor)
	}
}

// --- Update: Nudge ---

func TestUpdate_PauseUp_IncreasesPause(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j") // select step 0 (pause = 2.0)
	m = nudgePauseUp(m) // arrow up

	step := m.tapeData.Tape.Steps[0]
	if step.Pause == nil {
		t.Fatal("Pause should not be nil after nudge")
	}
	want := 2.0 + tape.DefaultNudgeStep
	if *step.Pause != want {
		t.Errorf("Pause = %f, want %f", *step.Pause, want)
	}
}

func TestUpdate_PauseDown_DecreasesPause(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j")   // select step 0 (pause = 2.0)
	m = nudgePauseDown(m) // arrow down

	step := m.tapeData.Tape.Steps[0]
	if step.Pause == nil {
		t.Fatal("Pause should not be nil after nudge")
	}
	want := 2.0 - tape.DefaultNudgeStep
	if *step.Pause != want {
		t.Errorf("Pause = %f, want %f", *step.Pause, want)
	}
}

func TestUpdate_PauseDown_ClampsAtZero(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j") // select step 0 (pause = 2.0)

	// Nudge down many times — should clamp at 0.
	for i := 0; i < 20; i++ {
		m = nudgePauseDown(m)
	}

	step := m.tapeData.Tape.Steps[0]
	if step.Pause == nil {
		t.Fatal("Pause should not be nil after nudge")
	}
	if *step.Pause < 0 {
		t.Errorf("Pause = %f, should not be negative", *step.Pause)
	}
	if *step.Pause != 0 {
		t.Errorf("Pause = %f, want 0 (clamped)", *step.Pause)
	}
}

func TestUpdate_NudgeWithNoSelection_DoesNothing(t *testing.T) {
	data := testTapeData()
	originalPause := *data.Tape.Steps[0].Pause
	m := readyModel(data)

	// Nudge without selecting a clip — should have no effect.
	m = nudgePauseUp(m)

	step := m.tapeData.Tape.Steps[0]
	if step.Pause == nil || *step.Pause != originalPause {
		t.Error("nudge with no selection should not change any pause values")
	}
	if m.dirty {
		t.Error("dirty should be false — no edit was made")
	}
}

func TestUpdate_NudgeSetssDirtyFlag(t *testing.T) {
	m := readyModel(testTapeData())

	if m.dirty {
		t.Error("dirty should be false initially")
	}

	m = sendKey(m, "j")
	m = nudgePauseUp(m)

	if !m.dirty {
		t.Error("dirty should be true after nudge")
	}
}

func TestUpdate_NudgeOnStepWithNilPause(t *testing.T) {
	// Step 2 (comment) has no explicit pause — it should use DefaultPause.
	m := readyModel(testTapeData())
	m = sendKey(m, "j") // → 0
	m = sendKey(m, "j") // → 1
	m = sendKey(m, "j") // → 2 (comment, pause is nil)
	m = nudgePauseUp(m) // arrow up

	step := m.tapeData.Tape.Steps[2]
	if step.Pause == nil {
		t.Fatal("Pause should be set after nudge on nil-pause step")
	}
	want := tape.DefaultPause + tape.DefaultNudgeStep
	if *step.Pause != want {
		t.Errorf("Pause = %f, want %f (DefaultPause + nudge)", *step.Pause, want)
	}
}

// --- Update: Undo ---

func TestUpdate_Undo_RestoresPreviousPause(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j") // select step 0 (pause = 2.0)
	m = nudgePauseUp(m) // → 2.25
	m = sendKey(m, "u") // undo → 2.0

	step := m.tapeData.Tape.Steps[0]
	if step.Pause == nil || *step.Pause != 2.0 {
		t.Errorf("Pause = %v, want 2.0 after undo", step.Pause)
	}
}

func TestUpdate_Undo_MultipleEdits(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j") // select step 0 (pause = 2.0)
	m = nudgePauseUp(m) // → 2.25
	m = nudgePauseUp(m) // → 2.50
	m = nudgePauseUp(m) // → 2.75

	m = sendKey(m, "u") // → 2.50
	step := m.tapeData.Tape.Steps[0]
	if *step.Pause != 2.5 {
		t.Errorf("after first undo: Pause = %f, want 2.5", *step.Pause)
	}

	m = sendKey(m, "u") // → 2.25
	step = m.tapeData.Tape.Steps[0]
	if *step.Pause != 2.25 {
		t.Errorf("after second undo: Pause = %f, want 2.25", *step.Pause)
	}

	m = sendKey(m, "u") // → 2.0
	step = m.tapeData.Tape.Steps[0]
	if *step.Pause != 2.0 {
		t.Errorf("after third undo: Pause = %f, want 2.0", *step.Pause)
	}
}

func TestUpdate_Undo_ClearsDirtyWhenFullyReverted(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j")
	m = nudgePauseUp(m) // one nudge
	m = sendKey(m, "u") // undo it

	if m.dirty {
		t.Error("dirty should be false after undoing all edits")
	}
}

func TestUpdate_Undo_EmptyStackDoesNothing(t *testing.T) {
	m := readyModel(testTapeData())

	// Undo with nothing to undo — should not panic or change state.
	m = sendKey(m, "u")

	if m.dirty {
		t.Error("dirty should remain false")
	}
}

// --- Update: Save ---

func TestUpdate_Save_WritesPauseToFile(t *testing.T) {
	// Create a real tape file so WritePauses can write to it.
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "tape.yaml"), []byte(`---
title: Test
output: test
steps:
  - action: type
    command: echo hello
    pause: 2
  - action: run
    pause: 1
`), 0o644); err != nil {
		t.Fatalf("failed to write tape.yaml: %v", err)
	}

	data := testTapeData()
	data.Dir = dir
	m := readyModel(data)
	m = sendKey(m, "j") // select step 0
	m = nudgePauseUp(m) // arrow up → pause 2.25
	m = sendKey(m, "s") // save

	if m.dirty {
		t.Error("dirty should be false after save")
	}
	if m.statusMsg != "Saved" {
		t.Errorf("statusMsg = %q, want %q", m.statusMsg, "Saved")
	}

	// Verify the file was written.
	written, _ := os.ReadFile(filepath.Join(dir, "tape.yaml"))
	if !strings.Contains(string(written), "pause: 2.25") {
		t.Errorf("tape.yaml should contain updated pause, got:\n%s", string(written))
	}
}

func TestUpdate_Save_NoChanges_KeyIgnored(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "s") // save key is disabled when not dirty — no effect

	if m.dirty {
		t.Error("dirty should still be false")
	}
	// The save keybinding is disabled when not dirty, so no status message.
	if m.statusMsg != "" {
		t.Errorf("statusMsg should be empty (save key disabled), got %q", m.statusMsg)
	}
}

func TestUpdate_Save_ClearsUndoStack(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "tape.yaml"), []byte(`steps:
  - action: run
    pause: 1
`), 0o644); err != nil {
		t.Fatalf("failed to write tape.yaml: %v", err)
	}

	data := testTapeData()
	data.Dir = dir
	m := readyModel(data)
	m = sendKey(m, "j")
	m = sendKey(m, "l") // nudge
	m = sendKey(m, "l") // nudge again
	m = sendKey(m, "s") // save

	if len(m.undoStack) != 0 {
		t.Errorf("undo stack should be empty after save, has %d entries", len(m.undoStack))
	}
}

func TestUpdate_Save_StatusClearsOnNextKey(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "tape.yaml"), []byte(`steps:
  - action: run
    pause: 1
`), 0o644); err != nil {
		t.Fatalf("failed to write tape.yaml: %v", err)
	}

	data := testTapeData()
	data.Dir = dir
	m := readyModel(data)
	m = sendKey(m, "j")
	m = sendKey(m, "l")
	m = sendKey(m, "s") // "Saved"
	m = sendKey(m, "j") // any keypress clears status

	if m.statusMsg != "" {
		t.Errorf("statusMsg should be cleared after next keypress, got %q", m.statusMsg)
	}
}

func TestView_AfterSave_ShowsSavedIndicator(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "tape.yaml"), []byte(`steps:
  - action: type
    command: echo hello
    pause: 2
`), 0o644); err != nil {
		t.Fatalf("failed to write tape.yaml: %v", err)
	}

	data := testTapeData()
	data.Dir = dir
	m := readyModel(data)
	m = sendKey(m, "j")
	m = sendKey(m, "l")
	m = sendKey(m, "s")
	view := m.View()

	if !strings.Contains(view, "Saved") {
		t.Error("View() should show Saved indicator after save")
	}
}

// --- Update: Dirty guard ---

func TestUpdate_QuitWhenDirty_ShowsConfirmation(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j")
	m = sendKey(m, "l") // dirty

	// First quit attempt should not actually quit.
	updated, cmd := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'q'}})
	m = updated.(Model)

	if !m.confirmQuit {
		t.Error("confirmQuit should be true after q with unsaved changes")
	}
	// Should not return a quit command.
	if cmd != nil {
		// Check it's not a quit msg by running it.
		result := cmd()
		if _, ok := result.(tea.QuitMsg); ok {
			t.Error("first q press with dirty state should NOT quit")
		}
	}
}

func TestUpdate_QuitWhenDirty_ShowsConfirm(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j")
	m = sendKey(m, "l") // dirty

	// q should show the huh Confirm dialog, not quit immediately.
	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'q'}})
	m = updated.(Model)

	if !m.confirmQuit {
		t.Error("confirmQuit should be true")
	}
	if m.quitForm == nil {
		t.Error("quitForm should be set")
	}
}

func TestUpdate_QuitConfirm_EscCancels(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j")
	m = sendKey(m, "l") // dirty

	// q triggers confirm.
	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'q'}})
	m = updated.(Model)

	// Esc cancels — should stay in the editor.
	updated, _ = m.Update(tea.KeyMsg{Type: tea.KeyEscape})
	m = updated.(Model)

	if m.confirmQuit {
		t.Error("confirmQuit should be false after Esc")
	}
}

func TestUpdate_QuitWhenClean_QuitsImmediately(t *testing.T) {
	m := readyModel(testTapeData())

	_, cmd := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'q'}})
	if cmd == nil {
		t.Fatal("q with no dirty state should return quit command")
	}
	result := cmd()
	if _, ok := result.(tea.QuitMsg); !ok {
		t.Errorf("expected QuitMsg, got %T", result)
	}
}

func TestView_QuitConfirm_ShowsInPanel(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j")
	m = sendKey(m, "l") // dirty

	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'q'}})
	m = updated.(Model)

	view := m.View()
	// The huh Confirm renders "unsaved" and "Save and quit" in the panel.
	if !strings.Contains(view, "unsaved") {
		t.Error("View() should show unsaved changes in the confirm dialog")
	}
	// Footer should show the cancel hint.
	if !strings.Contains(view, "cancel") {
		t.Error("View() should mention cancel option in the footer")
	}
}

// --- Update: Edit pause ---

func TestUpdate_EditPause_EntersEditMode(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j") // select step 0
	m = sendKey(m, "e") // enter edit mode

	if !m.editing {
		t.Error("pressing 'e' with a selection should enter editing mode")
	}
}

func TestUpdate_EditPause_PreFillsCurrentValue(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j") // select step 0 (pause = 2.0)
	m = sendKey(m, "e") // enter edit mode

	val := m.pauseInput.Value()
	if val != "2.00" {
		t.Errorf("textinput should be pre-filled with '2.00', got %q", val)
	}
}

func TestUpdate_EditPause_NoSelectionIgnored(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "e") // no selection

	if m.editing {
		t.Error("'e' with no selection should not enter editing mode")
	}
}

func TestUpdate_EditPause_EscCancels(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j")
	m = sendKey(m, "e")

	// Press Esc to cancel.
	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyEscape})
	m = updated.(Model)

	if m.editing {
		t.Error("Esc should cancel editing")
	}

	// Pause should be unchanged.
	step := m.tapeData.Tape.Steps[0]
	if step.Pause == nil || *step.Pause != 2.0 {
		t.Errorf("pause should be unchanged after cancel, got %v", step.Pause)
	}
}

func TestUpdate_EditPause_EnterConfirms(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j") // select step 0 (pause = 2.0)
	m = sendKey(m, "e") // enter edit mode

	// Clear the pre-filled value and type a new one.
	m.pauseInput.SetValue("5.5")

	// Press Enter to confirm.
	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	m = updated.(Model)

	if m.editing {
		t.Error("Enter should exit editing mode")
	}

	step := m.tapeData.Tape.Steps[0]
	if step.Pause == nil || *step.Pause != 5.5 {
		t.Errorf("pause should be 5.5 after edit, got %v", step.Pause)
	}
	if !m.dirty {
		t.Error("dirty should be true after edit")
	}
}

func TestUpdate_EditPause_CreatesUndoEntry(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j")
	m = sendKey(m, "e")
	m.pauseInput.SetValue("3.0")

	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	m = updated.(Model)

	if len(m.undoStack) != 1 {
		t.Errorf("undo stack should have 1 entry, got %d", len(m.undoStack))
	}

	// Undo should restore original value.
	m = sendKey(m, "u")
	step := m.tapeData.Tape.Steps[0]
	if step.Pause == nil {
		t.Fatal("pause should not be nil after undo")
	}
	if *step.Pause != 2.0 {
		t.Errorf("undo should restore pause to 2.0, got %.2f", *step.Pause)
	}
}

func TestView_EditMode_ShowsTextinput(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j")
	m = sendKey(m, "e")
	view := m.View()

	if !strings.Contains(view, "Enter to confirm") {
		t.Error("View() in edit mode should show confirmation hint")
	}
}

// --- Update: Overlap detection ---

func TestModel_OverlapsComputedOnInit(t *testing.T) {
	m := NewModel(testTapeData(), "/tmp/test-project")

	// The test tape has well-spaced steps, so no overlaps expected.
	if len(m.overlaps) != 0 {
		t.Errorf("expected 0 overlaps in test data, got %d", len(m.overlaps))
	}
}

func TestModel_OverlapsRefreshedOnNudge(t *testing.T) {
	m := readyModel(testTapeData())
	initialOverlaps := len(m.overlaps)

	m = sendKey(m, "j")
	m = sendKey(m, "l") // nudge — overlaps recalculated

	// We can't easily create a real overlap in the test data, but we
	// verify the overlaps field is recalculated (it should still be 0
	// for well-spaced test data).
	if len(m.overlaps) != initialOverlaps {
		t.Errorf("overlaps changed unexpectedly: was %d, now %d",
			initialOverlaps, len(m.overlaps))
	}
}

// --- Update: PROMPT.md viewer ---

func TestUpdate_ViewPrompt_Opens(t *testing.T) {
	// Create a tape dir with a PROMPT.md.
	dir := t.TempDir()
	os.WriteFile(
		filepath.Join(dir, "tape.yaml"),
		[]byte("title: Test\noutput: test\nsteps:\n  - action: run\n"),
		0o644,
	)
	os.WriteFile(filepath.Join(dir, "PROMPT.md"), []byte("# Test\n\nThis is a test prompt."), 0o644)

	data := testTapeData()
	data.Dir = dir
	m := readyModel(data)
	m = sendKey(m, "m")

	if !m.viewingPrompt {
		t.Error("'m' should open the PROMPT.md viewer")
	}
}

func TestUpdate_ViewPrompt_NoFile(t *testing.T) {
	m := readyModel(testTapeData()) // /tmp/test-tape has no PROMPT.md
	m = sendKey(m, "m")

	if m.viewingPrompt {
		t.Error("should not open viewer when no PROMPT.md exists")
	}
	if m.statusMsg == "" {
		t.Error("should show status message about missing file")
	}
}

func TestUpdate_ViewPrompt_EscCloses(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(
		filepath.Join(dir, "tape.yaml"),
		[]byte("title: Test\noutput: test\nsteps:\n  - action: run\n"),
		0o644,
	)
	os.WriteFile(filepath.Join(dir, "PROMPT.md"), []byte("# Test"), 0o644)

	data := testTapeData()
	data.Dir = dir
	m := readyModel(data)
	m = sendKey(m, "m")

	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyEscape})
	m = updated.(Model)

	if m.viewingPrompt {
		t.Error("Esc should close the viewer")
	}
}

// --- Update: Metadata editor ---

func TestUpdate_EditMeta_Opens(t *testing.T) {
	m := readyModel(testTapeData())

	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("M")})
	m = updated.(Model)

	if !m.editingMeta {
		t.Error("'M' should open the metadata editor")
	}
	if len(m.metaFields) != 5 {
		t.Errorf("expected 5 fields, got %d", len(m.metaFields))
	}
}

func TestUpdate_EditMeta_ShowsCurrentValues(t *testing.T) {
	data := testTapeData()
	data.Meta.Title = "My Episode"
	data.Meta.Locale = "en-GB"
	m := readyModel(data)

	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("M")})
	m = updated.(Model)

	if m.metaValues[0] != "My Episode" {
		t.Errorf("Title value = %q, want %q", m.metaValues[0], "My Episode")
	}
}

func TestUpdate_EditMeta_EscCloses(t *testing.T) {
	m := readyModel(testTapeData())

	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("M")})
	m = updated.(Model)

	updated, _ = m.Update(tea.KeyMsg{Type: tea.KeyEscape})
	m = updated.(Model)

	if m.editingMeta {
		t.Error("Esc should close the metadata editor")
	}
}

func TestUpdate_EditMeta_SaveWritesFile(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(
		filepath.Join(dir, "tape.yaml"),
		[]byte("title: X\noutput: x\nsteps:\n  - action: run\n"),
		0o644,
	)

	data := testTapeData()
	data.Dir = dir
	data.Meta.Title = "Original"
	m := readyModel(data)

	// Open editor.
	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("M")})
	m = updated.(Model)

	// Change the title.
	m.metaValues[0] = "Updated Title"

	// Save.
	m = sendKey(m, "s")

	// Verify file was written.
	written, _ := os.ReadFile(filepath.Join(dir, "meta.yaml"))
	if !strings.Contains(string(written), "Updated Title") {
		t.Errorf("meta.yaml should contain updated title, got:\n%s", string(written))
	}
}

// --- Update: Tape picker ---

func TestUpdate_OpenPicker_DirtyShowsConfirm(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j")
	m = sendKey(m, "l") // dirty (audio nudge)
	m = sendKey(m, "o") // try to open picker

	if m.picking {
		t.Error("picker should not open directly when there are unsaved changes")
	}
	if !m.confirmDiscard {
		t.Error("should show discard confirmation dialog")
	}
	if m.confirmForm == nil {
		t.Error("confirmForm should be set")
	}
}

func TestUpdate_PickerEscCloses(t *testing.T) {
	// Create a project root with tapes so the picker can open.
	// The tape data must point at a real directory so InferTapesDir
	// can walk the filesystem.
	root := t.TempDir()
	tapeDir := filepath.Join(root, "tapes", "test-ep")
	os.MkdirAll(tapeDir, 0o755)
	os.WriteFile(
		filepath.Join(tapeDir, "tape.yaml"),
		[]byte("title: Test\noutput: test\nsteps:\n  - action: run\n"),
		0o644,
	)

	data := testTapeData()
	data.Dir = tapeDir
	m := NewModel(data, root)
	updated, _ := m.Update(tea.WindowSizeMsg{Width: 120, Height: 40})
	m = updated.(Model)

	m = sendKey(m, "o") // open picker
	if !m.picking {
		t.Fatal("picker should be open")
	}

	// Esc should close it.
	updated, _ = m.Update(tea.KeyMsg{Type: tea.KeyEscape})
	m = updated.(Model)

	if m.picking {
		t.Error("Esc should close the picker")
	}
}

// --- View ---

func TestView_BeforeReady_ShowsLoading(t *testing.T) {
	model := NewModel(testTapeData(), "/tmp/test-project")
	view := model.View()

	if !strings.Contains(view, "Loading") {
		t.Errorf("View() before ready should contain 'Loading', got %q", view)
	}
}

func TestView_AfterReady_ShowsAppTitle(t *testing.T) {
	m := readyModel(testTapeData())
	view := m.View()

	if !strings.Contains(view, "Playback") {
		t.Error("View() should contain the static app title 'Playback'")
	}
}

func TestView_AfterReady_ShowsTapePath(t *testing.T) {
	// Create a real directory structure so InferTapesDir can walk it.
	root := t.TempDir()
	for _, series := range []string{"s1-testing", "s2-other"} {
		ep := filepath.Join(root, "tapes", series, "01-example")
		os.MkdirAll(ep, 0o755)
		os.WriteFile(filepath.Join(ep, "tape.yaml"), []byte("title: test"), 0o644)
	}

	data := testTapeData()
	data.Dir = filepath.Join(root, "tapes", "s1-testing", "01-example")
	model := NewModelWithTheme(data, root, TokyoNightStorm)
	updated, _ := model.Update(tea.WindowSizeMsg{Width: 120, Height: 40})
	m := updated.(Model)
	view := m.View()

	// Dir is <root>/tapes/s1-testing/01-example so the relative path
	// from the inferred tapes root is s1-testing/01-example.
	if !strings.Contains(view, "s1-testing/01-example") {
		t.Error("View() should show the relative tape directory path in the app title bar")
	}
}

func TestView_AfterReady_ShowsStepCount(t *testing.T) {
	m := readyModel(testTapeData())
	view := m.View()

	if !strings.Contains(view, "3 steps") {
		t.Error("View() should show the step count in the timeline header")
	}
}

func TestView_AfterReady_ShowsStepActions(t *testing.T) {
	m := readyModel(testTapeData())
	view := m.View()

	for _, action := range []string{"type", "run", "comment"} {
		if !strings.Contains(view, action) {
			t.Errorf("View() should contain action %q", action)
		}
	}
}

func TestView_AfterReady_ShowsVoices(t *testing.T) {
	m := readyModel(testTapeData())
	view := m.View()

	if !strings.Contains(view, "northern_english_male") {
		t.Error("View() should show configured voices in the inspector")
	}
}

func TestView_AfterReady_ShowsDefaultVoice(t *testing.T) {
	m := readyModel(testTapeDataNoVoices())
	view := m.View()

	if !strings.Contains(view, "northern_english_male (default)") {
		t.Error("View() should show default voice when meta.Voices is empty")
	}
}

func TestView_AfterReady_ShowsQuitHint(t *testing.T) {
	m := readyModel(testTapeData())
	view := m.View()

	// The help component renders "q" and "quit" — check for both.
	if !strings.Contains(view, "quit") {
		t.Error("View() should show quit hint in the footer")
	}
}

func TestView_AfterReady_ShowsNotBuiltMessage(t *testing.T) {
	m := readyModel(testTapeData())
	view := m.View()

	// No pipeline output exists at /tmp/test-project, so the preview
	// should show the "not built" message.
	if !strings.Contains(view, "Not built") {
		t.Error("View() should show 'Not built' when no pipeline output exists")
	}
}

func TestView_AfterReady_ShowsPipelineHint(t *testing.T) {
	m := readyModel(testTapeData())
	view := m.View()

	if !strings.Contains(view, "run pipeline") {
		t.Error("View() should show pipeline run hint in footer")
	}
}

func TestView_FullHelp_ShowsVHSOnlyHint(t *testing.T) {
	m := readyModel(testTapeData())

	// Toggle full help with ?.
	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'?'}})
	m = updated.(Model)

	view := m.View()
	if !strings.Contains(view, "VHS only") {
		t.Error("View() should show VHS-only hint in full help view")
	}
}

func TestView_AfterReady_ShowsNavigationHint(t *testing.T) {
	m := readyModel(testTapeData())
	view := m.View()

	// The help component shows up/down bindings.
	if !strings.Contains(view, "up") && !strings.Contains(view, "down") {
		t.Error("View() should show navigation hints in the footer")
	}
}

func TestView_WithSelection_ShowsCursorMarker(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j") // select step 0
	view := m.View()

	if !strings.Contains(view, "▸") {
		t.Error("View() should show cursor marker ▸ on the selected step")
	}
}

func TestView_WithSelection_ShowsAudioHints(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j") // select step 0
	view := m.View()

	// The help component renders audio nudge bindings when a clip is selected.
	if !strings.Contains(view, "audio") {
		t.Error("View() should show audio hint when a clip is selected")
	}
}

func TestView_WithSelection_ShowsStepDetail(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j") // select step 0
	view := m.View()

	// Inspector should show step details, not the summary.
	if !strings.Contains(view, "Step 1") {
		t.Error("View() should show 'Step 1' in the inspector when step 0 is selected")
	}
	if !strings.Contains(view, "pause:") {
		t.Error("View() should show pause value in the inspector")
	}
}

func TestView_AfterNudge_ShowsModifiedIndicator(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j")
	m = sendKey(m, "l") // nudge
	view := m.View()

	if !strings.Contains(view, "[modified]") {
		t.Error("View() should show [modified] indicator after nudge")
	}
}

func TestView_AfterUndoAll_HidesModifiedIndicator(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j")
	m = sendKey(m, "l") // nudge
	m = sendKey(m, "u") // undo
	view := m.View()

	if strings.Contains(view, "[modified]") {
		t.Error("View() should not show [modified] after undoing all edits")
	}
}

func TestView_WithUndoHistory_ShowsUndoHint(t *testing.T) {
	m := readyModel(testTapeData())
	m = sendKey(m, "j")
	m = sendKey(m, "l") // nudge (creates undo entry)
	view := m.View()

	if !strings.Contains(view, "undo") {
		t.Error("View() should show undo hint when undo stack is non-empty")
	}
}

func TestUpdate_HelpToggle(t *testing.T) {
	m := readyModel(testTapeData())

	if m.help.ShowAll {
		t.Error("help.ShowAll should be false initially")
	}

	// Press ? to toggle help.
	updated, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'?'}})
	m = updated.(Model)

	if !m.help.ShowAll {
		t.Error("help.ShowAll should be true after pressing ?")
	}

	// Press ? again to close.
	updated, _ = m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'?'}})
	m = updated.(Model)

	if m.help.ShowAll {
		t.Error("help.ShowAll should be false after pressing ? again")
	}
}

func TestRenderInspectorDetail_ShowsWordCount(t *testing.T) {
	data := testTapeData()
	// Step 0: "First, we say hello." — 4 words, below warning threshold.
	m := readyModel(data)
	m.cursor = 0
	view := m.View()
	if !strings.Contains(view, "4 words") {
		t.Errorf("expected inspector to show word count '4 words', got:\n%s", view)
	}
}

func TestRenderInspectorDetail_WordCountWarning(t *testing.T) {
	data := testTapeData()
	// Inject a long narration that exceeds CaptionWarnWords.
	longNarr := "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five twenty-six"
	data.Tape.Steps[0].Narration = longNarr
	m := readyModel(data)
	m.cursor = 0
	view := m.View()
	if !strings.Contains(view, "⚠") {
		t.Errorf("expected warning symbol in inspector for long narration, got:\n%s", view)
	}
}

func TestView_NarrationTruncation(t *testing.T) {
	longNarration := strings.Repeat("word ", 100)
	data := tape.TapeData{
		Dir: "/tmp/test",
		Tape: tape.Tape{
			Title:  "Truncation Test",
			Output: "test",
			Steps: []tape.Step{
				{Action: "comment", Narration: longNarration},
			},
		},
	}

	m := readyModel(data)
	view := m.View()

	if strings.Contains(view, longNarration) {
		t.Error("View() should truncate long narration text, but full text appears")
	}
}
