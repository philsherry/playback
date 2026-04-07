package ui

import (
	"strings"
	"testing"

	"github.com/philsherry/playback/tui/tape"
)

func simSteps() []tape.Step {
	pause2 := 2.0
	pause1 := 1.0
	return []tape.Step{
		{
			Action:    "type",
			Command:   "git clone https://github.com/example/repo",
			Narration: "Clone the repo.",
			Pause:     &pause2,
		},
		{Action: "run", Pause: &pause1},
		{Action: "type", Command: "cd repo", Pause: &pause1},
		{Action: "run"},
		{Action: "type", Command: "ls", Narration: "Let's see what's inside.", Pause: &pause2},
		{Action: "run", Narration: "The directory listing shows three folders."},
		{Action: "comment", Narration: "That's all for this demo."},
	}
}

// --- Terminal content ---

func TestTermSim_ShowsPromptAndCommand(t *testing.T) {
	term, _ := RenderTerminalSim(simSteps(), 0, 80, 20, TokyoNightStorm, nil)

	if !strings.Contains(term, "$") {
		t.Error("should show a prompt character")
	}
	if !strings.Contains(term, "git clone") {
		t.Error("should show the typed command")
	}
}

func TestTermSim_AccumulatesCommands(t *testing.T) {
	term, _ := RenderTerminalSim(simSteps(), 4, 80, 20, TokyoNightStorm, nil)

	if !strings.Contains(term, "git clone") {
		t.Error("should show earlier command")
	}
	if !strings.Contains(term, "cd repo") {
		t.Error("should show second command")
	}
	if !strings.Contains(term, "ls") {
		t.Error("should show current command")
	}
}

func TestTermSim_RunStepShowsRunning(t *testing.T) {
	term, _ := RenderTerminalSim(simSteps(), 1, 80, 20, TokyoNightStorm, nil)

	if !strings.Contains(term, "running") {
		t.Error("run step should show running indicator")
	}
}

func TestTermSim_EmptySteps(t *testing.T) {
	term, caption := RenderTerminalSim(nil, 0, 80, 20, TokyoNightStorm, nil)

	if term != "" || caption != "" {
		t.Error("should return empty for nil steps")
	}
}

func TestTermSim_NegativeCursor(t *testing.T) {
	term, _ := RenderTerminalSim(simSteps(), -1, 80, 20, TokyoNightStorm, nil)

	if !strings.Contains(term, "git clone") {
		t.Error("cursor -1 should show step 0")
	}
}

func TestTermSim_TinyPanel(t *testing.T) {
	term, caption := RenderTerminalSim(simSteps(), 0, 5, 1, TokyoNightStorm, nil)

	if term != "" || caption != "" {
		t.Error("should return empty for tiny panel")
	}
}

func TestTermSim_HighContrastTheme(t *testing.T) {
	term, _ := RenderTerminalSim(simSteps(), 0, 80, 20, HighContrast, nil)

	if term == "" {
		t.Error("should produce output with high contrast theme")
	}
}

// --- Captions ---

func TestTermSim_CaptionOnTypeStep(t *testing.T) {
	_, caption := RenderTerminalSim(simSteps(), 0, 80, 20, TokyoNightStorm, nil)

	if !strings.Contains(caption, "Clone the repo") {
		t.Error("should show narration as caption for type step")
	}
}

func TestTermSim_CaptionOnCommentStep(t *testing.T) {
	_, caption := RenderTerminalSim(simSteps(), 6, 80, 20, TokyoNightStorm, nil)

	if !strings.Contains(caption, "That's all") {
		t.Error("should show narration as caption for comment step")
	}
}

func TestTermSim_NoCaptionOnRunWithoutNarration(t *testing.T) {
	_, caption := RenderTerminalSim(simSteps(), 3, 80, 20, TokyoNightStorm, nil)

	if caption != "" {
		t.Errorf("run step without narration should have no caption, got %q", caption)
	}
}

func TestTermSim_CaptionOnRunWithNarration(t *testing.T) {
	_, caption := RenderTerminalSim(simSteps(), 5, 80, 20, TokyoNightStorm, nil)

	if !strings.Contains(caption, "directory listing") {
		t.Error("should show narration as caption for run step")
	}
}

// --- Placeholder resolution ---

// testConstants provides a sample constants map for placeholder tests.
var testConstants = map[string]string{
	"GDS_SKILLS_ROOT":       "govuk-design-system-skills",
	"GDS_SKILLS_AGENTS_DIR": "govuk-design-system-skills/agents",
}

func TestResolvePlaceholders_KnownKey(t *testing.T) {
	got := resolvePlaceholders("cd {{GDS_SKILLS_ROOT}}", testConstants)
	want := "cd govuk-design-system-skills"
	if got != want {
		t.Errorf("resolvePlaceholders = %q, want %q", got, want)
	}
}

func TestResolvePlaceholders_NestedPath(t *testing.T) {
	got := resolvePlaceholders("ls {{GDS_SKILLS_AGENTS_DIR}}", testConstants)
	want := "ls govuk-design-system-skills/agents"
	if got != want {
		t.Errorf("resolvePlaceholders = %q, want %q", got, want)
	}
}

func TestResolvePlaceholders_UnknownKey(t *testing.T) {
	got := resolvePlaceholders("echo {{UNKNOWN_KEY}}", testConstants)
	want := "echo {{UNKNOWN_KEY}}"
	if got != want {
		t.Errorf("unknown placeholder should pass through: got %q, want %q", got, want)
	}
}

func TestResolvePlaceholders_NoPlaceholders(t *testing.T) {
	got := resolvePlaceholders("echo hello", testConstants)
	want := "echo hello"
	if got != want {
		t.Errorf("no placeholders should pass through: got %q, want %q", got, want)
	}
}

func TestResolvePlaceholders_MultipleInOneCommand(t *testing.T) {
	got := resolvePlaceholders(
		"cp {{GDS_SKILLS_ROOT}}/README.md {{GDS_SKILLS_AGENTS_DIR}}/",
		testConstants,
	)
	if !strings.Contains(got, "govuk-design-system-skills/README.md") {
		t.Error("should resolve first placeholder")
	}
	if !strings.Contains(got, "govuk-design-system-skills/agents/") {
		t.Error("should resolve second placeholder")
	}
}

func TestResolvePlaceholders_NilConstants(t *testing.T) {
	got := resolvePlaceholders("cd {{GDS_SKILLS_ROOT}}", nil)
	want := "cd {{GDS_SKILLS_ROOT}}"
	if got != want {
		t.Errorf("nil constants should leave placeholder: got %q, want %q", got, want)
	}
}

// --- Word wrap ---

func TestWordWrap_ShortText(t *testing.T) {
	got := wordWrap("hello world", 80)
	if got != "hello world" {
		t.Errorf("short text should not wrap: got %q", got)
	}
}

func TestWordWrap_LongText(t *testing.T) {
	got := wordWrap("this is a longer sentence that should wrap at the boundary", 20)
	lines := strings.Split(got, "\n")
	if len(lines) < 2 {
		t.Errorf("should wrap to multiple lines, got %d", len(lines))
	}
	for _, line := range lines {
		if len(line) > 20 {
			t.Errorf("line %q exceeds max width 20", line)
		}
	}
}

func TestWordWrap_Empty(t *testing.T) {
	got := wordWrap("", 80)
	if got != "" {
		t.Errorf("empty text should return empty: got %q", got)
	}
}
