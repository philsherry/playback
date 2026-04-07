package ui

import (
	"bytes"
	"fmt"
	"os/exec"
	"strings"

	"github.com/philsherry/playback/tui/tape"
)

// PreviewState tracks the video preview rendering state.
type PreviewState struct {
	// Available is true if both ffmpeg and chafa are in PATH.
	Available bool
	// Rendered is the most recently rendered frame as terminal art.
	Rendered string
	// AtTime is the timestamp (in seconds) of the rendered frame.
	AtTime float64
	// Error is non-nil if the last render attempt failed.
	Error error
}

// CheckPreviewDeps checks if ffmpeg and chafa are available.
func CheckPreviewDeps() bool {
	_, errFFmpeg := exec.LookPath("ffmpeg")
	_, errChafa := exec.LookPath("chafa")
	return errFFmpeg == nil && errChafa == nil
}

// pixelScale is the number of pixels per terminal character. Chafa maps
// multiple pixels to each character cell, so we extract frames at a
// higher resolution than the terminal dimensions..
const pixelScale = 4

// videoAspect is the aspect ratio of the playback videos (1280x720).
const (
	videoAspectW = 16
	videoAspectH = 9
)

// fit16x9 computes the largest 16:9 rectangle (in terminal rows/cols)
// that fits within the given width and height.
//
// Terminal characters are roughly twice as tall as wide, so we convert
// to pixel-equivalent space (height × 2) for the aspect ratio math,
// then convert back (÷ 2) for terminal rows.
//
// Chafa uses half-block characters (▀▄) which pack two vertical pixels
// per terminal row, so its --size H produces H/2 output lines.
// RenderFrame compensates by doubling the height before calling chafa,
// making chafa output = the charH returned here.
func fit16x9(width, height int) (int, int) {
	// Pixel-equivalent: 1 terminal col = 1 px wide, 1 row = 2 px tall.
	pixW := width
	pixH := height * 2

	// Try width-constrained fit.
	fitW := pixW
	fitH := fitW * videoAspectH / videoAspectW

	// Switch to height-constrained if too tall.
	if fitH > pixH {
		fitH = pixH
		fitW = fitH * videoAspectW / videoAspectH
	}

	// Convert back to terminal rows.
	charW := fitW
	charH := fitH / 2

	if charW < 4 {
		charW = 4
	}
	if charH < 2 {
		charH = 2
	}

	return charW, charH
}

// RenderFrame extracts a single frame from an .mp4 file at the given
// timestamp and renders it as terminal block art via chafa.
//
// width and height are the desired terminal dimensions (in character cells).
// The frame is extracted at pixelScale × the chafa dimensions, then chafa
// maps it back to the target character grid.
//
// Chafa uses half-block characters (▀▄) which pack two vertical pixels
// into each character cell. So chafa's --size WxH means H "pixel rows",
// producing H/2 terminal lines. We pass height*2 to chafa so the output
// fills the requested number of terminal lines.
//
// Pipeline:
//
//	ffmpeg → raw RGBA pixels → convert to PPM in memory → pipe to chafa → terminal art
func RenderFrame(mp4Path string, atTime float64, width, height int) (string, error) {
	if width < 4 || height < 2 {
		return "", fmt.Errorf("preview area too small (%dx%d)", width, height)
	}

	// Chafa height in "pixel rows" — doubled because half-blocks pack
	// 2 vertical pixels per terminal line.
	chafaH := height * 2

	// Compute pixel dimensions — 4x the chafa dimensions, clamped to even
	// numbers (ffmpeg H.264 requirement).
	pixW := roundEven(width * pixelScale)
	pixH := roundEven(chafaH * pixelScale)

	// Step 1: Extract a single frame as raw RGBA with ffmpeg.
	// Use force_original_aspect_ratio=decrease to preserve the video's
	// aspect ratio within the target dimensions, then pad to exact size
	// so the raw output has predictable dimensions for PPM conversion.
	timestamp := formatTimestamp(atTime)
	scaleFilter := fmt.Sprintf(
		"scale=%d:%d:force_original_aspect_ratio=decrease:flags=fast_bilinear,pad=%d:%d:(ow-iw)/2:(oh-ih)/2",
		pixW,
		pixH,
		pixW,
		pixH,
	)
	ffmpegArgs := []string{
		"-ss", timestamp,
		"-i", mp4Path,
		"-vf", scaleFilter,
		"-vframes", "1",
		"-f", "rawvideo",
		"-pix_fmt", "rgba",
		"-loglevel", "error",
		"-",
	}

	ffmpegCmd := exec.Command("ffmpeg", ffmpegArgs...)
	var ffmpegOut bytes.Buffer
	var ffmpegErr bytes.Buffer
	ffmpegCmd.Stdout = &ffmpegOut
	ffmpegCmd.Stderr = &ffmpegErr

	if err := ffmpegCmd.Run(); err != nil {
		return "", fmt.Errorf("ffmpeg: %w (%s)", err, strings.TrimSpace(ffmpegErr.String()))
	}

	if ffmpegOut.Len() == 0 {
		return "", fmt.Errorf("ffmpeg produced no output at %s", timestamp)
	}

	// Step 2: Convert raw RGBA to PPM format in memory.
	// PPM is what chafa expects on stdin. We drop the alpha channel.
	ppm, err := rgbaToPPM(ffmpegOut.Bytes(), pixW, pixH)
	if err != nil {
		return "", fmt.Errorf("rgba to ppm: %w", err)
	}

	// Step 3: Pipe PPM to chafa for terminal rendering.
	chafaArgs := []string{
		"--size", fmt.Sprintf("%dx%d", width, chafaH),
		"--symbols", "block+border+space",
		"--colors", "full",
		"--color-space", "din99d",
		"--dither", "noise",
		"--color-extractor", "median",
		"--format", "symbols",
		"--probe", "off",
		"--animate", "off",
		"-",
	}

	chafaCmd := exec.Command("chafa", chafaArgs...)
	chafaCmd.Stdin = bytes.NewReader(ppm)
	var chafaOut bytes.Buffer
	var chafaErr bytes.Buffer
	chafaCmd.Stdout = &chafaOut
	chafaCmd.Stderr = &chafaErr

	if err := chafaCmd.Run(); err != nil {
		return "", fmt.Errorf("chafa: %w (%s)", err, strings.TrimSpace(chafaErr.String()))
	}

	// Chafa may append terminal control sequences (e.g. show-cursor
	// \x1b[?25h) after the last line. Strip them so the output is
	// just the rendered character rows.
	out := strings.TrimRight(chafaOut.String(), "\n")
	out = strings.ReplaceAll(out, "\x1b[?25h", "")
	out = strings.ReplaceAll(out, "\x1b[?25l", "")
	out = strings.TrimRight(out, "\n")
	return out, nil
}

// RenderFrameForStep renders the video frame at the start time of the
// given step index.
func RenderFrameForStep(
	buildStatus tape.BuildStatus,
	steps []tape.Step,
	stepIndex, width, height int,
) (string, error) {
	if !buildStatus.Built() {
		return "", fmt.Errorf("video not built")
	}

	if !CheckPreviewDeps() {
		return "", fmt.Errorf("ffmpeg or chafa not found")
	}

	atTime := tape.StepStartTime(steps, stepIndex)
	return RenderFrame(buildStatus.MP4Path, atTime, width, height)
}

// rgbaToPPM converts raw RGBA pixel data to PPM (P6) format by dropping
// the alpha channel. PPM is a simple uncompressed image format that chafa
// can read from stdin.
func rgbaToPPM(rgba []byte, width, height int) ([]byte, error) {
	expectedLen := width * height * 4
	if len(rgba) < expectedLen {
		return nil, fmt.Errorf(
			"rgba buffer too small: got %d bytes, want %d (%dx%dx4)",
			len(rgba), expectedLen, width, height,
		)
	}

	// PPM header: "P6\n<width> <height>\n255\n"
	header := fmt.Sprintf("P6\n%d %d\n255\n", width, height)

	// RGB data: 3 bytes per pixel (drop alpha).
	rgbLen := width * height * 3
	buf := make([]byte, len(header)+rgbLen)
	copy(buf, header)

	dst := len(header)
	for i := 0; i < len(rgba)-3; i += 4 {
		buf[dst] = rgba[i]     // R
		buf[dst+1] = rgba[i+1] // G
		buf[dst+2] = rgba[i+2] // B
		dst += 3
	}

	return buf, nil
}

// roundEven rounds n down to the nearest even number (ffmpeg requirement).
func roundEven(n int) int {
	return n &^ 1
}

// formatTimestamp converts seconds to HH:MM:SS.mmm format for ffmpeg -ss.
func formatTimestamp(seconds float64) string {
	h := int(seconds) / 3600
	m := (int(seconds) % 3600) / 60
	s := seconds - float64(h*3600) - float64(m*60)
	return fmt.Sprintf("%02d:%02d:%06.3f", h, m, s)
}
