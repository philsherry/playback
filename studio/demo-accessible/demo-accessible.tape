# Accessible Demo — VHS tape that records the accessible timing editor.
#
# This is a standalone VHS tape (not a playback tape.yaml) that records
# a screen capture of someone using the accessible mode to review and
# adjust narration timing via sequential text prompts.
#
# Run with: vhs demo/accessible-demo/accessible-demo.tape

Output demo/accessible-demo/accessible-demo.gif
Output demo/accessible-demo/accessible-demo.mp4

Set Width 1280
Set Height 720
Set FontSize 14
Set FontFamily "FiraCode Nerd Font Mono"
Set Theme {"name":"TokyoNight","background":"#24283b","foreground":"#c0caf5","cursor":"#c0caf5","black":"#1a1b26","red":"#f7768e","green":"#9ece6a","yellow":"#e0af68","blue":"#7aa2f7","magenta":"#bb9af7","cyan":"#7dcfff","white":"#c0caf5","brightBlack":"#545c7e","brightRed":"#f7768e","brightGreen":"#9ece6a","brightYellow":"#e0af68","brightBlue":"#7aa2f7","brightMagenta":"#bb9af7","brightCyan":"#7dcfff","brightWhite":"#c0caf5"}
Set WindowBar Colorful
Set BorderRadius 10
Set Margin 20
Set MarginFill "#24283b"
Set Shell zsh
Set TypingSpeed 50ms
Set Framerate 30

# Launch accessible mode with the demo tape.
Type "npm run playback:edit:accessible -- demo/example"
Enter
Sleep 3s

# Let the user read the welcome message and first step.
Sleep 4s

# Show help.
Type "?"
Enter
Sleep 4s

# Step forward through a few clips.
Type "n"
Enter
Sleep 2s

Type "n"
Enter
Sleep 2s

Type "n"
Enter
Sleep 3s

# Nudge the pause value up.
Type "+"
Enter
Sleep 2s

Type "+"
Enter
Sleep 2s

# Undo.
Type "u"
Enter
Sleep 2s

# Redo the nudge.
Type "+"
Enter
Sleep 2s

# Step forward once more.
Type "n"
Enter
Sleep 2s

# Check status of current step.
Type "s"
Enter
Sleep 3s

# Quit.
Type "q"
Enter
Sleep 3s
