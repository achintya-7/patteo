# Records the README's demo from demo data — no daemon, nothing private.
#   brew install vhs && vhs docs/demo.tape
# The tape drives the real UI with real keystrokes: composer → panel → diff → PR → answer an agent.

Output "demo.mp4"

Set Shell bash
Set FontFamily "Menlo"
Set FontSize 16
Set Width 1400
Set Height 700
Set Padding 6
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms
Set Framerate 15

Hide
Type "COLORTERM=truecolor bun scripts/demo.tsx"
Enter
Sleep 1s
Show
Sleep 1.6s

# Type a follow-up; the composer grows with it.
Type "also handle 15-digit Amex"
Sleep 500ms
Escape
Sleep 300ms

# Files → Changes → a syntax-coloured diff.
Type "C"
Sleep 900ms
Type "]"
Sleep 1500ms
Enter
Sleep 1300ms
Type "jjjj"
Sleep 900ms

# The pull request behind the branch.
Type "P"
Sleep 1900ms
Escape
Sleep 300ms

# An agent asks something; every question is in one form.
Type "p"
Sleep 1500ms
Type "1"
Sleep 800ms
Type "1"
Sleep 700ms
Type "jjjj"
Sleep 500ms
Enter
Sleep 1200ms
Escape
Sleep 1800ms
