package checks

import (
	"strings"
	"testing"
)

const annotateScript = "studies/vascular/analysis/annotate_overlays.py"

var calibrationSrc = strings.Join([]string{
	`"""Vessel quantification.`,
	``,
	`Calibration lives here: SCALEBAR_PX = {'fig1': 61} — a docstring quoting the`,
	`table documents it, it does not define it.`,
	`"""`,
	`import os`,
	`UM_PER_BAR = 50.0`,
	`SCALEBAR_PX = {'fig1': 61, 'fig3': 47}`,
}, "\n")

func TestCalibrationSingleSourceFiresOnASecondCalibrationTableInAnotherScript(t *testing.T) {
	fs := run(t, calibrationSingleSource, map[string]string{
		measureScript: calibrationSrc,
		// The importing script grows its own copy — the drift the rule is about.
		annotateScript: strings.Join([]string{
			`from measure_vessels import (segment, prune, umpp_for,`,
			`                             ARTERY_DIAM_PX, SRC)`,
			``,
			`SCALEBAR_PX = {'fig1': 61, 'fig3': 47, 'fig4': 76}`,
		}, "\n"),
	}, measureScript, annotateScript)
	wantCount(t, fs, 1)
	if fs[0].Path != annotateScript {
		t.Errorf("finding on %s, want %s", fs[0].Path, annotateScript)
	}
	wantLine(t, fs[0], 4)
	wantMatch(t, fs[0].Sentence, `defines its own SCALEBAR_PX`)
}

func TestCalibrationSingleSourceFiresWhenTheSourceAssignsOneNameTwice(t *testing.T) {
	fs := run(t, calibrationSingleSource, map[string]string{
		measureScript: calibrationSrc + "\n\n# re-measured fig3, old table left above\nSCALEBAR_PX = {'fig1': 61, 'fig3': 44}\n",
	}, measureScript)
	wantCount(t, fs, 1)
	wantMatch(t, fs[0].Sentence, `SCALEBAR_PX is assigned 2 times`)
	wantLine(t, fs[0], 11)
}

func TestCalibrationSingleSourceIsQuietWhenTheTableIsDefinedOnceAndImported(t *testing.T) {
	fs := run(t, calibrationSingleSource, map[string]string{
		measureScript: calibrationSrc,
		// An import of the name, a continuation line carrying it, and a keyword
		// argument spelled like an assignment — none of them a definition.
		annotateScript: strings.Join([]string{
			`from measure_vessels import (segment, prune, umpp_for,`,
			`                             ARTERY_DIAM_PX, SCALEBAR_PX, SRC)`,
			``,
			`bar = draw_bar(img,`,
			`               UM_PER_BAR=50.0)`,
			`# SCALEBAR_PX = {'fig1': 61}   <- kept as a comment while debugging`,
		}, "\n"),
	}, measureScript, annotateScript, "studies/vascular/docs/WORKING-GUIDE.md")
	wantCount(t, fs, 0)
}
