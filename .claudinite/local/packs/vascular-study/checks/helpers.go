package checks

import (
	"strings"

	"claudinite.com/checksdk"
)

// study is the folder this pack polices; nothing outside it is the study's.
const study = "studies/vascular/"

// trim trims what JavaScript's String.prototype.trim does, so a line reads
// as blank, a comment or a table row exactly as the rules were written to.
func trim(s string) string { return strings.TrimFunc(s, checksdk.IsJSSpace) }

// lineAt is the 1-based line that byte offset i of text falls on.
func lineAt(text string, i int) int { return strings.Count(text[:i], "\n") + 1 }

// uncomment blanks every Python `#` comment to the end of its line, keeping
// the newline so line numbers still count. Quote-aware: a `#` inside a
// string literal is not a comment.
func uncomment(text string) string {
	lines := strings.Split(text, "\n")
	for n, line := range lines {
		var quote byte
		for i := 0; i < len(line); i++ {
			c := line[i]
			switch {
			case quote != 0:
				if c == '\\' {
					i++
				} else if c == quote {
					quote = 0
				}
			case c == '"' || c == '\'':
				quote = c
			case c == '#':
				lines[n] = line[:i]
				i = len(line)
			}
		}
	}
	return strings.Join(lines, "\n")
}
