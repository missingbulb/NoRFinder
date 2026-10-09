package checks

import (
	"fmt"
	"regexp"
	"slices"

	"claudinite.com/checksdk"
)

// A still-open PR let a pack element's provenance file grow a `born` entry, a
// `trigger-changed` entry and four further unentried edits before the owner had
// the session wipe it and write one entry covering the whole PR (nor-finder
// provenance/provenance-once-per-pr.md). The append-only growth rule
// (changing-pack-elements) reads naturally as "every landing change gets its
// own entry": right once a PR has merged, wrong while it is still iterating,
// since an in-flight PR's own pushes are amendments to one not-yet-landed
// decision, not a sequence of landed ones.
//
// `_declined.md` is exempt: a growth run legitimately appends several distinct
// candidates' `declined` entries there in one pass. A backfilling-provenance
// run, whose PR title is `Provenance: backfill <pack>`, writes a new file's
// whole history in one pass on purpose, so its branch is exempt too.
var (
	provenanceFile = regexp.MustCompile(`(^|/)provenance/[^/]+\.md$`)
	declinedFile   = regexp.MustCompile(`(^|/)provenance/_declined\.md$`)
	entryHeader    = regexp.MustCompile(`^## \d{4}-\d{2}-\d{2} · `)
	backfillRun    = regexp.MustCompile(`^Provenance: backfill\b`)
)

func init() {
	checksdk.Register(checksdk.Check{
		ID:     "provenance-once-per-pr",
		Tags:   []string{"work"},
		OnFail: "advise",
		Since:  "2026-09-28",
		Doc:    ".claudinite/local/packs/nor-finder/provenance/provenance-once-per-pr.md",
		Why:    "the append-only growth rule is for landed history; squashing a PR's own mid-flight entries into one before merge is what the owner asked for after one local-pack element accumulated two",
		Run:    provenanceOncePerPR,
	})
}

func provenanceOncePerPR(repo checksdk.Repo) []checksdk.Finding {
	if repo.OnDefaultBranch() || slices.ContainsFunc(repo.CommitMessages(), backfillRun.MatchString) {
		return nil
	}
	var out []checksdk.Finding
	for _, f := range repo.ChangedFiles() {
		if !provenanceFile.MatchString(f) || declinedFile.MatchString(f) {
			continue
		}
		var added []checksdk.Line
		for _, l := range repo.AddedLines([]string{f}) {
			if entryHeader.MatchString(l.Text) {
				added = append(added, l)
			}
		}
		if len(added) < 2 {
			continue
		}
		out = append(out, checksdk.Finding{
			Path:     f,
			Line:     added[len(added)-1].Line,
			Sentence: fmt.Sprintf("this still-open PR adds %d provenance entries to %s", len(added), f),
			Fix:      "squash this PR's own entries into one before merging: a still-open PR's provenance is one decision in progress, not a landed history yet",
		})
	}
	return out
}
