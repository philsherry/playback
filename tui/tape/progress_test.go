package tape

import (
	"math"
	"testing"
)

func TestParseProgress_RecognisesAllStages(t *testing.T) {
	cases := []struct {
		line    string
		percent float64
		stage   string
	}{
		{"  Validating skills paths…", 0.05, "Validating"},
		{"  Recording terminal…", 0.10, "Recording terminal"},
		{"  Extracting narration…", 0.35, "Extracting narration"},
		{"  Synthesising audio (northern_english_male)…", 0.45, "Synthesising audio"},
		{"  Generating captions…", 0.65, "Generating captions"},
		{"  Stitching video…", 0.75, "Stitching video"},
		{"✓ Done. Output: playback/test", 1.0, "Complete"},
	}

	for _, tc := range cases {
		p := ParseProgress(tc.line)
		if p == nil {
			t.Errorf("ParseProgress(%q) = nil, want stage %q", tc.line, tc.stage)
			continue
		}
		if math.Abs(p.Percent-tc.percent) > 0.001 {
			t.Errorf("ParseProgress(%q).Percent = %f, want %f", tc.line, p.Percent, tc.percent)
		}
		if p.Stage != tc.stage {
			t.Errorf("ParseProgress(%q).Stage = %q, want %q", tc.line, p.Stage, tc.stage)
		}
	}
}

func TestParseProgress_UnknownLine(t *testing.T) {
	p := ParseProgress("  Voice: northern_english_male")
	if p != nil {
		t.Errorf("ParseProgress should return nil for unrecognised line, got %+v", p)
	}
}

func TestParseProgress_EmptyLine(t *testing.T) {
	p := ParseProgress("")
	if p != nil {
		t.Error("ParseProgress should return nil for empty line")
	}
}

func TestParseProgress_PartialMatch(t *testing.T) {
	// "Recording" without "terminal" shouldn't match.
	p := ParseProgress("Recording something else")
	if p != nil && p.Stage == "Recording terminal" {
		t.Error("should not match partial stage name")
	}
}

func TestParseProgress_DoneIsComplete(t *testing.T) {
	p := ParseProgress("✓ Done. Output: /some/path")
	if p == nil {
		t.Fatal("should match Done line")
		return
	}
	if p.Percent != 1.0 {
		t.Errorf("Done should be 100%%, got %f", p.Percent)
	}
}
