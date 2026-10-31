package checks

import (
	"strings"
	"testing"
)

// The one calibration source: 50 um / bar width in px -> fig1 0.820, fig3 1.064.
const (
	calibSource = "UM_PER_BAR = 50.0\nSCALEBAR_PX = {'fig1': 61, 'fig3': 47}\n"
	guideDoc    = "studies/vascular/docs/WORKING-GUIDE.md"
	resultsDoc  = "studies/vascular/docs/results-first-pass.md"
)

func barTable(barPx, umpp string) string {
	return strings.Join([]string{
		"| figure(s) | 50 µm bar | **µm/px** | panel field of view |",
		"|---|---:|---:|---|",
		"| fig1 | " + barPx + " px | **" + umpp + "** | ~301 µm |",
		// A panel-level row in the same table: not a figure-level scale claim, so its
		// crop width and printed resolution are none of this rule's business.
		"| fig1 crop A2 | 380 px | **0.15** | as printed |",
	}, "\n")
}

func TestScaleNumbersMatchCalibrationFiresOnAStaleUmppQuotedInProse(t *testing.T) {
	fs := run(t, scaleNumbersMatchCalibration, map[string]string{
		measureScript: calibSource,
		guideDoc:      "px→µm is calibrated from it (fig1 = 0.820, fig3 = 1.070 µm/px).\n",
	}, measureScript, guideDoc)
	wantCount(t, fs, 1)
	if fs[0].Path != guideDoc {
		t.Errorf("finding on %s, want %s", fs[0].Path, guideDoc)
	}
	wantLine(t, fs[0], 1)
	wantMatch(t, fs[0].Sentence, `fig3.*1\.070.*1\.064`)
}

func TestScaleNumbersMatchCalibrationFiresOnAStaleBarWidthInATableColumn(t *testing.T) {
	fs := run(t, scaleNumbersMatchCalibration, map[string]string{
		measureScript: calibSource,
		resultsDoc:    barTable("59", "0.820") + "\n",
	}, measureScript, resultsDoc)
	wantCount(t, fs, 1)
	wantLine(t, fs[0], 3)
	wantMatch(t, fs[0].Sentence, `scale bar is quoted as 59 px but SCALEBAR_PX says 61`)
}

func TestScaleNumbersMatchCalibrationIsQuietWhenEveryQuotedNumberAgrees(t *testing.T) {
	fs := run(t, scaleNumbersMatchCalibration, map[string]string{
		measureScript: calibSource,
		// Coarser precision is still the same number (0.82 == 50/61 to 2 dp);
		// the second paragraph assigns numbers to figures with no scale unit in
		// sight — a per-figure score is not a scale claim.
		guideDoc: "calibrated from it (fig1 = 0.82, fig3 = 1.064 µm/px — SCALEBAR_PX).\n" +
			"\nRecall on the tuning sweep: fig1 = 0.35, fig3 = 0.41.\n",
		resultsDoc: strings.Join([]string{
			barTable("61", "0.820"),
			"",
			// Per-panel metrics: decimals next to figure-prefixed panel names, in a
			// block that DOES say µm/px — a grep would cry wolf here, the
			// column-scoped parse must not (no µm/px or bar column in this table).
			"Lengths below are converted with each figure’s µm/px.",
			"| panel | len_um | len_dens | area% |",
			"|---|---:|---:|---:|",
			"| fig1_C1_healthy | 2145 | 23.6 | 14.2 |",
			"| fig3_ischemic | 2287 | 23.9 | 18.1 |",
		}, "\n"),
	}, measureScript, guideDoc, resultsDoc)
	wantCount(t, fs, 0)
}

// agrees rounds the true value the way the rule was written against, an exact
// tie going up: 50/40 is exactly 1.25, which a doc quotes as 1.3.
func TestToFixedRoundsAnExactTieUp(t *testing.T) {
	for _, c := range []struct {
		x    float64
		dp   int
		want string
	}{{1.25, 1, "1.3"}, {0.5, 0, "1"}, {2.5, 0, "3"}, {1.005, 2, "1.00"}, {50.0 / 61, 3, "0.820"}, {9.9996, 3, "10.000"}, {47, 0, "47"}} {
		if got := toFixed(c.x, c.dp); got != c.want {
			t.Errorf("toFixed(%v, %d) = %q, want %q", c.x, c.dp, got, c.want)
		}
	}
	if !agrees("1.3", 50.0/40) {
		t.Error("1.3 should agree with 50/40")
	}
}
