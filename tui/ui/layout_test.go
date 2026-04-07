package ui

import "testing"

func TestCalculateLayout_StandardTerminal(t *testing.T) {
	layout := CalculateLayout(120, 40)

	// OuterWidth = terminal minus outer border chars.
	wantOuter := 120 - borderSize
	if layout.OuterWidth != wantOuter {
		t.Errorf("OuterWidth = %d, want %d", layout.OuterWidth, wantOuter)
	}

	// FullWidth = outerW minus one inner panel's border chars.
	wantFull := wantOuter - borderSize
	if layout.FullWidth != wantFull {
		t.Errorf("FullWidth = %d, want %d", layout.FullWidth, wantFull)
	}
}

func TestCalculateLayout_TwoColumnSplit(t *testing.T) {
	layout := CalculateLayout(120, 40)

	if layout.PreviewWidth < layout.StepListWidth {
		t.Errorf(
			"PreviewWidth (%d) should be larger than StepListWidth (%d)",
			layout.PreviewWidth,
			layout.StepListWidth,
		)
	}
	// Two side-by-side bordered panels: rendered = (PW+2) + (SW+2).
	// Must fit inside outerW content area.
	rendered := layout.PreviewWidth + borderSize + layout.StepListWidth + borderSize
	if rendered > layout.OuterWidth {
		t.Errorf(
			"top row too wide: (%d+2) + (%d+2) = %d > outer %d",
			layout.PreviewWidth,
			layout.StepListWidth,
			rendered,
			layout.OuterWidth,
		)
	}
}

func TestCalculateLayout_TopRowSameHeight(t *testing.T) {
	layout := CalculateLayout(120, 40)

	if layout.PreviewHeight != layout.StepListHeight {
		t.Errorf(
			"PreviewHeight (%d) should equal StepListHeight (%d)",
			layout.PreviewHeight,
			layout.StepListHeight,
		)
	}
}

func TestCalculateLayout_TimelineFixedHeight(t *testing.T) {
	layout := CalculateLayout(120, 40)

	// Layout heights are content-only (lipgloss adds borders outside).
	if layout.TimelineHeight != timelineHeight {
		t.Errorf("TimelineHeight = %d, want %d", layout.TimelineHeight, timelineHeight)
	}
}

func TestCalculateLayout_TimelineFullWidth(t *testing.T) {
	layout := CalculateLayout(120, 40)

	if layout.TimelineWidth != layout.FullWidth {
		t.Errorf(
			"TimelineWidth (%d) should equal FullWidth (%d)",
			layout.TimelineWidth,
			layout.FullWidth,
		)
	}
}

func TestCalculateLayout_InspectorFullWidth(t *testing.T) {
	layout := CalculateLayout(120, 40)

	if layout.InspectorWidth != layout.FullWidth {
		t.Errorf(
			"InspectorWidth (%d) should equal FullWidth (%d)",
			layout.InspectorWidth,
			layout.FullWidth,
		)
	}
}

func TestCalculateLayout_LargeTerminal(t *testing.T) {
	layout := CalculateLayout(200, 60)

	// Layout heights are content-only.
	if layout.PreviewHeight < minTopRowHeight {
		t.Errorf("PreviewHeight = %d, too small", layout.PreviewHeight)
	}
	if layout.InspectorHeight < minInspectorHeight {
		t.Errorf("InspectorHeight = %d, too small", layout.InspectorHeight)
	}
}

func TestCalculateLayout_TinyTerminal(t *testing.T) {
	layout := CalculateLayout(20, 10)

	if layout.StepListWidth < minStepListWidth {
		t.Errorf(
			"StepListWidth = %d, want >= %d",
			layout.StepListWidth,
			minStepListWidth,
		)
	}
}

func TestCalculateLayout_NarrowTerminal(t *testing.T) {
	layout := CalculateLayout(5, 40)

	if layout.FullWidth < 10 {
		t.Errorf("FullWidth = %d, want >= 10", layout.FullWidth)
	}
}

func TestCalculateLayout_HeightsNeverNegative(t *testing.T) {
	layout := CalculateLayout(80, 1)

	if layout.PreviewHeight < 0 {
		t.Errorf("PreviewHeight = %d, negative", layout.PreviewHeight)
	}
	if layout.TimelineHeight < 0 {
		t.Errorf("TimelineHeight = %d, negative", layout.TimelineHeight)
	}
	if layout.InspectorHeight < 0 {
		t.Errorf("InspectorHeight = %d, negative", layout.InspectorHeight)
	}
}

func TestCalculateLayout_ZeroDimensions(t *testing.T) {
	layout := CalculateLayout(0, 0)

	if layout.FullWidth < 10 {
		t.Errorf("FullWidth = %d, want >= 10", layout.FullWidth)
	}
}
