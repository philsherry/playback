package ui

// Layout holds the computed dimensions for the TUI panels.
//
// The screen has two rows:
//
//	Title row: Borderless app title spanning the full terminal width.
//	Outer box: A single rounded border wrapping everything else:
//	  Top row:   [Preview (2/3 width, bordered)] [Step list (1/3 width, bordered)]
//	  Timeline:  [Audio bars + ruler (full width, bordered)]
//	  Inspector: [Step details (full width, bordered)]
//	  Footer:    Keybinding hints (no border)
type Layout struct {
	// Top row — left column (video preview).
	// Width and Height are content dimensions (lipgloss adds borders outside).
	PreviewWidth  int
	PreviewHeight int

	// Top row — right column (scrollable step list).
	StepListWidth  int
	StepListHeight int

	// Timeline — full-width audio bar lanes + ruler.
	TimelineWidth  int
	TimelineHeight int

	// Inspector — full-width step details.
	InspectorWidth  int
	InspectorHeight int

	// Content width inside the outer border (for inner panels).
	FullWidth int

	// Outer border content width (terminal width minus outer border chars).
	OuterWidth int
}

const (
	// minTopRowHeight is the smallest the top row panels can be.
	minTopRowHeight = 8
	// timelineHeight is the fixed height for the audio bar panel.
	timelineHeight = 6
	// minInspectorHeight is the smallest the inspector can be.
	minInspectorHeight = 4
	// minStepListWidth ensures the step list is usable.
	minStepListWidth = 30
	// borderSize accounts for top + bottom border chars per panel.
	borderSize = 2
	// footerHeight is the single row for keybinding hints.
	footerHeight = 1
	// appTitleHeight is the single row for the application title bar.
	appTitleHeight = 1
)

// CalculateLayout computes panel dimensions from terminal size.
//
// The title row sits borderless at the top. Everything below it is
// wrapped in one outer rounded border. Inner panels have their own
// borders inside that outer container.
//
// lipgloss Width(n) sets the CONTENT width; borders are added outside,
// so a bordered panel with Width(n) renders at n+2 total chars.
//
// Width budget (e.g. terminal = 120):
//
//	Outer border:  Width(118) → renders 120 total.  outerW = 118.
//	Inner content: 118 chars available.
//	Full-width panel: Width(116) → renders 118.     fullW = 116.
//	Top row (two panels side by side):
//	  Preview Width(PW) renders PW+2, StepList Width(SW) renders SW+2.
//	  PW+2 + SW+2 = 118  →  PW + SW = 114  =  fullW - borderSize.
//	  topRowW = 114.
func CalculateLayout(width, height int) Layout {
	// outerW = content width of the outer border box.
	outerW := max(width-borderSize, 10)
	// fullW = content width for a single full-width bordered panel inside outer.
	fullW := max(outerW-borderSize, 10)
	// topRowW = combined content widths for two side-by-side bordered panels.
	// Two panels each add borderSize (2), so we lose one extra borderSize.
	topRowW := max(fullW-borderSize, 10)

	// Vertical budget: title (1 row) + outer border (2 rows) + footer
	// inside the outer border (1 row) + 3 inner panel borders (6 rows).
	usableH := height - appTitleHeight - borderSize // title + outer border
	panelBorders := borderSize * 3                  // top row + timeline + inspector
	contentH := usableH - footerHeight - panelBorders
	if contentH < minTopRowHeight+timelineHeight+minInspectorHeight {
		contentH = minTopRowHeight + timelineHeight + minInspectorHeight
	}

	// Fixed heights for timeline and inspector.
	tlH := timelineHeight
	inspH := max(contentH*15/100, minInspectorHeight)
	topH := max(contentH-tlH-inspH, minTopRowHeight)

	// Horizontal split for top row: left 2/3, right 1/3.
	leftW := max(topRowW*2/3, 20)
	rightW := max(topRowW-leftW, minStepListWidth)

	// Heights are content-only. lipgloss adds border rows automatically
	// when the style has a BorderStyle, so we must NOT add borderSize here.
	return Layout{
		PreviewWidth:  leftW,
		PreviewHeight: topH,

		StepListWidth:  rightW,
		StepListHeight: topH,

		TimelineWidth:  fullW,
		TimelineHeight: tlH,

		InspectorWidth:  fullW,
		InspectorHeight: inspH,

		FullWidth:  fullW,
		OuterWidth: outerW,
	}
}
