package checks

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"claudinite.com/checksdk"
)

// The presentation overlay script — the one whose output the owner looks at.
// The 3-panel debug view in measure_vessels.py is deliberately NOT in scope: it
// dims the original and uses red for arteries, which is fine for a QA render and
// wrong for the presentation figure.
const presentationScript = "studies/vascular/analysis/annotate_overlays.py"

// An (r, g, b) or (r, g, b, a) literal — the only way a drawn colour is spelled
// in this script (PIL fill=/np.array colours).
var colourTuple = regexp.MustCompile(`\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*\d{1,3}\s*)?\)`)

// Red-dominant = bright red channel that clearly beats BOTH others. Magenta
// (255, 0, 255) and the yellow label colour (255, 235, 60) stay legal: they read
// against the red signal because blue resp. green carries them.
const redMargin = 60

func isRedDominant(r, g, b int) bool { return r >= 128 && r-g >= redMargin && r-b >= redMargin }

func init() {
	checksdk.Register(checksdk.Check{
		ID:     "overlay-color-contrast",
		Tags:   []string{"world"},
		OnFail: "block",
		Since:  "2026-07-27",
		Doc:    ".claudinite/local/packs/vascular-study/RULES.md",
		Why:    "the gP-CD31 signal being measured IS red — a red outline, arrow or ring vanishes on the very vessels it is supposed to mark",
		Run:    overlayColorContrast,
	})
}

func overlayColorContrast(repo checksdk.Repo) []checksdk.Finding {
	text, ok := repo.Read(presentationScript)
	if !ok {
		return nil
	}
	var out []checksdk.Finding
	for i, line := range strings.Split(text, "\n") {
		// A comment or a docstring line describes a colour, it doesn't draw one.
		if strings.HasPrefix(trim(line), "#") {
			continue
		}
		for _, m := range colourTuple.FindAllStringSubmatch(line, -1) {
			r, _ := strconv.Atoi(m[1])
			g, _ := strconv.Atoi(m[2])
			b, _ := strconv.Atoi(m[3])
			if !isRedDominant(r, g, b) {
				continue
			}
			out = append(out, checksdk.Finding{
				Path:     presentationScript,
				Line:     i + 1,
				Sentence: fmt.Sprintf("overlay colour (%d, %d, %d) is red-dominant", r, g, b),
				Fix:      "pick a colour that contrasts with the red channel — cyan for capillaries, green for arteries, magenta for junctions, yellow for labels (see the pack RULES.md)",
			})
		}
	}
	return out
}
