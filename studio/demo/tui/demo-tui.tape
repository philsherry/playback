# TUI Demo — VHS tape that records the TUI editor in action.
#
# This is a standalone VHS tape (not a playback tape.yaml) that records
# a screen capture of someone using the TUI to fix overlapping audio.
#
# Run with: vhs demo/tui-demo/tui-demo.tape

Output demo/tui-demo/tui-demo.gif
Output demo/tui-demo/tui-demo.mp4

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

# Launch the TUI with the demo tape.
# "The playback TUI..." narration starts at 0.00s in the audio track.
Type "npm run playback:demo"
Enter
Sleep 4s    # go run compile time
Sleep 9.6s  # show TUI in initial state; total ~14.6s before first j

# Navigate to step 4 (first overlap).
# Audio: "Navigate with j and k..." at 14.60s.
Type "j"
Sleep 0.5s
Type "j"
Sleep 0.5s
Type "j"
Sleep 0.5s
Type "j"
Sleep 5.7s  # show overlap highlighted in inspector; 16.1s + 5.7s = 21.8s

# Fix first overlap — 3 presses × 0.25s = 0.75s.
# Audio: "Press l to slide the narration later..." at 21.80s.
Type "l"
Sleep 0.4s
Type "l"
Sleep 0.4s
Type "l"
Sleep 6.4s  # show first overlap resolved; 22.6s + 6.4s = 29.0s

# Move to second overlap.
Type "j"
Sleep 0.3s
Type "j"
Sleep 0.3s

# Fix second overlap — 4 presses × 0.25s = 1.0s.
# Audio: "Fix the second overlap." at 29.60s.
Type "l"
Sleep 0.4s
Type "l"
Sleep 0.4s
Type "l"
Sleep 0.4s
Type "l"
Sleep 1.7s  # show second overlap resolved; 30.8s + 1.7s = 32.5s

# Move to third overlap.
Type "j"
Sleep 0.3s
Type "j"
Sleep 0.3s

# Fix third overlap — 2 presses × 0.25s = 0.5s.
# Audio: "And the third." at 33.10s.
Type "l"
Sleep 0.4s
Type "l"
Sleep 1.6s  # show third overlap resolved; 33.5s + 1.6s = 35.1s

# Save.
# Audio: "Press s to save. The offsets write back to tape.yaml." at 35.10s.
Type "s"
Sleep 4s    # 35.1s + 4s = 39.1s

# Tape picker.
# Audio: "Press o to switch between tapes." at 39.10s.
Type "o"
Sleep 2s    # 39.1s + 2s = 41.1s
Escape
Sleep 1.4s  # 41.1s + 1.4s = 42.5s

# Help.
# Audio: "Question mark for the keybinding reference." at 42.50s.
Type "?"
Sleep 2.95s # 42.5s + 2.95s = 45.45s
Type "?"
Sleep 1s    # 45.45s + 1s = 46.45s

# Quit.
# Audio: "And q to quit. That's the playback TUI." at 46.45s.
Type "q"
Sleep 5s
