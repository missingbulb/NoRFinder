package checks

import (
	"fmt"
	"regexp"
	"slices"
	"strings"

	"claudinite.com/checksdk"
)

// The extraction script is the single place the three locked metrics are
// computed and named; every downstream table, overlay banner and results
// markdown quotes those field names back.
const metricsScript = "studies/vascular/analysis/measure_vessels.py"

// The professor's three asks, and the metric fields each one is locked to.
var lockedMetrics = []struct {
	ask, meaning string
	fields       []string
}{
	{"COUNT", "branch segments (junction-to-junction / junction-to-tip)", []string{"segments"}},
	{"CATEGORIZE", "caliber - capillary vs penetrating artery by centerline diameter", []string{"capillary", "artery"}},
	{"MEASURE", "total centerline length, as raw um and as density", []string{"length_um", "length_density"}},
}

// Parse rather than grep: the metric names count only where they are built as
// keyword fields of a dict(...) construction, never where prose, a docstring or
// a print format string happens to mention them. `defaultdict(` is not a dict
// construction here, hence the test that no word character or dot precedes it.
// A keyword field ends at an `=` that is not the first half of `==`, likewise
// tested on the character after the match.
var (
	dictCall  = regexp.MustCompile(`dict\s*\(`)
	dictKwarg = regexp.MustCompile(`(?:^|[(,]\s*)([A-Za-z_]\w*)\s*=`)
)

func isWordOrDot(c byte) bool {
	return c == '.' || c == '_' || c >= '0' && c <= '9' || c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z'
}

func init() {
	checksdk.Register(checksdk.Check{
		ID:     "locked-metric-fields",
		Tags:   []string{"world"},
		OnFail: "block",
		Since:  "2026-07-28",
		Doc:    ".claudinite/local/packs/vascular-study/RULES.md",
		Why:    "COUNT / CATEGORIZE / MEASURE are locked definitions - dropping or renaming one of their fields changes what every recorded number means, and it fails silently: the metric just stops appearing in the tables it used to anchor",
		Run:    lockedMetricFields,
	})
}

func isLockedField(f string) bool {
	for _, l := range lockedMetrics {
		if slices.Contains(l.fields, f) {
			return true
		}
	}
	return false
}

// reportedFields is the fields of every dict(...) built in the script, the number
// of such dicts, and the line the first dict carrying a locked field starts on
// (where a reviewer should look; 0 when none does). The real metrics dict carries
// trailing `#` comments between its fields, which would otherwise sit between a
// field and the comma that anchors the next one, so they are blanked first.
func reportedFields(source string) (fields map[string]bool, dicts, line int) {
	text := uncomment(source)
	fields = map[string]bool{}
	for _, m := range dictCall.FindAllStringIndex(text, -1) {
		if m[0] > 0 && isWordOrDot(text[m[0]-1]) {
			continue
		}
		dicts++
		depth := 0
		end := m[1] - 1
		for ; end < len(text); end++ {
			if text[end] == '(' {
				depth++
			} else if text[end] == ')' {
				depth--
				if depth == 0 {
					break
				}
			}
		}
		body := text[m[0]:min(end+1, len(text))]
		var here []string
		for _, k := range dictKwarg.FindAllStringSubmatchIndex(body, -1) {
			if strings.HasPrefix(body[k[1]:], "=") {
				continue
			}
			here = append(here, body[k[2]:k[3]])
		}
		if line == 0 && slices.ContainsFunc(here, isLockedField) {
			line = lineAt(text, m[0])
		}
		for _, f := range here {
			fields[f] = true
		}
	}
	return fields, dicts, line
}

func lockedMetricFields(repo checksdk.Repo) []checksdk.Finding {
	text, ok := repo.Read(metricsScript)
	if !ok {
		return nil
	}
	fields, dicts, line := reportedFields(text)
	if dicts == 0 {
		return []checksdk.Finding{{
			Path:     metricsScript,
			Sentence: "no metrics dict found in the extraction script",
			Fix:      "keep the per-panel metrics built as a dict(field=...) in this file - it is the one place the locked metric names are defined",
		}}
	}
	var out []checksdk.Finding
	for _, lock := range lockedMetrics {
		var missing []string
		for _, f := range lock.fields {
			if !fields[f] {
				missing = append(missing, f)
			}
		}
		if len(missing) == 0 {
			continue
		}
		out = append(out, checksdk.Finding{
			Path:     metricsScript,
			Line:     line,
			Sentence: fmt.Sprintf("%s is locked to %s, but the metrics dict reports no %s field", lock.ask, lock.meaning, strings.Join(missing, " / ")),
			Fix:      fmt.Sprintf("report %s again from the metrics dict; if the definition of %s really is changing, that is an owner decision - unlock it in the pack RULES.md first, then re-record every number that was measured under the old definition", strings.Join(missing, " and "), lock.ask),
		})
	}
	return out
}
