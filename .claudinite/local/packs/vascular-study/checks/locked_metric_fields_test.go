package checks

import (
	"fmt"
	"strings"
	"testing"
)

// metricsSource is a metrics dict shaped like the real one, minus whichever fields
// a case drops. Interleaved comments included deliberately: the real dict carries
// them, and a comment between two fields must not hide the field that follows it.
func metricsSource(fields ...string) string {
	var kw []string
	for _, f := range fields {
		kw = append(kw, fmt.Sprintf("%s=v_%s", f, f))
	}
	return strings.Join([]string{
		`"""Delivers the professor's three asks per image:`,
		`  - COUNT : number of branch segments (junction-to-junction pieces)`,
		`"""`,
		`ARTERY_DIAM_PX = 9.0`,
		``,
		`def analyze(rgb, umpp):`,
		`    m = dict(area=100 * mask.mean(),`,
		`             # scale-invariant, comparable across figures:`,
		`             ` + strings.Join(kw, ", ") + `,`,
		`             wp90=round(float(np.percentile(widths, 90)), 1))`,
		`    return m, dict(mask=mask, skel=skel)`,
	}, "\n")
}

var allLocked = []string{"segments", "capillary", "artery", "length_um", "length_density"}

func TestLockedMetricFieldsFiresWhenTheCountUnitStopsBeingReported(t *testing.T) {
	// COUNT re-pointed at connected components: `segments` is gone as a field and
	// survives only in the docstring — a text grep would be satisfied, the check
	// is not, because it reads the metrics dict.
	fs := run(t, lockedMetricFields, map[string]string{
		measureScript: metricsSource("vessels", "capillary", "artery", "length_um", "length_density"),
	})
	wantCount(t, fs, 1)
	wantMatch(t, fs[0].Sentence, `COUNT is locked to branch segments`)
	wantMatch(t, fs[0].Sentence, `no segments field`)
	wantLine(t, fs[0], 7)
}

func TestLockedMetricFieldsReportsEachLockedAskThatLostAField(t *testing.T) {
	fs := run(t, lockedMetricFields, map[string]string{measureScript: metricsSource("segments", "capillary", "length_um")})
	var asks []string
	for _, f := range fs {
		asks = append(asks, strings.Split(f.Sentence, " is locked")[0])
	}
	if got := strings.Join(asks, ","); got != "CATEGORIZE,MEASURE" {
		t.Fatalf("asks %q, want CATEGORIZE,MEASURE", got)
	}
	wantMatch(t, fs[0].Sentence, `no artery field`)
	wantMatch(t, fs[1].Sentence, `no length_density field`)
}

func TestLockedMetricFieldsIsQuietWhenAllThreeAsksAreStillReported(t *testing.T) {
	fs := run(t, lockedMetricFields, map[string]string{measureScript: metricsSource(allLocked...)})
	wantCount(t, fs, 0)
}

func TestLockedMetricFieldsFiresWhenTheMetricsDictItselfIsGone(t *testing.T) {
	fs := run(t, lockedMetricFields, map[string]string{
		measureScript: "def analyze(rgb, umpp):\n    return defaultdict(list)\n",
	})
	wantCount(t, fs, 1)
	wantMatch(t, fs[0].Sentence, `no metrics dict found`)
}
