package ui

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/charmbracelet/bubbles/help"
	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/progress"
	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/glamour"
	"github.com/charmbracelet/huh"
	"github.com/charmbracelet/lipgloss"
	"github.com/philsherry/playback/tui/tape"
)

// Model is the central bubbletea model for the TUI. It follows the Elm
// architecture: Init returns an initial command, Update processes messages
// and returns updated state, View renders the current state to a string.
type Model struct {
	tapeData           tape.TapeData     // loaded tape.yaml + meta.yaml
	projectRoot        string            // absolute path to the playback project root
	workspaceConstants map[string]string // placeholder constants from workspace.yaml
	buildStatus        tape.BuildStatus  // what pipeline outputs exist
	theme              Theme             // active colour palette
	styles             Styles            // lipgloss styles derived from the theme
	layout             Layout            // computed panel dimensions
	width              int               // terminal width in columns
	height             int               // terminal height in rows
	ready              bool              // true after first WindowSizeMsg
	cursor             int               // index of the selected step (-1 = none)
	nudgeStep          float64           // seconds per arrow-key press
	dirty              bool              // true if any pause values have been modified
	undoStack          []stepSnapshot    // snapshots of step timing values before each edit
	overlaps           []tape.Overlap    // detected narration timing collisions

	// Charm components.
	keys     KeyMap         // keybindings (also serves as help.KeyMap)
	help     help.Model     // bubbles help component for the footer
	spinner  spinner.Model  // bubbles spinner for pipeline progress
	logView  viewport.Model // bubbles viewport for scrollable pipeline log
	stepView viewport.Model // bubbles viewport for scrollable step list

	// Pause editing state.
	editing    bool            // true when the textinput is active
	pauseInput textinput.Model // bubbles textinput for direct pause value entry

	// Tape picker state (huh.Form-based).
	picking        bool             // true when the tape picker is open
	pickerForm     *huh.Form        // huh Select form for tape selection
	pickerResult   string           // selected tape directory path
	tapeEntries    []tape.TapeEntry // all tape directories found in tapesDir
	pickerScanned  bool             // true once the scan has been done
	confirmDiscard bool             // true when showing "discard changes?" confirm
	confirmForm    *huh.Form        // huh Confirm form
	confirmResult  bool             // user's answer

	// Video preview state.
	preview PreviewState // chafa-rendered video frame
	frameW  int          // 16:9-constrained frame width in terminal chars
	frameH  int          // 16:9-constrained frame height in terminal chars

	// PROMPT.md viewer state.
	viewingPrompt bool           // true when the markdown viewer is open
	promptContent string         // rendered markdown content
	promptView    viewport.Model // scrollable viewport for the rendered markdown

	// Metadata editor state.
	editingMeta bool            // true when the metadata editor is open
	metaFields  []string        // field names being edited
	metaValues  []string        // current values for each field
	metaCursor  int             // selected field in the editor
	metaEditing int             // field currently being typed into (-1 = none)
	metaInput   textinput.Model // textinput for the active field

	// Save state.
	statusMsg   string    // transient status message (e.g. "Saved", "Save failed")
	confirmQuit bool      // true when showing "quit with unsaved changes?" dialog
	quitForm    *huh.Form // huh Confirm form for quit
	quitResult  bool      // true = save and quit, false = discard and quit

	// Pipeline runner state.
	pipelineRunning  bool              // true while the pipeline subprocess is active
	pipelineMode     tape.PipelineMode // which mode was requested
	pipelineLog      []string          // lines of output from the pipeline
	pipelineErr      error             // non-nil if the last run failed
	pipelineOutputCh chan string       // channel for streaming pipeline output
	pipelineProgress float64           // current progress (0.0 to 1.0)
	pipelineStage    string            // current stage label
	progressBar      progress.Model    // bubbles progress bar
}

// NewModel creates a Model with the default Tokyo Night Storm theme.
func NewModel(data tape.TapeData, projectRoot string) Model {
	return NewModelWithTheme(data, projectRoot, TokyoNightStorm)
}

// NewModelWithTheme creates a Model with a specific theme. projectRoot is
// the absolute path to the playback project root (where package.json lives)
// — used for build status detection and running the pipeline.
func NewModelWithTheme(data tape.TapeData, projectRoot string, theme Theme) Model {
	styles := NewStyles(theme)

	// Configure the spinner with the accent colour.
	s := spinner.New()
	s.Spinner = spinner.MiniDot
	s.Style = lipgloss.NewStyle().Foreground(theme.Accent)

	// Configure the help component with theme colours.
	h := help.New()
	h.Styles.ShortKey = lipgloss.NewStyle().Foreground(theme.Foreground)
	h.Styles.ShortDesc = lipgloss.NewStyle().Foreground(theme.Muted)
	h.Styles.ShortSeparator = lipgloss.NewStyle().Foreground(theme.Ruler)
	h.Styles.FullKey = lipgloss.NewStyle().Foreground(theme.Foreground)
	h.Styles.FullDesc = lipgloss.NewStyle().Foreground(theme.Muted)
	h.Styles.FullSeparator = lipgloss.NewStyle().Foreground(theme.Ruler)
	h.ShortSeparator = " │ "

	// Configure the textinput for direct pause value editing.
	ti := textinput.New()
	ti.Placeholder = "0.00"
	ti.CharLimit = 8
	ti.Width = 10
	ti.Validate = func(s string) error {
		if s == "" || s == "." {
			return nil // allow partial input while typing
		}
		_, err := strconv.ParseFloat(s, 64)
		return err
	}

	return Model{
		tapeData:           data,
		projectRoot:        projectRoot,
		workspaceConstants: tape.LoadWorkspaceConstants(projectRoot),
		buildStatus:        tape.CheckBuildStatus(projectRoot, data.Tape),
		theme:              theme,
		styles:             styles,
		cursor:             -1,
		nudgeStep:          tape.DefaultNudgeStep,
		keys:               DefaultKeyMap(),
		help:               h,
		spinner:            s,
		pauseInput:         ti,
		overlaps:           tape.DetectOverlaps(data.Tape.Steps),
		preview:            PreviewState{Available: CheckPreviewDeps()},
		progressBar: progress.New(
			progress.WithScaledGradient(string(theme.Clip), string(theme.Accent)),
			progress.WithWidth(40),
		),
	}
}

// NewModelWithNudgeStep creates a Model with a custom nudge step size.
// Used when playback.config.ts specifies a non-default nudgeStep value.
func NewModelWithNudgeStep(data tape.TapeData, projectRoot string, nudgeStep float64) Model {
	m := NewModel(data, projectRoot)
	if nudgeStep > 0 {
		m.nudgeStep = nudgeStep
	}
	return m
}

// Init satisfies the tea.Model interface. Returns the spinner's tick
// command so it starts animating immediately.
func (m Model) Init() tea.Cmd {
	return m.spinner.Tick
}

// Update processes bubbletea messages and returns the updated model.
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	// Delegate to huh Confirm form when asking about quitting with edits.
	if m.confirmQuit && m.quitForm != nil {
		form, cmd := m.quitForm.Update(msg)
		if f, ok := form.(*huh.Form); ok {
			m.quitForm = f
		}
		cmds = append(cmds, cmd)

		switch m.quitForm.State {
		case huh.StateCompleted:
			m.confirmQuit = false
			if m.quitForm.GetBool("quit") {
				// User chose "Save and quit".
				m.save()
			}
			// Either way, quit.
			return m, tea.Quit
		case huh.StateAborted:
			// User cancelled — stay in the editor.
			m.confirmQuit = false
		case huh.StateNormal:
			// Still deciding.
		}
		return m, tea.Batch(cmds...)
	}

	// Delegate to huh Confirm form when asking about discarding changes.
	if m.confirmDiscard && m.confirmForm != nil {
		form, cmd := m.confirmForm.Update(msg)
		if f, ok := form.(*huh.Form); ok {
			m.confirmForm = f
		}
		cmds = append(cmds, cmd)

		switch m.confirmForm.State {
		case huh.StateCompleted:
			m.confirmDiscard = false
			if m.confirmForm.GetBool("confirm") {
				// User chose to discard — clear dirty state and open picker.
				m.dirty = false
				m.undoStack = nil
				m.openPicker()
				if m.picking && m.pickerForm != nil {
					cmds = append(cmds, m.pickerForm.Init())
				}
			}
		case huh.StateAborted:
			m.confirmDiscard = false
		case huh.StateNormal:
			// Still deciding.
		}
		return m, tea.Batch(cmds...)
	}

	// Delegate to huh form when the tape picker is open.
	if m.picking && m.pickerForm != nil {
		form, cmd := m.pickerForm.Update(msg)
		if f, ok := form.(*huh.Form); ok {
			m.pickerForm = f
		}
		cmds = append(cmds, cmd)

		switch m.pickerForm.State {
		case huh.StateCompleted:
			// Read the selected value from the form (not the model field,
			// which may be stale due to value-type model copies).
			selected := m.pickerForm.GetString("tape")
			if selected != "" {
				m.loadPickedTape(selected)
			} else {
				m.picking = false
			}
		case huh.StateAborted:
			m.picking = false
		case huh.StateNormal:
			// Still selecting.
		}
		return m, tea.Batch(cmds...)
	}

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.layout = CalculateLayout(msg.Width, msg.Height)
		m.help.Width = msg.Width
		// Set up viewports to fit their panels (layout values are content-only).
		m.logView = viewport.New(m.layout.PreviewWidth, m.layout.PreviewHeight)
		// Step list viewport for the right column.
		m.stepView = viewport.New(m.layout.StepListWidth, m.layout.StepListHeight)
		// Compute the largest 16:9 frame that fits the preview panel.
		// The frame is centred within the panel at render time.
		m.frameW, m.frameH = fit16x9(
			m.layout.PreviewWidth,
			m.layout.PreviewHeight,
		)
		m.ready = true

		// Terminal sim doesn't need async rendering — it's built from
		// the tape data directly in renderPreview.

	// Spinner tick — update the spinner animation.
	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		cmds = append(cmds, cmd)

	// Pipeline output — append a line to the progress log and check for
	// stage markers to update the progress bar.
	case tape.PipelineOutputMsg:
		m.pipelineLog = append(m.pipelineLog, msg.Line)
		m.logView.SetContent(strings.Join(m.pipelineLog, "\n"))
		m.logView.GotoBottom()
		if p := tape.ParseProgress(msg.Line); p != nil {
			m.pipelineProgress = p.Percent
			m.pipelineStage = p.Stage
		}
		cmds = append(cmds, m.waitForPipelineOutput())

	// Pipeline finished — update build status and clear running flag.
	case tape.PipelineResult:
		m.pipelineRunning = false
		m.pipelineErr = msg.Err
		m.pipelineOutputCh = nil
		m.buildStatus = tape.CheckBuildStatus(m.projectRoot, m.tapeData.Tape)
		m.preview.Available = CheckPreviewDeps()

	case tea.KeyMsg:
		// Clear transient status message on any keypress.
		m.statusMsg = ""

		// While editing a pause value, delegate to the textinput.
		if m.editing {
			return m.handleEditInput(msg, cmds)
		}

		// Picker is handled above the type switch (all message types).

		// While viewing PROMPT.md, handle viewport scrolling.
		if m.viewingPrompt {
			return m.handlePromptInput(msg, cmds)
		}

		// While editing metadata, handle field navigation.
		if m.editingMeta {
			return m.handleMetaInput(msg, cmds)
		}

		// While the pipeline is running, block all keys.
		if m.pipelineRunning {
			return m, tea.Batch(cmds...)
		}

		// Quit confirmation is handled above the type switch (huh form).

		switch {
		case key.Matches(msg, m.keys.Quit):
			if m.dirty {
				// Show huh Confirm: save and quit, or discard and quit.
				m.quitResult = true // default to "Save and quit"
				m.quitForm = huh.NewForm(
					huh.NewGroup(
						huh.NewConfirm().
							Key("quit").
							Title("You have unsaved changes").
							Description("Save before quitting?").
							Affirmative("Save and quit").
							Negative("Discard and quit").
							Value(&m.quitResult),
					),
				).WithShowHelp(false).WithWidth(m.layout.StepListWidth)
				km := huh.NewDefaultKeyMap()
				km.Quit = key.NewBinding(key.WithKeys("ctrl+c", "esc"))
				m.quitForm.WithKeyMap(km)
				m.quitForm.Init()
				m.confirmQuit = true
				return m, tea.Batch(cmds...)
			}
			return m, tea.Quit

		case key.Matches(msg, m.keys.Help):
			m.help.ShowAll = !m.help.ShowAll

		// Cursor movement.
		case key.Matches(msg, m.keys.Down):
			if m.cursor < len(m.tapeData.Tape.Steps)-1 {
				m.cursor++
			}
		case key.Matches(msg, m.keys.Up):
			if m.cursor > 0 {
				m.cursor--
			} else if m.cursor == -1 && len(m.tapeData.Tape.Steps) > 0 {
				m.cursor = 0
			}

		// Audio nudge — slide narration clip earlier/later (h/l).
		case key.Matches(msg, m.keys.AudioRight):
			if m.cursor >= 0 {
				m.nudgeAudio(m.nudgeStep)
			}
		case key.Matches(msg, m.keys.AudioLeft):
			if m.cursor >= 0 {
				m.nudgeAudio(-m.nudgeStep)
			}

		// Pause nudge — adjust step pause value (arrow up/down).
		case key.Matches(msg, m.keys.PauseUp):
			if m.cursor >= 0 {
				m.nudge(m.nudgeStep)
			}
		case key.Matches(msg, m.keys.PauseDown):
			if m.cursor >= 0 {
				m.nudge(-m.nudgeStep)
			}

		// Undo.
		case key.Matches(msg, m.keys.Undo):
			m.undo()

		// Edit pause directly.
		case key.Matches(msg, m.keys.EditPause):
			if m.cursor >= 0 {
				m.startEditing()
				return m, m.pauseInput.Focus()
			}

		// Save.
		case key.Matches(msg, m.keys.Save):
			m.save()

		// Pipeline.
		case key.Matches(msg, m.keys.RunFull):
			cmd := m.startPipeline(tape.PipelineFull)
			cmds = append(cmds, cmd)
		case key.Matches(msg, m.keys.RunVHSOnly):
			cmd := m.startPipeline(tape.PipelineVHSOnly)
			cmds = append(cmds, cmd)

		// Open tape picker.
		case key.Matches(msg, m.keys.OpenTape):
			m.openPicker()

		// View PROMPT.md.
		case key.Matches(msg, m.keys.ViewPrompt):
			m.openPrompt()

		// Edit metadata.
		case key.Matches(msg, m.keys.EditMeta):
			m.openMetaEditor()

		// Deselect / dismiss.
		case key.Matches(msg, m.keys.Deselect):
			if m.pipelineErr != nil {
				m.pipelineErr = nil
				m.pipelineLog = nil
			} else {
				m.cursor = -1
			}
		}
	}

	m.syncKeyStates()

	return m, tea.Batch(cmds...)
}

// startPipeline kicks off the pipeline subprocess and returns a bubbletea
// Cmd that streams output back to the model via messages.
func (m *Model) startPipeline(mode tape.PipelineMode) tea.Cmd {
	m.pipelineRunning = true
	m.pipelineMode = mode
	m.pipelineLog = nil
	m.pipelineErr = nil
	m.pipelineProgress = 0
	m.pipelineStage = "Starting"

	m.pipelineOutputCh = make(chan string, 100)

	runFn := tape.RunPipeline(m.projectRoot, m.tapeData.Dir, mode, m.pipelineOutputCh)

	return tea.Batch(
		func() tea.Msg {
			return runFn()
		},
		m.waitForPipelineOutput(),
	)
}

// waitForPipelineOutput returns a Cmd that reads the next line from the
// pipeline output channel and wraps it in a PipelineOutputMsg.
func (m *Model) waitForPipelineOutput() tea.Cmd {
	ch := m.pipelineOutputCh
	if ch == nil {
		return nil
	}
	return func() tea.Msg {
		line, ok := <-ch
		if !ok {
			return nil
		}
		return tape.PipelineOutputMsg{Line: line}
	}
}

// nudge adjusts the pause value of the currently-selected step by delta.
func (m *Model) nudge(delta float64) {
	if m.cursor < 0 || m.cursor >= len(m.tapeData.Tape.Steps) {
		return
	}
	m.undoStack = append(m.undoStack, m.takeSnapshot())
	step := &m.tapeData.Tape.Steps[m.cursor]
	newPause := tape.NudgePause(*step, delta)
	step.Pause = &newPause
	m.dirty = true
	m.overlaps = tape.DetectOverlaps(m.tapeData.Tape.Steps)
}

// nudgeAudio adjusts the narration offset of the currently-selected step
// by delta. This slides the .wav clip earlier (negative) or later (positive)
// relative to the step's start time, without changing the video timing.
func (m *Model) nudgeAudio(delta float64) {
	if m.cursor < 0 || m.cursor >= len(m.tapeData.Tape.Steps) {
		return
	}
	step := &m.tapeData.Tape.Steps[m.cursor]
	if step.Narration == "" {
		return // no narration to nudge
	}

	m.undoStack = append(m.undoStack, m.takeSnapshot())

	current := 0.0
	if step.NarrationOffset != nil {
		current = *step.NarrationOffset
	}
	newOffset := current + delta
	step.NarrationOffset = &newOffset
	m.dirty = true
	m.overlaps = tape.DetectOverlaps(m.tapeData.Tape.Steps)
}

// undo restores the most recent timing snapshot from the undo stack.
func (m *Model) undo() {
	if len(m.undoStack) == 0 {
		return
	}
	snapshot := m.undoStack[len(m.undoStack)-1]
	m.undoStack = m.undoStack[:len(m.undoStack)-1]
	m.restoreSnapshot(snapshot)
	m.dirty = len(m.undoStack) > 0
	m.overlaps = tape.DetectOverlaps(m.tapeData.Tape.Steps)
}

// openPicker scans for tapes and creates a huh.Select form.
// If there are unsaved changes, shows a huh.Confirm first.
func (m *Model) openPicker() {
	if m.dirty {
		m.confirmResult = false
		m.confirmForm = huh.NewForm(
			huh.NewGroup(
				huh.NewConfirm().
					Key("confirm").
					Title("You have unsaved changes").
					Description("Discard changes and switch tape?").
					Affirmative("Discard").
					Negative("Cancel").
					Value(&m.confirmResult),
			),
		).WithShowHelp(false).WithWidth(m.layout.StepListWidth)
		m.confirmForm.Init()
		m.confirmDiscard = true
		return
	}

	if !m.pickerScanned {
		tapesDir := tape.InferTapesDir(m.tapeData.Dir)
		entries, err := tape.ScanTapes(tapesDir)
		if err != nil || len(entries) == 0 {
			m.statusMsg = "No tapes found"
			return
		}
		m.tapeEntries = entries
		m.pickerScanned = true
	}

	if len(m.tapeEntries) == 0 {
		m.statusMsg = "No tapes found"
		return
	}

	// Build huh.Select options from the tape entries.
	options := make([]huh.Option[string], len(m.tapeEntries))
	currentDir := m.tapeData.Dir
	for i, entry := range m.tapeEntries {
		label := entry.RelPath
		if entry.Title != "" {
			label = fmt.Sprintf("%s — %s", entry.RelPath, entry.Title)
		}
		// Mark the current tape.
		if entry.Dir == currentDir {
			label = "● " + label
		}
		options[i] = huh.NewOption(label, entry.Dir)
	}

	// Pre-select the current tape.
	m.pickerResult = currentDir

	// Create the huh form constrained to the step list panel dimensions.
	// WithHeight on the Select controls how many options are visible;
	// WithHeight on the Form constrains the total form output.
	selectHeight := m.layout.StepListHeight - 2 // room for title + border
	if selectHeight < 5 {
		selectHeight = 5
	}

	form := huh.NewForm(
		huh.NewGroup(
			huh.NewSelect[string]().
				Key("tape").
				Title("Open tape").
				Options(options...).
				Value(&m.pickerResult).
				WithHeight(selectHeight),
		),
	).WithShowHelp(false).
		WithWidth(m.layout.StepListWidth).
		WithHeight(m.layout.StepListHeight)

	// Allow Esc to close the picker (huh defaults to ctrl+c only).
	km := huh.NewDefaultKeyMap()
	km.Quit = key.NewBinding(key.WithKeys("ctrl+c", "esc", "q"))
	form.WithKeyMap(km)

	m.pickerForm = form

	m.pickerForm.Init()
	m.picking = true
}

// loadPickedTape loads the tape at the given directory path and resets
// the model state for the new tape.
func (m *Model) loadPickedTape(dir string) {
	data, err := tape.Load(dir)
	if err != nil {
		m.statusMsg = fmt.Sprintf("Failed to load: %s", err)
		m.picking = false
		return
	}

	m.tapeData = data
	m.buildStatus = tape.CheckBuildStatus(m.projectRoot, data.Tape)
	m.overlaps = tape.DetectOverlaps(data.Tape.Steps)
	m.cursor = -1
	m.dirty = false
	m.undoStack = nil
	m.statusMsg = fmt.Sprintf("Loaded: %s", data.Tape.Title)
	m.picking = false
}

// --- PROMPT.md viewer ---

// openPrompt reads and renders the PROMPT.md file from the tape directory.
func (m *Model) openPrompt() {
	promptPath := filepath.Join(m.tapeData.Dir, "PROMPT.md")
	data, err := os.ReadFile(promptPath)
	if err != nil {
		m.statusMsg = "No PROMPT.md found"
		return
	}

	// Render markdown with glamour. Use the dark style to match our theme.
	rendered, err := glamour.Render(string(data), "dark")
	if err != nil {
		// Fall back to raw markdown if rendering fails.
		rendered = string(data)
	}

	m.promptContent = rendered
	// Prompt viewer fills the space normally used by the three bordered panels.
	// Each panel renders at contentH + borderSize, so add 3*borderSize.
	m.promptView = viewport.New(
		m.layout.FullWidth,
		m.layout.PreviewHeight+m.layout.TimelineHeight+m.layout.InspectorHeight+3*borderSize,
	)
	m.promptView.SetContent(rendered)
	m.viewingPrompt = true
}

// handlePromptInput processes keys while viewing PROMPT.md. j/k scroll,
// Esc/q closes the viewer.
func (m Model) handlePromptInput(msg tea.KeyMsg, cmds []tea.Cmd) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc", "q", "m":
		m.viewingPrompt = false
		return m, tea.Batch(cmds...)
	case "j", "down":
		m.promptView.ScrollDown(1)
	case "k", "up":
		m.promptView.ScrollUp(1)
	case "d":
		m.promptView.HalfPageDown()
	case "u":
		m.promptView.HalfPageUp()
	case "g":
		m.promptView.GotoTop()
	case "G":
		m.promptView.GotoBottom()
	}
	return m, tea.Batch(cmds...)
}

// --- Metadata editor ---

// openMetaEditor populates the field list from the current meta.yaml values.
func (m *Model) openMetaEditor() {
	meta := m.tapeData.Meta

	m.metaFields = []string{"Title", "Description", "Locale", "Series", "Version"}
	m.metaValues = []string{
		meta.Title,
		meta.Description,
		meta.Locale,
		meta.Series,
		meta.Version,
	}

	m.metaCursor = 0
	m.metaEditing = -1
	m.editingMeta = true

	// Configure the meta textinput.
	m.metaInput = textinput.New()
	m.metaInput.CharLimit = 200
	m.metaInput.Width = 60
}

// handleMetaInput processes keys while editing metadata.
func (m Model) handleMetaInput(msg tea.KeyMsg, cmds []tea.Cmd) (tea.Model, tea.Cmd) {
	// If actively editing a field, delegate to the textinput.
	if m.metaEditing >= 0 {
		switch msg.Type {
		case tea.KeyEnter:
			// Confirm the edit.
			m.metaValues[m.metaEditing] = m.metaInput.Value()
			m.metaInput.Blur()
			m.metaEditing = -1
			return m, tea.Batch(cmds...)
		case tea.KeyEscape:
			// Cancel the edit.
			m.metaInput.Blur()
			m.metaEditing = -1
			return m, tea.Batch(cmds...)
		}

		var cmd tea.Cmd
		m.metaInput, cmd = m.metaInput.Update(msg)
		cmds = append(cmds, cmd)
		return m, tea.Batch(cmds...)
	}

	// Field navigation.
	switch msg.String() {
	case "j", "down":
		if m.metaCursor < len(m.metaFields)-1 {
			m.metaCursor++
		}
	case "k", "up":
		if m.metaCursor > 0 {
			m.metaCursor--
		}
	case "e", "enter":
		// Start editing the selected field.
		m.metaEditing = m.metaCursor
		m.metaInput.SetValue(m.metaValues[m.metaCursor])
		return m, m.metaInput.Focus()
	case "s":
		// Save metadata back to meta.yaml.
		m.saveMetadata()
	case "esc", "q":
		m.editingMeta = false
	}

	return m, tea.Batch(cmds...)
}

// saveMetadata writes the edited values back to the Meta struct and saves
// meta.yaml. Only the fields that were edited are updated.
func (m *Model) saveMetadata() {
	m.tapeData.Meta.Title = m.metaValues[0]
	m.tapeData.Meta.Description = m.metaValues[1]
	m.tapeData.Meta.Locale = m.metaValues[2]
	m.tapeData.Meta.Series = m.metaValues[3]
	m.tapeData.Meta.Version = m.metaValues[4]

	// Write meta.yaml using gopkg.in/yaml.v3 for clean output.
	if err := tape.WriteMeta(m.tapeData.Dir, m.tapeData.Meta); err != nil {
		m.statusMsg = fmt.Sprintf("Save failed: %s", err)
	} else {
		m.statusMsg = "Metadata saved"
	}
	m.editingMeta = false
}

// syncKeyStates dynamically enables/disables keybindings based on the
// current model state, so the help component only shows relevant hints.
func (m *Model) syncKeyStates() {
	hasSelection := m.cursor >= 0
	m.keys.AudioLeft.SetEnabled(hasSelection)
	m.keys.AudioRight.SetEnabled(hasSelection)
	m.keys.PauseUp.SetEnabled(hasSelection)
	m.keys.PauseDown.SetEnabled(hasSelection)
	m.keys.EditPause.SetEnabled(hasSelection)
	m.keys.Deselect.SetEnabled(hasSelection || m.pipelineErr != nil)
	m.keys.Undo.SetEnabled(len(m.undoStack) > 0)
	m.keys.Save.SetEnabled(m.dirty)
}

// startEditing enters direct pause editing mode for the selected step.
// The textinput is pre-filled with the current pause value.
func (m *Model) startEditing() {
	step := m.tapeData.Tape.Steps[m.cursor]
	pause := tape.DefaultPause
	if step.Pause != nil {
		pause = *step.Pause
	}
	m.pauseInput.SetValue(fmt.Sprintf("%.2f", pause))
	m.editing = true
}

// handleEditInput processes key messages while the textinput is active.
// Enter confirms the edit, Esc cancels, everything else is delegated
// to the textinput component.
func (m Model) handleEditInput(msg tea.KeyMsg, cmds []tea.Cmd) (tea.Model, tea.Cmd) {
	switch msg.Type {
	case tea.KeyEnter:
		m.confirmEdit()
		m.syncKeyStates()
		return m, tea.Batch(cmds...)
	case tea.KeyEscape:
		m.editing = false
		m.pauseInput.Blur()
		m.syncKeyStates()
		return m, tea.Batch(cmds...)
	}

	// Delegate to the textinput for character input, backspace, etc.
	var cmd tea.Cmd
	m.pauseInput, cmd = m.pauseInput.Update(msg)
	cmds = append(cmds, cmd)
	return m, tea.Batch(cmds...)
}

// confirmEdit applies the textinput value as the new pause for the
// selected step. Invalid values are silently ignored (the validator
// already prevents most bad input).
func (m *Model) confirmEdit() {
	m.editing = false
	m.pauseInput.Blur()

	value, err := strconv.ParseFloat(m.pauseInput.Value(), 64)
	if err != nil || value < 0 {
		return
	}

	if m.cursor < 0 || m.cursor >= len(m.tapeData.Tape.Steps) {
		return
	}

	// Snapshot for undo.
	m.undoStack = append(m.undoStack, m.takeSnapshot())

	step := &m.tapeData.Tape.Steps[m.cursor]
	step.Pause = &value
	m.dirty = true
	m.overlaps = tape.DetectOverlaps(m.tapeData.Tape.Steps)
}

// save writes the current pause values back to tape.yaml. Only the pause
// fields are modified — all other formatting is preserved.
func (m *Model) save() {
	if !m.dirty {
		m.statusMsg = "No changes to save"
		return
	}

	if err := tape.WritePauses(m.tapeData.Dir, m.tapeData.Tape.Steps); err != nil {
		m.statusMsg = fmt.Sprintf("Save failed: %s", err)
		return
	}

	m.dirty = false
	m.undoStack = nil
	m.statusMsg = "Saved"
}

// pluralS returns "s" when count != 1, for simple pluralisation.
func pluralS(count int) string {
	if count == 1 {
		return ""
	}
	return "s"
}

// overlapForStep returns the Overlap involving the given step index, if any.
func (m *Model) overlapForStep(index int) *tape.Overlap {
	for i := range m.overlaps {
		if m.overlaps[i].StepA == index || m.overlaps[i].StepB == index {
			return &m.overlaps[i]
		}
	}
	return nil
}

// stepTimingValues holds the timing values for a single step, used for
// undo snapshots.
type stepTimingValues struct {
	pause           float64
	narrationOffset float64
}

// stepSnapshot is a complete snapshot of all step timing values.
type stepSnapshot []stepTimingValues

// takeSnapshot captures the current timing values from all steps.
func (m *Model) takeSnapshot() stepSnapshot {
	steps := m.tapeData.Tape.Steps
	snap := make(stepSnapshot, len(steps))
	for i, s := range steps {
		if s.Pause != nil {
			snap[i].pause = *s.Pause
		} else {
			snap[i].pause = tape.DefaultPause
		}
		if s.NarrationOffset != nil {
			snap[i].narrationOffset = *s.NarrationOffset
		}
	}
	return snap
}

// restoreSnapshot applies a snapshot back to the step timing values.
func (m *Model) restoreSnapshot(snap stepSnapshot) {
	for i, v := range snap {
		if i < len(m.tapeData.Tape.Steps) {
			p := v.pause
			m.tapeData.Tape.Steps[i].Pause = &p
			if v.narrationOffset != 0 {
				o := v.narrationOffset
				m.tapeData.Tape.Steps[i].NarrationOffset = &o
			} else {
				m.tapeData.Tape.Steps[i].NarrationOffset = nil
			}
		}
	}
}

// --- View ---

// View renders the full TUI layout.
func (m Model) View() string {
	if !m.ready {
		return "Loading…"
	}

	// Full-screen overlays.
	if m.viewingPrompt {
		footer := m.styles.Footer.Render(
			"  j/k: scroll  │  d/u: half page  │  g/G: top/bottom  │  esc: close",
		)
		return lipgloss.JoinVertical(lipgloss.Left, m.promptView.View(), footer)
	}

	// Top row: [preview] [step list] side by side.
	preview := m.renderPreview()
	stepList := m.renderStepList()
	topRow := lipgloss.JoinHorizontal(lipgloss.Top, preview, stepList)

	// Full-width rows below.
	timeline := m.renderAudioBars()
	inspector := m.renderInspector()
	footer := m.renderFooter()

	// Everything below the title sits inside one outer rounded border.
	inner := lipgloss.JoinVertical(lipgloss.Left,
		topRow,
		timeline,
		inspector,
		footer,
	)

	// Constrain the outer border to exactly the available height so
	// content overflow can't push the title bar off screen.
	outerH := m.height - appTitleHeight - borderSize // outer border adds borderSize
	outer := m.styles.OuterBorder.
		Width(m.layout.OuterWidth).
		Height(outerH).
		Render(inner)

	view := lipgloss.JoinVertical(lipgloss.Left,
		m.renderAppTitle(),
		outer,
	)

	// Hard clamp: if the rendered view somehow exceeds the terminal
	// height, truncate to prevent the title bar from scrolling off.
	lines := strings.Split(view, "\n")
	if len(lines) > m.height {
		lines = lines[:m.height]
	}
	return strings.Join(lines, "\n")
}

// renderAppTitle renders the full-width application title bar at the very
// top of the TUI. The static "Playback" label sits on the left; the
// relative tape directory path and build status sit on the right.
func (m Model) renderAppTitle() string {
	left := m.styles.Title.Render("Playback")

	// Right: relative tape path + bracketed build status.

	// Status badge priority: transient states first, then session state,
	// then build state. This ensures the user always sees what matters now.
	var statusBadge string
	switch {
	case m.pipelineRunning:
		modeLabel := "Running"
		if m.pipelineMode == tape.PipelineVHSOnly {
			modeLabel = "VHS only"
		}
		statusBadge = m.styles.Accent.Render(
			fmt.Sprintf("%s %s", m.spinner.View(), modeLabel),
		)
	case m.pipelineErr != nil:
		statusBadge = m.styles.Overlap.Render("[Failed]")
	case m.statusMsg == "Saved":
		statusBadge = m.styles.Delta.Render("[Saved]")
	case m.dirty:
		statusBadge = m.styles.Warning.Render("[Edited]")
	case m.buildStatus.Built():
		statusBadge = m.styles.Delta.Render("[Built]")
	case m.buildStatus.Partial():
		statusBadge = m.styles.Warning.Render("[Partial]")
	default:
		statusBadge = m.styles.Muted.Render("[Not built]")
	}

	// Measure the fixed parts (app name + status badge + spacing).
	leftLen := lipgloss.Width(left)
	badgeLen := lipgloss.Width(statusBadge)
	fixedLen := leftLen + badgeLen + 3 // 3 = spaces between parts

	// Truncate the tape path with ellipsis if the total exceeds terminal width.
	rawPath := m.relativeTapePath()
	maxPathLen := m.width - fixedLen
	if maxPathLen < 5 {
		maxPathLen = 5
	}
	if len(rawPath) > maxPathLen {
		rawPath = rawPath[:maxPathLen-1] + "…"
	}
	relPath := m.styles.Muted.Render(rawPath)

	right := relPath + " " + statusBadge

	// Pad between left and right to fill the full terminal width.
	rightLen := lipgloss.Width(right)
	pad := m.width - leftLen - rightLen
	if pad < 1 {
		pad = 1
	}

	return left + strings.Repeat(" ", pad) + right
}

// relativeTapePath returns the tape directory path relative to the inferred
// tapes root. Falls back to the directory basename if the relative path
// cannot be computed or escapes the tapes root.
func (m Model) relativeTapePath() string {
	tapesDir := tape.InferTapesDir(m.tapeData.Dir)
	rel, err := filepath.Rel(tapesDir, m.tapeData.Dir)
	if err != nil || strings.HasPrefix(rel, "..") {
		return filepath.Base(m.tapeData.Dir)
	}
	return rel
}

// renderPreview renders the top-left panel — the video preview area.
func (m Model) renderPreview() string {
	// Panel interior dimensions (layout values are content-only).
	panelW := m.layout.PreviewWidth
	panelH := m.layout.PreviewHeight
	var body string
	switch {
	case m.pipelineRunning && len(m.pipelineLog) > 0:
		// Progress bar + log in a fixed-height viewport.
		progressLine := m.progressBar.ViewAs(m.pipelineProgress) +
			"  " + m.styles.Muted.Render(m.pipelineStage)
		logH := max(panelH-1, 2) // -1 for progress line
		m.logView.Width = panelW
		m.logView.Height = logH
		m.logView.SetContent(strings.Join(m.pipelineLog, "\n"))
		m.logView.GotoBottom()
		body = progressLine + "\n" + m.logView.View()
	case m.pipelineRunning:
		body = m.progressBar.ViewAs(m.pipelineProgress) +
			"  " + m.styles.Muted.Render(m.pipelineStage)
	case m.pipelineErr != nil && len(m.pipelineLog) > 0:
		// Error + log in a fixed-height viewport.
		errLine := m.styles.Overlap.Render(
			fmt.Sprintf("Pipeline failed: %s", m.pipelineErr),
		)
		logH := max(panelH-1, 2)
		m.logView.Width = panelW
		m.logView.Height = logH
		m.logView.SetContent(strings.Join(m.pipelineLog, "\n"))
		m.logView.GotoBottom()
		body = errLine + "\n" + m.logView.View()
	default:
		// Terminal simulator — renders the tape's terminal state at the
		// selected step. Shows typed commands (with resolved placeholders)
		// and narration as pinned captions at the bottom.
		termContent, captionBar := RenderTerminalSim(
			m.tapeData.Tape.Steps,
			m.cursor,
			panelW, panelH,
			m.theme,
			m.workspaceConstants,
		)
		if termContent == "" && captionBar == "" {
			body = m.styles.Muted.Render("[Select a step to preview]")
		} else {
			// Terminal content in a viewport (scrolls if history overflows).
			// Caption bar always occupies exactly captionHeight rows.
			termViewH := max(panelH-captionHeight, 2)
			m.logView.Width = panelW
			m.logView.Height = termViewH
			m.logView.SetContent(termContent)
			m.logView.GotoBottom()

			// Force caption bar to fixed height so the layout never shifts.
			fixedCaption := lipgloss.NewStyle().
				Width(panelW).
				Height(captionHeight).
				Render(captionBar)

			body = lipgloss.JoinVertical(lipgloss.Left,
				m.logView.View(),
				fixedCaption,
			)
		}
	}

	panel := m.styles.Preview.
		Width(m.layout.PreviewWidth).
		Height(m.layout.PreviewHeight).
		Render(body)

	return panel
}

// renderAudioBars renders the horizontal clip blocks and ruler in a
// bordered panel below the video preview.
func (m Model) renderAudioBars() string {
	steps := m.tapeData.Tape.Steps
	totalDur := tape.TotalDuration(steps)
	headerText := fmt.Sprintf("Timeline — %d steps, ~%.1fs", len(steps), totalDur)
	if len(m.overlaps) > 0 {
		headerText += m.styles.Overlap.Render(
			fmt.Sprintf("  (%d overlap%s)", len(m.overlaps), pluralS(len(m.overlaps))),
		)
	}
	header := m.styles.Title.Render(headerText)

	bars := m.renderAudioTimeline(m.layout.TimelineWidth, m.layout.TimelineHeight-1)

	content := lipgloss.JoinVertical(lipgloss.Left, header, bars)

	return m.styles.Timeline.
		Width(m.layout.TimelineWidth).
		Height(m.layout.TimelineHeight).
		Render(content)
}

// renderStepList renders the right column — the scrollable step list.
// When the tape picker or metadata editor is open, it replaces the list.
func (m Model) renderStepList() string {
	if m.confirmQuit && m.quitForm != nil {
		return m.styles.Timeline.
			Width(m.layout.StepListWidth).
			Height(m.layout.StepListHeight).
			Render(m.quitForm.View())
	}
	if m.confirmDiscard && m.confirmForm != nil {
		return m.styles.Timeline.
			Width(m.layout.StepListWidth).
			Height(m.layout.StepListHeight).
			Render(m.confirmForm.View())
	}
	if m.picking {
		return m.renderPicker()
	}
	if m.editingMeta {
		return m.renderMetaEditor()
	}

	steps := m.tapeData.Tape.Steps

	// Build overlap set for highlighting.
	overlapSteps := make(map[int]bool)
	for _, o := range m.overlaps {
		overlapSteps[o.StepA] = true
		overlapSteps[o.StepB] = true
	}

	var lines []string
	for i, step := range steps {
		startTime := tape.StepStartTime(steps, i)
		dur := tape.StepDuration(step)

		actionStyle := m.styles.Clip
		marker := "  "
		if i == m.cursor {
			actionStyle = m.styles.Selected
			marker = "▸ "
		} else if overlapSteps[i] {
			actionStyle = m.styles.Overlap
			marker = "! "
		}

		action := actionStyle.Render(fmt.Sprintf("%-7s", step.Action))
		timing := m.styles.Muted.Render(
			fmt.Sprintf("%5.1fs %4.1fs", startTime, dur),
		)

		// Narration truncated to fit the narrower right column.
		// Chapter steps show their title in the narration slot.
		narr := ""
		if step.Action == "chapter" && step.Title != "" {
			text := step.Title
			maxLen := m.layout.StepListWidth - 26
			if maxLen > 0 && len(text) > maxLen {
				text = text[:maxLen-1] + "…"
			}
			narr = m.styles.Accent.Render(" " + text)
			marker = "§ "
		} else if step.Narration != "" {
			text := step.Narration
			maxLen := m.layout.StepListWidth - 26
			if maxLen > 0 && len(text) > maxLen {
				text = text[:maxLen-1] + "…"
			}
			narrStyle := m.styles.Muted
			if overlapSteps[i] && i != m.cursor {
				narrStyle = m.styles.Overlap
			}
			narr = narrStyle.Render(" " + text)
		}

		line := fmt.Sprintf("%s%2d %s %s%s", marker, i+1, action, timing, narr)
		lines = append(lines, line)
	}

	// Set viewport dimensions and content.
	m.stepView.Height = m.layout.StepListHeight
	m.stepView.Width = m.layout.StepListWidth
	m.stepView.SetContent(strings.Join(lines, "\n"))

	// Auto-scroll to keep cursor visible, or show from the top.
	if m.cursor >= 0 {
		viewH := m.stepView.Height
		if m.cursor < m.stepView.YOffset {
			m.stepView.SetYOffset(m.cursor)
		} else if m.cursor >= m.stepView.YOffset+viewH {
			m.stepView.SetYOffset(m.cursor - viewH + 1)
		}
	} else {
		m.stepView.GotoTop()
	}

	return m.styles.Timeline.
		Width(m.layout.StepListWidth).
		Height(m.layout.StepListHeight).
		Render(m.stepView.View())
}

// renderPicker renders the huh.Select form in the step list panel.
func (m Model) renderPicker() string {
	if m.pickerForm == nil {
		return ""
	}
	return m.styles.Timeline.
		Width(m.layout.StepListWidth).
		Height(m.layout.StepListHeight).
		Render(m.pickerForm.View())
}

// renderMetaEditor renders the metadata editor in the step list panel.
func (m Model) renderMetaEditor() string {
	header := m.styles.Title.Render("Edit metadata  [e/Enter: edit, s: save, Esc: cancel]")

	var lines []string
	for i, field := range m.metaFields {
		marker := "  "
		style := m.styles.Muted
		if i == m.metaCursor {
			marker = "▸ "
			style = m.styles.Selected
		}

		var valuePart string
		if i == m.metaEditing {
			valuePart = m.metaInput.View()
		} else {
			val := m.metaValues[i]
			if val == "" {
				val = "(empty)"
			}
			valuePart = val
		}

		line := fmt.Sprintf("%s%-12s %s", marker, style.Render(field+":"), valuePart)
		lines = append(lines, line)
	}

	content := lipgloss.JoinVertical(lipgloss.Left, header, "", strings.Join(lines, "\n"))

	return m.styles.Timeline.
		Width(m.layout.StepListWidth).
		Height(m.layout.StepListHeight).
		Render(content)
}

// renderInspector renders the bottom panel.
func (m Model) renderInspector() string {
	steps := m.tapeData.Tape.Steps
	totalDur := tape.TotalDuration(steps)

	if m.cursor < 0 || m.cursor >= len(steps) {
		return m.renderInspectorSummary(steps, totalDur)
	}

	return m.renderInspectorDetail(steps)
}

// renderInspectorSummary renders the inspector when no clip is selected.
func (m Model) renderInspectorSummary(steps []tape.Step, totalDur float64) string {
	var voiceInfo string
	if len(m.tapeData.Meta.Voices) > 0 {
		voiceInfo = strings.Join(m.tapeData.Meta.Voices, ", ")
	} else {
		voiceInfo = "northern_english_male (default)"
	}

	info := fmt.Sprintf(
		"Steps: %d    Duration: ~%.1fs    Voices: %s",
		len(steps), totalDur, voiceInfo,
	)
	hint := m.styles.Muted.Render("[j/k to select a clip]")

	content := lipgloss.JoinVertical(lipgloss.Left, info, "", hint)

	return m.styles.Inspector.
		Width(m.layout.InspectorWidth).
		Height(m.layout.InspectorHeight).
		Render(content)
}

// renderInspectorDetail renders the inspector for the selected clip.
func (m Model) renderInspectorDetail(steps []tape.Step) string {
	step := steps[m.cursor]

	pause := tape.DefaultPause
	if step.Pause != nil {
		pause = *step.Pause
	}

	header := m.styles.Title.Render(
		fmt.Sprintf("Step %d — %s", m.cursor+1, step.Action),
	)

	var pauseStr string
	if m.editing {
		pauseStr = fmt.Sprintf("pause: %s  [Enter to confirm, Esc to cancel]", m.pauseInput.View())
	} else {
		pauseStr = fmt.Sprintf("pause: %.2fs", pause)
		if step.Action == "type" && step.Command != "" {
			typingTime := float64(len(step.Command)*tape.TypingSpeedMS) / 1000.0
			pauseStr += fmt.Sprintf("  (typing: %.2fs)", typingTime)
		}
	}

	// Audio offset display.
	audioOffsetStr := ""
	if step.NarrationOffset != nil && *step.NarrationOffset != 0 {
		sign := "+"
		if *step.NarrationOffset < 0 {
			sign = ""
		}
		audioOffsetStr = m.styles.Delta.Render(
			fmt.Sprintf("  audio: %s%.2fs", sign, *step.NarrationOffset),
		)
	}

	nudgeHint := ""
	if !m.editing {
		nudgeHint = m.styles.Muted.Render(
			fmt.Sprintf("h/l: audio ±%.2fs  ↑↓: pause  e: edit", m.nudgeStep),
		)
	}

	narr := m.styles.Muted.Render("[no narration]")
	if step.Narration != "" {
		narrDur := tape.NarrationDuration(step.Narration)
		narr = fmt.Sprintf("%s  (~%.1fs)", step.Narration, narrDur)
	}

	// Status: show [modified], save confirmation, or save error.
	statusStr := ""
	if m.statusMsg != "" {
		statusStr = m.styles.Delta.Render("  [" + m.statusMsg + "]")
	} else if m.dirty {
		statusStr = m.styles.Delta.Render("  [modified]")
	}

	// Overlap warning for this step.
	overlapStr := ""
	if o := m.overlapForStep(m.cursor); o != nil {
		other := o.StepB + 1
		if o.StepB == m.cursor {
			other = o.StepA + 1
		}
		overlapStr = m.styles.Overlap.Render(
			fmt.Sprintf("OVERLAP with step %d (%.2fs)", other, o.Amount),
		)
	}

	pauseLine := pauseStr + audioOffsetStr
	if nudgeHint != "" {
		pauseLine += "  " + nudgeHint
	}

	contentParts := []string{
		header + statusStr,
		pauseLine,
		narr,
	}
	if overlapStr != "" {
		contentParts = append(contentParts, overlapStr)
	}
	content := lipgloss.JoinVertical(lipgloss.Left, contentParts...)

	return m.styles.Inspector.
		Width(m.layout.InspectorWidth).
		Height(m.layout.InspectorHeight).
		Render(content)
}

// renderFooter uses the bubbles help component to render contextual
// keybinding hints. Press ? to toggle the full help view.
func (m Model) renderFooter() string {
	if m.pipelineRunning {
		return m.styles.Footer.Render(
			fmt.Sprintf("  %s Pipeline running…", m.spinner.View()),
		)
	}

	if m.confirmQuit || m.confirmDiscard {
		return m.styles.Warning.Render("  Awaiting confirmation — Esc to cancel")
	}

	return m.help.View(m.keys)
}
