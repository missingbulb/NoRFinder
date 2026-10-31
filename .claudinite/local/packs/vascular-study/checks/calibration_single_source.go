package checks

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"claudinite.com/checksdk"
)

// The px -> um scale of every figure comes from ONE measured table: UM_PER_BAR
// and SCALEBAR_PX in studies/vascular/analysis/measure_vessels.py. annotate_overlays.py reads them
// by importing from there, never by carrying its own copy — that is the invariant
// this check holds.
//
// Companion to scale-numbers-match-calibration, which holds the numbers quoted in
// *markdown* to that table. Markdown is all that check reads, so a second table
// defined in Python is invisible to it: the two rules cover opposite halves of the
// same single-source line.
//
// Parse rather than grep: the names are stripped of comments and of every string
// literal (including the docstrings that spell the table out) first, and only an
// assignment — `NAME =`, or an annotated `NAME: dict =` — counts. A docstring
// quoting "SCALEBAR_PX = {'fig1': 61}" documents the table; it does not define it.
const calibrationSource = "studies/vascular/analysis/measure_vessels.py"

var (
	calibrationNames = []string{"UM_PER_BAR", "SCALEBAR_PX"}
	// An assignment ends at an `=` that is not the first half of `==`, which the
	// caller tests on the character after the match.
	calibrationAssign = regexp.MustCompile(`^\s*(` + strings.Join(calibrationNames, "|") + `)\s*(?::[^=\n]+)?=`)
)

func init() {
	checksdk.Register(checksdk.Check{
		ID:     "calibration-single-source",
		Tags:   []string{"world"},
		OnFail: "block",
		Since:  "2026-07-29",
		Doc:    ".claudinite/local/packs/vascular-study/RULES.md",
		Why:    "UM_PER_BAR / SCALEBAR_PX are a measurement, not a constant — a second definition means two calibrations, and the one a given script happens to read wins silently, re-labelling its lengths and densities with a scale nobody re-measured",
		Run:    calibrationSingleSource,
	})
}

// pythonCode blanks out comments and string literals, keeping every newline and
// every column so line numbers and the assignment shape survive. Handles ”' / """
// blocks, single-quoted strings and escapes; a `#` inside a string is not a comment.
func pythonCode(text string) string {
	src := []rune(text)
	out := make([]rune, 0, len(src))
	var quote []rune // the open delimiter, or nil
	startsWith := func(i int, s []rune) bool {
		if i+len(s) > len(src) {
			return false
		}
		for k, r := range s {
			if src[i+k] != r {
				return false
			}
		}
		return true
	}
	blank := func(n int) {
		for ; n > 0; n-- {
			out = append(out, ' ')
		}
	}
	for i := 0; i < len(src); {
		c := src[i]
		if quote != nil {
			if c == '\\' && len(quote) == 1 {
				blank(2)
				i += 2
				continue
			}
			if startsWith(i, quote) {
				blank(len(quote))
				i += len(quote)
				quote = nil
				continue
			}
			if c == '\n' {
				out = append(out, '\n')
			} else {
				out = append(out, ' ')
			}
			i++
			continue
		}
		if c == '#' { // to end of line
			for i < len(src) && src[i] != '\n' {
				out = append(out, ' ')
				i++
			}
			continue
		}
		if c == '"' || c == '\'' {
			triple := []rune{c, c, c}
			if startsWith(i, triple) {
				quote = triple
			} else {
				quote = []rune{c}
			}
			blank(len(quote))
			i += len(quote)
			continue
		}
		out = append(out, c)
		i++
	}
	return string(out)
}

type calibrationDef struct {
	name string
	line int
}

// calibrationDefs is every line of text that assigns one of the calibration names.
// Only statements count: a line that starts inside an open bracket is a continuation,
// where `UM_PER_BAR=50` is a keyword argument being passed, not the table being defined.
func calibrationDefs(text string) []calibrationDef {
	var out []calibrationDef
	depth := 0
	for i, line := range strings.Split(pythonCode(text), "\n") {
		if depth == 0 {
			if m := calibrationAssign.FindStringSubmatchIndex(line); m != nil && !strings.HasPrefix(line[m[1]:], "=") {
				out = append(out, calibrationDef{line[m[2]:m[3]], i + 1})
			}
		}
		for _, c := range line {
			switch c {
			case '(', '[', '{':
				depth++
			case ')', ']', '}':
				depth = max(0, depth-1)
			}
		}
	}
	return out
}

func calibrationSingleSource(repo checksdk.Repo) []checksdk.Finding {
	var out []checksdk.Finding
	for _, file := range repo.Tracked() {
		if !strings.HasSuffix(file, ".py") || !strings.HasPrefix(file, study) {
			continue
		}
		text, ok := repo.Read(file)
		if !ok {
			continue
		}
		defs := calibrationDefs(text)

		if file == calibrationSource {
			// The source file itself: a name assigned twice is the same drift, one
			// file in. The later assignment wins and the earlier measurement is dead
			// code that still reads as the calibration.
			for _, name := range calibrationNames {
				var lines []string
				last := 0
				for _, d := range defs {
					if d.name == name {
						lines = append(lines, strconv.Itoa(d.line))
						last = d.line
					}
				}
				if len(lines) < 2 {
					continue
				}
				out = append(out, checksdk.Finding{
					Path:     file,
					Line:     last,
					Sentence: fmt.Sprintf("%s is assigned %d times in %s (lines %s)", name, len(lines), calibrationSource, strings.Join(lines, ", ")),
					Fix:      fmt.Sprintf("keep one %s assignment — delete the copies, or if the bar was re-measured, replace the single definition with the new value", name),
				})
			}
			continue
		}

		for _, d := range defs {
			out = append(out, checksdk.Finding{
				Path:     file,
				Line:     d.line,
				Sentence: fmt.Sprintf("%s defines its own %s", file, d.name),
				Fix:      fmt.Sprintf("import it instead — `from measure_vessels import %s`, the way the overlay script already reads the table; if a bar really was re-measured, change the value in %s, the one place it is measured", d.name, calibrationSource),
			})
		}
	}
	return out
}
