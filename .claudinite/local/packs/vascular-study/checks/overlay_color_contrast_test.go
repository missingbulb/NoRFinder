package checks

import (
	"strings"
	"testing"
)

const overlayScript = "studies/vascular/analysis/annotate_overlays.py"

func TestOverlayColorContrastFiresOnARedOverlayColour(t *testing.T) {
	fs := run(t, overlayColorContrast, map[string]string{
		overlayScript: "CAP_COL, ART_COL = (0, 200, 255), (255, 60, 30)\n",
	})
	wantCount(t, fs, 1)
	wantLine(t, fs[0], 1)
	wantMatch(t, fs[0].Sentence, `red-dominant`)
}

func TestOverlayColorContrastIsQuietOnTheAgreedPalette(t *testing.T) {
	fs := run(t, overlayColorContrast, map[string]string{
		overlayScript: strings.Join([]string{
			"# an example artery gets a red arrow  <- prose, not a drawn colour",
			"CAP_COL, ART_COL, JUN_COL = (0, 200, 255), (40, 235, 90), (255, 0, 255)",
			"label = (255, 235, 60)",
			"white = (255, 255, 255)",
		}, "\n"),
	})
	wantCount(t, fs, 0)
}
