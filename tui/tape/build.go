package tape

import (
	"os"
	"path/filepath"
)

// DefaultOutputDir is the pipeline's default output directory name,
// matching the outputDir default in playback.config.ts.
const DefaultOutputDir = "blockbuster"

// BuildStatus describes what pipeline outputs exist for a tape.
type BuildStatus struct {
	// HasMP4 is true if the final stitched video exists.
	HasMP4 bool
	// HasRawMP4 is true if the raw VHS recording exists (pipeline ran
	// at least through the VHS stage).
	HasRawMP4 bool
	// HasVTT is true if WebVTT captions exist.
	HasVTT bool
	// HasGIF is true if the downscaled GIF exists.
	HasGIF bool
	// MP4Path is the absolute path to the final .mp4 (even if it doesn't exist yet).
	MP4Path string
	// OutputDir is the absolute path to the output directory for this tape.
	OutputDir string
}

// Built returns true if the pipeline has completed successfully — the
// final .mp4 exists.
func (b BuildStatus) Built() bool {
	return b.HasMP4
}

// Partial returns true if some outputs exist but the pipeline didn't
// finish (e.g. raw recording exists but final video doesn't).
func (b BuildStatus) Partial() bool {
	return b.HasRawMP4 && !b.HasMP4
}

// CheckBuildStatus checks what pipeline outputs exist for a tape.
// projectRoot is the root of the playback project (where playback.config.ts
// lives). The output path is derived from the tape's Output field using
// the same convention as the TypeScript pipeline:
//
//	<projectRoot>/<outputDir>/<tape.output>/<slug>.<ext>
//
// where slug is filepath.Base(tape.output).
func CheckBuildStatus(projectRoot string, t Tape) BuildStatus {
	slug := filepath.Base(t.Output)
	outputDir := filepath.Join(projectRoot, DefaultOutputDir, t.Output)

	status := BuildStatus{
		MP4Path:   filepath.Join(outputDir, slug+".mp4"),
		OutputDir: outputDir,
	}

	status.HasMP4 = fileExists(filepath.Join(outputDir, slug+".mp4"))
	status.HasRawMP4 = fileExists(filepath.Join(outputDir, slug+".raw.mp4"))
	status.HasVTT = fileExists(filepath.Join(outputDir, slug+".vtt"))
	status.HasGIF = fileExists(filepath.Join(outputDir, slug+".gif"))

	return status
}

// fileExists returns true if path exists and is a regular file.
func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
