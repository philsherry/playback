package tape

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// WritePauses writes updated pause and narrationOffset values back to
// tape.yaml. Rather than re-serialising the entire YAML (which would
// lose formatting, comments, blank lines, and folded scalar styles),
// this does a targeted find-and-replace of field values in the original.
//
// For narrated steps without an existing narrationOffset line, one is
// inserted with the value 0 (or the current offset) to make the field
// explicit and prevent YAML formatting issues.
func WritePauses(dir string, steps []Step) error {
	path := filepath.Join(dir, "tape.yaml")
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("cannot read tape.yaml: %w", err)
	}

	lines := strings.Split(string(data), "\n")
	result := updateStepFields(lines, steps)

	if err := os.WriteFile(path, []byte(strings.Join(result, "\n")), 0o600); err != nil {
		return fmt.Errorf("cannot write tape.yaml: %w", err)
	}
	return nil
}

// updateStepFields walks the YAML lines and updates pause and
// narrationOffset values. It detects step boundaries by looking for
// "- action:" lines, then finds or inserts fields for each step.
//
// Fields are inserted immediately after the last existing property line
// of the step (before any blank separator lines), so the YAML stays
// clean and properly grouped.
func updateStepFields(lines []string, steps []Step) []string {
	result := make([]string, 0, len(lines)+len(steps)*2)
	stepIndex := -1
	pauseHandled := false
	offsetHandled := false

	// insertMissing adds any fields that weren't found in the current step.
	// It inserts them before any trailing blank lines so they stay grouped
	// with the step's other properties.
	insertMissing := func() {
		if stepIndex < 0 || stepIndex >= len(steps) {
			return
		}

		// Find the insertion point: scan backwards past blank lines.
		insertAt := len(result)
		for insertAt > 0 && strings.TrimSpace(result[insertAt-1]) == "" {
			insertAt--
		}

		// Determine indent from the last property line.
		indent := "    " // fallback
		if insertAt > 0 {
			for j := insertAt - 1; j >= 0; j-- {
				trimmed := strings.TrimSpace(result[j])
				if isStepProperty(trimmed) {
					indent = leadingWhitespace(result[j])
					break
				}
			}
		}

		// Insert missing fields in alphabetical order:
		// narrationOffset before pause.
		var toInsert []string

		// Always write narrationOffset on narrated steps (even if 0)
		// for explicitness and to prevent YAML formatting issues.
		if !offsetHandled && steps[stepIndex].Narration != "" {
			offset := 0.0
			if steps[stepIndex].NarrationOffset != nil {
				offset = *steps[stepIndex].NarrationOffset
			}
			toInsert = append(toInsert,
				fmt.Sprintf("%snarrationOffset: %s", indent, formatPause(offset)),
			)
		}

		if !pauseHandled && steps[stepIndex].Pause != nil {
			toInsert = append(toInsert,
				fmt.Sprintf("%spause: %s", indent, formatPause(*steps[stepIndex].Pause)),
			)
		}

		if len(toInsert) > 0 {
			// Splice the new lines in at insertAt.
			tail := make([]string, len(result)-insertAt)
			copy(tail, result[insertAt:])
			result = append(result[:insertAt], toInsert...)
			result = append(result, tail...)
		}
	}

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		// Detect step boundary.
		if strings.HasPrefix(trimmed, "- action:") {
			insertMissing()
			stepIndex++
			pauseHandled = false
			offsetHandled = false
			result = append(result, line)
			continue
		}

		// Handle existing pause lines.
		if stepIndex >= 0 && stepIndex < len(steps) && isPauseLine(trimmed) {
			pauseHandled = true
			if steps[stepIndex].Pause != nil {
				indent := leadingWhitespace(line)
				result = append(result,
					fmt.Sprintf("%spause: %s", indent, formatPause(*steps[stepIndex].Pause)),
				)
			} else {
				result = append(result, line)
			}
			continue
		}

		// Handle existing narrationOffset lines.
		if stepIndex >= 0 && stepIndex < len(steps) && isNarrationOffsetLine(trimmed) {
			offsetHandled = true
			step := steps[stepIndex]
			offset := 0.0
			if step.NarrationOffset != nil {
				offset = *step.NarrationOffset
			}
			// Always write the field on narrated steps.
			if step.Narration != "" {
				indent := leadingWhitespace(line)
				result = append(result,
					fmt.Sprintf("%snarrationOffset: %s", indent, formatPause(offset)),
				)
			}
			// Drop the line for non-narrated steps.
			continue
		}

		result = append(result, line)
	}

	// Handle the last step.
	insertMissing()

	return result
}

// isPauseLine returns true if the trimmed line is a YAML pause field.
func isPauseLine(trimmed string) bool {
	return strings.HasPrefix(trimmed, "pause:")
}

// isNarrationOffsetLine returns true if the trimmed line is a narrationOffset field.
func isNarrationOffsetLine(trimmed string) bool {
	return strings.HasPrefix(trimmed, "narrationOffset:")
}

// isStepProperty returns true if the trimmed line is a known step field.
func isStepProperty(trimmed string) bool {
	return strings.HasPrefix(trimmed, "action:") ||
		strings.HasPrefix(trimmed, "- action:") ||
		strings.HasPrefix(trimmed, "command:") ||
		strings.HasPrefix(trimmed, "narration:") ||
		strings.HasPrefix(trimmed, "pause:") ||
		strings.HasPrefix(trimmed, "narrationOffset:")
}

// leadingWhitespace returns the whitespace prefix of a line.
func leadingWhitespace(line string) string {
	return line[:len(line)-len(strings.TrimLeft(line, " \t"))]
}

// formatPause formats a value for YAML output. Uses integer format when
// the value has no fractional part, and a clean decimal otherwise.
func formatPause(value float64) string {
	if value == float64(int(value)) {
		return fmt.Sprintf("%d", int(value))
	}
	s := fmt.Sprintf("%.4f", value)
	s = strings.TrimRight(s, "0")
	s = strings.TrimRight(s, ".")
	return s
}
