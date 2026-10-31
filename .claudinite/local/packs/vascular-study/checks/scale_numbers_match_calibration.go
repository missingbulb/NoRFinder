package checks

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"claudinite.com/checksdk"
)

// The px -> um scale of every figure is derived from ONE source: UM_PER_BAR /
// SCALEBAR_PX in the extraction script (the measured 50 um bar widths). The docs
// quote those numbers in three places (the pack RULES, the working guide, the
// results calibration table) — this check keeps the copies honest.
//
// Detection is column/label-scoped, never a bare grep for decimals: a claim is
// read only from an inline `figN = <value>` in a passage that says "um/px", or
// from a markdown table's own um/px and bar-width COLUMNS, and only when the
// figure cell names a figure rather than a panel. That is what keeps the per-panel
// results table (fig1_C1_healthy | 2145 | 23.6 | ...) out of scope.
const calibrationScript = "studies/vascular/analysis/measure_vessels.py"

const umppLabel = "µm/px"

var (
	umPerBarDef  = regexp.MustCompile(`UM_PER_BAR\s*=\s*([\d.]+)`)
	barWidths    = regexp.MustCompile(`SCALEBAR_PX\s*=\s*\{([^}]*)\}`)
	barWidthPair = regexp.MustCompile(`['"]([^'"]+)['"]\s*:\s*(\d+(?:\.\d+)?)`)
	// The unit that marks a scale claim: micro sign, greek mu or plain "u", then m/px.
	umppUnit = regexp.MustCompile(`(?i)[µμu]m\s*/\s*px`)
	// "fig1 = 0.820", "fig4/5/6 = 0.658", "fig4 / fig5 = 0.658"
	inlineClaim = regexp.MustCompile(`\bfig(\d+(?:\s*/\s*(?:fig)?\d+)*)\s*=\s*\*{0,2}[~≈]?\s*(\d+(?:\.\d+)?)`)
	// a table cell that is just a number, optionally in px and/or bold: "61 px", "**0.820**"
	numberCell = regexp.MustCompile(`^\*{0,2}[~≈]?\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*\*{0,2}$`)
	labelSplit = regexp.MustCompile(`[/,]`)
	figPrefix  = regexp.MustCompile(`(?i)^fig`)
	digitsOnly = regexp.MustCompile(`^\d+$`)
	figHeader  = regexp.MustCompile(`(?i)fig`)
	barHeader  = regexp.MustCompile(`(?i)bar`)
	unitHeader = regexp.MustCompile(`(?i)px|m\b`)
)

func init() {
	checksdk.Register(checksdk.Check{
		ID:     "scale-numbers-match-calibration",
		Tags:   []string{"world"},
		OnFail: "block",
		Since:  "2026-07-28",
		Doc:    ".claudinite/local/packs/vascular-study/RULES.md",
		Why:    "the um/px per figure is derived from one measured table (UM_PER_BAR / SCALEBAR_PX); a doc that quotes a stale copy does not fail loudly — it silently re-labels every length and density number in that document with the wrong scale",
		Run:    scaleNumbersMatchCalibration,
	})
}

// figsOf is the figures a label names — "fig1", "fig4/5/6", "fig4 / fig5". Anything
// that is not a bare figure number is dropped, so a panel-level label
// ("fig1_C1_healthy", "fig1 crop A2") names no figure and carries no claim.
func figsOf(label string) []string {
	var out []string
	for _, p := range labelSplit.Split(label, -1) {
		p = figPrefix.ReplaceAllString(trim(p), "")
		if digitsOnly.MatchString(p) {
			out = append(out, "fig"+p)
		}
	}
	return out
}

// toFixed is x with dp decimals as JavaScript's Number.prototype.toFixed writes
// it: rounded from x's exact binary value, an exact tie going to the larger
// magnitude, where strconv would round it to even.
func toFixed(x float64, dp int) string {
	switch {
	case math.IsNaN(x):
		return "NaN"
	case math.IsInf(x, 1):
		return "Infinity"
	case math.IsInf(x, -1):
		return "-Infinity"
	}
	sign := ""
	if x < 0 {
		sign, x = "-", -x
	}
	exact := strconv.FormatFloat(x, 'f', 1100, 64)
	point := strings.IndexByte(exact, '.')
	digits := []byte(exact[:point] + exact[point+1:point+1+dp])
	if exact[point+1+dp] >= '5' {
		i := len(digits) - 1
		for ; i >= 0 && digits[i] == '9'; i-- {
			digits[i] = '0'
		}
		if i < 0 {
			digits = append([]byte{'1'}, digits...)
			point++
		} else {
			digits[i]++
		}
	}
	whole, frac := string(digits[:point]), string(digits[point:])
	if s := strings.TrimLeft(whole, "0"); s != "" {
		whole = s
	} else {
		whole = "0"
	}
	if frac == "" {
		return sign + whole
	}
	return sign + whole + "." + frac
}

func number(s string) float64 {
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return math.NaN()
	}
	return v
}

// agrees reports whether a quoted value matches the true value rounded to the
// precision the doc chose to quote it at (0.820, 0.82 and 0.8197 all describe 50/61).
func agrees(quoted string, truth float64) bool {
	dp := 0
	if i := strings.IndexByte(quoted, '.'); i >= 0 {
		dp = len(quoted) - i - 1
	}
	return number(quoted) == number(toFixed(truth, dp))
}

func tableCells(line string) []string {
	s := trim(line)
	s = strings.TrimPrefix(s, "|")
	s = strings.TrimSuffix(s, "|")
	cells := strings.Split(s, "|")
	for i, c := range cells {
		cells[i] = trim(c)
	}
	return cells
}

type textBlock struct {
	start int // the 1-based line the block starts on
	lines []string
}

// textBlocks is text's blank-line-separated blocks.
func textBlocks(text string) []*textBlock {
	var out []*textBlock
	var cur *textBlock
	for i, line := range strings.Split(text, "\n") {
		if trim(line) == "" {
			cur = nil
			continue
		}
		if cur == nil {
			cur = &textBlock{start: i + 1}
			out = append(out, cur)
		}
		cur.lines = append(cur.lines, line)
	}
	return out
}

func cellAt(cells []string, i int) string {
	if i < 0 || i >= len(cells) {
		return ""
	}
	return cells[i]
}

func scaleNumbersMatchCalibration(repo checksdk.Repo) []checksdk.Finding {
	src, ok := repo.Read(calibrationScript)
	if !ok {
		return nil
	}
	perBar := umPerBarDef.FindStringSubmatch(src)
	table := barWidths.FindStringSubmatch(src)
	// No calibration source to compare against: panel-scale-calibration owns that.
	if perBar == nil || table == nil {
		return nil
	}
	bar := map[string]float64{}
	for _, m := range barWidthPair.FindAllStringSubmatch(table[1], -1) {
		bar[m[1]] = number(m[2])
	}
	um := number(perBar[1])
	// truth is the calibrated value of fig, false for an uncalibrated figure, which
	// is not this rule's.
	truth := func(fig, kind string) (float64, bool) {
		px, ok := bar[fig]
		if !ok {
			return 0, false
		}
		if kind == "bar" {
			return px, true
		}
		return um / px, true
	}

	var out []checksdk.Finding
	flag := func(file string, line int, fig, kind, quoted, expected string) {
		f := checksdk.Finding{Path: file, Line: line}
		if kind == "bar" {
			f.Sentence = fmt.Sprintf("%s's scale bar is quoted as %s px but SCALEBAR_PX says %s", fig, quoted, expected)
			f.Fix = fmt.Sprintf("quote %s's bar as %s px, or fix SCALEBAR_PX in %s if the measurement changed — the table is the single source", fig, expected, calibrationScript)
		} else {
			f.Sentence = fmt.Sprintf("%s's scale is quoted as %s %s but SCALEBAR_PX gives %s", fig, quoted, umppLabel, expected)
			f.Fix = fmt.Sprintf("quote %s %s for %s (UM_PER_BAR / SCALEBAR_PX['%s']), or fix the table in %s if the measurement changed", expected, umppLabel, fig, fig, calibrationScript)
		}
		out = append(out, f)
	}

	for _, file := range repo.Tracked() {
		if !strings.HasSuffix(file, ".md") || !strings.HasPrefix(file, study) {
			continue
		}
		text, ok := repo.Read(file)
		if !ok {
			continue
		}

		for _, blk := range textBlocks(text) {
			if !umppUnit.MatchString(strings.Join(blk.lines, "\n")) {
				continue // no scale claim in this passage
			}

			// --- inline prose claims: "fig1 = 0.820" ---------------------------
			for i, line := range blk.lines {
				if strings.HasPrefix(trim(line), "|") {
					continue // table rows handled below
				}
				for _, m := range inlineClaim.FindAllStringSubmatch(line, -1) {
					for _, fig := range figsOf(m[1]) {
						t, ok := truth(fig, "umpp")
						if ok && !agrees(m[2], t) {
							flag(file, blk.start+i, fig, "umpp", m[2], toFixed(t, 3))
						}
					}
				}
			}

			// --- table columns: a um/px column and/or a bar-width column -------
			type row struct {
				line int
				raw  string
			}
			var rows []row
			for i, l := range blk.lines {
				if strings.HasPrefix(trim(l), "|") {
					rows = append(rows, row{blk.start + i, l})
				}
			}
			if len(rows) < 3 {
				continue
			}
			head := tableCells(rows[0].raw)
			figCol, umppCol, barCol := -1, -1, -1
			for i, c := range head {
				if figCol < 0 && figHeader.MatchString(c) {
					figCol = i
				}
				if umppCol < 0 && umppUnit.MatchString(c) {
					umppCol = i
				}
			}
			for i, c := range head {
				if i != umppCol && barHeader.MatchString(c) && unitHeader.MatchString(c) {
					barCol = i
					break
				}
			}
			if figCol < 0 || (umppCol < 0 && barCol < 0) {
				continue
			}
			for _, r := range rows[2:] { // skip header + |---| separator
				cs := tableCells(r.raw)
				label := trim(strings.ReplaceAll(cellAt(cs, figCol), "*", ""))
				for _, col := range []struct {
					at   int
					kind string
				}{{umppCol, "umpp"}, {barCol, "bar"}} {
					if col.at < 0 {
						continue
					}
					hit := numberCell.FindStringSubmatch(cellAt(cs, col.at))
					if hit == nil {
						continue
					}
					for _, fig := range figsOf(label) {
						t, ok := truth(fig, col.kind)
						if !ok || agrees(hit[1], t) {
							continue
						}
						expected := toFixed(t, 3)
						if col.kind == "bar" {
							expected = strconv.FormatFloat(t, 'f', -1, 64)
						}
						flag(file, r.line, fig, col.kind, hit[1], expected)
					}
				}
			}
		}
	}
	return out
}
