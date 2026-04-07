package tape

import "strings"

// PipelineProgressMsg is a bubbletea message carrying the current pipeline
// progress as a percentage (0.0 to 1.0).
type PipelineProgressMsg struct {
	Percent float64
	Stage   string
}

// Pipeline stage markers and their progress percentages. These match the
// console.log output from src/cli.ts. The percentages are weighted by
// typical stage duration: VHS recording is the slowest, ffmpeg stitching
// is second.
var pipelineStages = []struct {
	marker  string
	percent float64
	label   string
}{
	{"Validating", 0.05, "Validating"},
	{"Recording terminal", 0.10, "Recording terminal"},
	{"Extracting narration", 0.35, "Extracting narration"},
	{"Synthesising audio", 0.45, "Synthesising audio"},
	{"Generating captions", 0.65, "Generating captions"},
	{"Stitching video", 0.75, "Stitching video"},
	{"Done.", 1.0, "Complete"},
}

// ParseProgress checks a pipeline output line for stage markers and
// returns the corresponding progress if found. Returns nil if the line
// doesn't match any known stage.
func ParseProgress(line string) *PipelineProgressMsg {
	for _, stage := range pipelineStages {
		if strings.Contains(line, stage.marker) {
			return &PipelineProgressMsg{
				Percent: stage.percent,
				Stage:   stage.label,
			}
		}
	}
	return nil
}
