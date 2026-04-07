package ui

import (
	"testing"
)

// --- assignLanes ---

func TestAssignLanes_NoOverlap(t *testing.T) {
	clips := []clip{
		{startCol: 0, endCol: 5},
		{startCol: 5, endCol: 10},
		{startCol: 10, endCol: 15},
	}
	assignLanes(clips)

	// No overlap — all should be in lane 0.
	for i, c := range clips {
		if c.lane != 0 {
			t.Errorf("clip %d lane = %d, want 0 (no overlap)", i, c.lane)
		}
	}
}

func TestAssignLanes_FullOverlap(t *testing.T) {
	clips := []clip{
		{startCol: 0, endCol: 10},
		{startCol: 0, endCol: 10},
		{startCol: 0, endCol: 10},
	}
	assignLanes(clips)

	// All overlap — each should be in a different lane.
	lanes := make(map[int]bool)
	for _, c := range clips {
		lanes[c.lane] = true
	}
	if len(lanes) != 3 {
		t.Errorf("expected 3 lanes for fully overlapping clips, got %d", len(lanes))
	}
}

func TestAssignLanes_PartialOverlap(t *testing.T) {
	clips := []clip{
		{startCol: 0, endCol: 10},
		{startCol: 5, endCol: 15},  // overlaps with 0
		{startCol: 10, endCol: 20}, // overlaps with 1 but not 0
	}
	assignLanes(clips)

	if clips[0].lane != 0 {
		t.Errorf("clip 0 lane = %d, want 0", clips[0].lane)
	}
	if clips[1].lane != 1 {
		t.Errorf("clip 1 lane = %d, want 1 (overlaps with 0)", clips[1].lane)
	}
	// Clip 2 starts at 10, clip 0 ends at 10 — so clip 2 fits in lane 0.
	if clips[2].lane != 0 {
		t.Errorf("clip 2 lane = %d, want 0 (fits after clip 0)", clips[2].lane)
	}
}

func TestAssignLanes_EmptySlice(t *testing.T) {
	// Should not panic.
	assignLanes(nil)
	assignLanes([]clip{})
}

func TestAssignLanes_SingleClip(t *testing.T) {
	clips := []clip{{startCol: 0, endCol: 5}}
	assignLanes(clips)

	if clips[0].lane != 0 {
		t.Errorf("single clip lane = %d, want 0", clips[0].lane)
	}
}

// --- chooseTickInterval ---

func TestChooseTickInterval_ShortDuration(t *testing.T) {
	interval := chooseTickInterval(10, 120)
	if interval < 1 || interval > 5 {
		t.Errorf("interval = %f, expected 1-5 for 10s duration", interval)
	}
}

func TestChooseTickInterval_LongDuration(t *testing.T) {
	interval := chooseTickInterval(300, 120)
	if interval < 10 {
		t.Errorf("interval = %f, expected >= 10 for 5m duration", interval)
	}
}

func TestChooseTickInterval_NarrowWidth(t *testing.T) {
	interval := chooseTickInterval(60, 20)
	// With only 20 chars, we want very few ticks.
	if interval < 10 {
		t.Errorf("interval = %f, expected >= 10 for narrow width", interval)
	}
}

func TestChooseTickInterval_ZeroWidth(t *testing.T) {
	interval := chooseTickInterval(60, 0)
	if interval != 60 {
		t.Errorf("interval = %f, want 60 (total duration fallback)", interval)
	}
}

// --- formatTimeShort ---

func TestFormatTimeShort_Seconds(t *testing.T) {
	if got := formatTimeShort(5); got != "5s" {
		t.Errorf("formatTimeShort(5) = %q, want %q", got, "5s")
	}
}

func TestFormatTimeShort_Zero(t *testing.T) {
	if got := formatTimeShort(0); got != "0s" {
		t.Errorf("formatTimeShort(0) = %q, want %q", got, "0s")
	}
}

func TestFormatTimeShort_Minutes(t *testing.T) {
	if got := formatTimeShort(120); got != "2m" {
		t.Errorf("formatTimeShort(120) = %q, want %q", got, "2m")
	}
}

func TestFormatTimeShort_MinutesAndSeconds(t *testing.T) {
	if got := formatTimeShort(90); got != "1m30s" {
		t.Errorf("formatTimeShort(90) = %q, want %q", got, "1m30s")
	}
}

// --- renderAudioTimeline (integration) ---

func TestRenderAudioTimeline_NonEmpty(t *testing.T) {
	m := readyModel(testTapeData())
	result := m.renderAudioTimeline(80, 5)

	// Should produce non-empty output with narrated steps.
	if result == "" {
		t.Error("renderAudioTimeline should produce non-empty output")
	}
}

func TestRenderAudioTimeline_ContainsRuler(t *testing.T) {
	m := readyModel(testTapeData())
	result := m.renderAudioTimeline(80, 5)

	// The ruler uses ─ and ┼ characters.
	if !containsAny(result, "─", "┼") {
		t.Error("renderAudioTimeline should contain ruler characters")
	}
}

func TestRenderAudioTimeline_ZeroDuration(t *testing.T) {
	m := readyModel(testTapeData())
	m.tapeData.Tape.Steps = nil
	result := m.renderAudioTimeline(80, 5)

	if result != "" {
		t.Error("renderAudioTimeline should return empty for zero duration")
	}
}

func TestRenderAudioTimeline_NarrowWidth(t *testing.T) {
	m := readyModel(testTapeData())
	// Width < 10 returns empty — should not panic.
	result := m.renderAudioTimeline(5, 3)
	if result != "" {
		t.Error("renderAudioTimeline should return empty for width < 10")
	}
}

// containsAny checks if s contains any of the given substrings.
func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if len(sub) > 0 {
			for i := 0; i <= len(s)-len(sub); i++ {
				if s[i:i+len(sub)] == sub {
					return true
				}
			}
		}
	}
	return false
}
