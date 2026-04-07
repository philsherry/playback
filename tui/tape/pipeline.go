package tape

import (
	"bufio"
	"fmt"
	"os/exec"
)

// PipelineMode controls which pipeline stages to run.
type PipelineMode int

const (
	// PipelineFull runs all stages: VHS recording, TTS, captions, ffmpeg.
	PipelineFull PipelineMode = iota
	// PipelineVHSOnly runs only the VHS terminal recording stage.
	PipelineVHSOnly
)

// PipelineResult is sent back to the bubbletea model when the pipeline
// subprocess finishes.
type PipelineResult struct {
	// Err is nil on success, or the error that caused the pipeline to fail.
	Err error
	// Output contains the combined stdout/stderr lines from the pipeline.
	Output []string
}

// PipelineOutputMsg is a bubbletea message carrying a single line of
// output from the running pipeline. The model appends these to its
// progress log for display.
type PipelineOutputMsg struct {
	Line string
}

// RunPipeline spawns the playback pipeline as a subprocess and streams
// its output line by line. It returns a function suitable for use as a
// bubbletea Cmd — the function blocks until the pipeline finishes, then
// returns a PipelineResult message.
//
// projectRoot is the playback project root (where package.json lives).
// tapeDir is the absolute path to the tape directory.
// mode controls whether to run the full pipeline or VHS-only.
// outputCh receives each line of output as it's produced (for live
// progress display). It's closed when the pipeline finishes.
func RunPipeline(
	projectRoot, tapeDir string,
	mode PipelineMode,
	outputCh chan<- string,
) func() PipelineResult {
	return func() PipelineResult {
		defer close(outputCh)

		// Build the command. We use npm run playback:tape which invokes
		// the TypeScript pipeline via tsx.
		args := []string{"run", "playback:tape", "--", tapeDir}
		if mode == PipelineVHSOnly {
			args = append(args, "--vhs-only")
		}

		cmd := exec.Command("npm", args...)
		cmd.Dir = projectRoot

		// Combine stdout and stderr into a single pipe so we can stream
		// all output to the TUI.
		pipe, err := cmd.StdoutPipe()
		if err != nil {
			return PipelineResult{Err: fmt.Errorf("failed to create pipe: %w", err)}
		}
		cmd.Stderr = cmd.Stdout

		if err := cmd.Start(); err != nil {
			return PipelineResult{Err: fmt.Errorf("failed to start pipeline: %w", err)}
		}

		// Stream output line by line.
		var lines []string
		scanner := bufio.NewScanner(pipe)
		for scanner.Scan() {
			line := scanner.Text()
			lines = append(lines, line)
			outputCh <- line
		}

		// Wait for the process to exit.
		if err := cmd.Wait(); err != nil {
			return PipelineResult{
				Err:    fmt.Errorf("pipeline failed: %w", err),
				Output: lines,
			}
		}

		return PipelineResult{Output: lines}
	}
}
