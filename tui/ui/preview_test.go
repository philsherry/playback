package ui

import (
	"testing"

	"github.com/philsherry/playback/tui/tape"
)

// --- formatTimestamp ---

func TestFormatTimestamp_Zero(t *testing.T) {
	if got := formatTimestamp(0); got != "00:00:00.000" {
		t.Errorf("formatTimestamp(0) = %q, want %q", got, "00:00:00.000")
	}
}

func TestFormatTimestamp_Seconds(t *testing.T) {
	got := formatTimestamp(5.5)
	if got != "00:00:05.500" {
		t.Errorf("formatTimestamp(5.5) = %q, want %q", got, "00:00:05.500")
	}
}

func TestFormatTimestamp_Minutes(t *testing.T) {
	got := formatTimestamp(90.25)
	if got != "00:01:30.250" {
		t.Errorf("formatTimestamp(90.25) = %q, want %q", got, "00:01:30.250")
	}
}

func TestFormatTimestamp_Hours(t *testing.T) {
	got := formatTimestamp(3661.0)
	if got != "01:01:01.000" {
		t.Errorf("formatTimestamp(3661) = %q, want %q", got, "01:01:01.000")
	}
}

// --- CheckPreviewDeps ---

func TestCheckPreviewDeps_ReturnsBoolean(t *testing.T) {
	// Just verify it doesn't panic. The result depends on the system.
	_ = CheckPreviewDeps()
}

// --- RenderFrameForStep ---

func TestRenderFrameForStep_NotBuilt(t *testing.T) {
	status := tape.BuildStatus{} // not built
	steps := []tape.Step{{Action: "run"}}

	_, err := RenderFrameForStep(status, steps, 0, 80, 20)
	if err == nil {
		t.Error("should return error when video not built")
	}
}

func TestRenderFrameForStep_TooSmall(t *testing.T) {
	// Even with a built video, if area is too small it should error.
	_, err := RenderFrame("/tmp/test.mp4", 0, 2, 1)
	if err == nil {
		t.Error("should return error for tiny preview area")
	}
}

// --- fit16x9 ---

func TestFit16x9_WidePanel(t *testing.T) {
	// Panel wider than 16:9 — height should be the constraint.
	w, h := fit16x9(100, 20)
	// 20 chars tall × 2 (char aspect) = 40 pixel-equiv height.
	// 40 × 16/9 = 71 width. Height = 40/2 = 20.
	if w > 100 {
		t.Errorf("width %d exceeds panel width 100", w)
	}
	if h > 20 {
		t.Errorf("height %d exceeds panel height 20", h)
	}
	// Check approximate 16:9 ratio accounting for char aspect.
	// w should be roughly 2 * h * 16/9.
	ratio := float64(w) / float64(h*2) // pixel-equivalent ratio
	if ratio < 1.5 || ratio > 2.0 {
		t.Errorf("aspect ratio %f not close to 16:9 (1.78)", ratio)
	}
}

func TestFit16x9_TallPanel(t *testing.T) {
	// Panel taller than 16:9 — width should be the constraint.
	w, h := fit16x9(40, 40)
	if w > 40 {
		t.Errorf("width %d exceeds panel width 40", w)
	}
	if h > 40 {
		t.Errorf("height %d exceeds panel height 40", h)
	}
}

func TestFit16x9_ExactRatio(t *testing.T) {
	// Panel that exactly matches 16:9 with char aspect.
	// 80 wide, 80*9/(16*2) = 22.5 → 22 chars tall.
	w, h := fit16x9(80, 22)
	if w > 80 || h > 22 {
		t.Errorf("fit16x9(80, 22) = %d×%d, exceeds bounds", w, h)
	}
}

func TestFit16x9_TinyPanel(t *testing.T) {
	w, h := fit16x9(2, 1)
	// Should clamp to minimums.
	if w < 4 {
		t.Errorf("width %d below minimum 4", w)
	}
	if h < 2 {
		t.Errorf("height %d below minimum 2", h)
	}
}

func TestFit16x9_SquarePanel(t *testing.T) {
	w, h := fit16x9(50, 50)
	// 16:9 in a square should be width-constrained.
	if w > 50 {
		t.Errorf("width %d exceeds 50", w)
	}
	// Height should be less than width (16:9 is landscape).
	if h >= w {
		t.Errorf("height %d should be less than width %d for 16:9", h, w)
	}
}

func TestFit16x9_TypicalPreviewPanel(t *testing.T) {
	// Simulate a typical 120-col terminal preview panel.
	// The panel is wider than 16:9, so the frame should fill the full
	// width and use height as the constraint.
	layout := CalculateLayout(120, 40)
	w, h := fit16x9(layout.PreviewWidth, layout.PreviewHeight)

	if w < layout.PreviewWidth/2 {
		t.Errorf(
			"frame width %d is less than half the panel width %d — frame should fill the panel",
			w, layout.PreviewWidth,
		)
	}
	if h > layout.PreviewHeight {
		t.Errorf("frame height %d exceeds panel height %d", h, layout.PreviewHeight)
	}
	if w > layout.PreviewWidth {
		t.Errorf("frame width %d exceeds panel width %d", w, layout.PreviewWidth)
	}
}

// --- PreviewState ---

func TestPreviewState_InitiallyEmpty(t *testing.T) {
	state := PreviewState{}

	if state.Rendered != "" {
		t.Error("Rendered should be empty initially")
	}
	if state.Available {
		t.Error("Available should be false by default")
	}
}

func TestPreviewState_WithDeps(t *testing.T) {
	state := PreviewState{Available: CheckPreviewDeps()}
	// Just verify the struct works — actual availability depends on system.
	_ = state.Available
}
