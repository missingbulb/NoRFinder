## 2026-09-28 · born · a still-open PR let one pack element's provenance grow a `born` entry, a `trigger-changed` entry and four more unentried edits before landing (#212)
- **Source:** conversation log `2026-09-28T0818Z--pr-212--...jsonl`, session 63d205ac. The
  `image-algorithm-development` provenance file picked up a `born` entry, then a `trigger-changed`
  entry after a Fable-subagent rewrite, then four further content edits with no entry at all, across
  one still-open, iterating PR; the owner then had the session wipe the file and write one entry
  covering the whole PR.
- **Reason:** the append-only growth rule (`changing-pack-elements`) reads naturally as "every
  landing change gets its own entry", which is right once a PR has merged but wrong while it is
  still being iterated on — an in-flight PR's own pushes are amendments to one not-yet-landed
  decision, not a sequence of landed ones.
- **Actor:** claudinite-growth/growth-extract (issue #214).
- **Model:** claude-sonnet-5.
- **Mechanism:** a `scope: 'work'` check (`workRules/provenance-once-per-pr.mjs`), `on_fail: 'advise'`
  — the signature (two or more added `## ` entry headers on one provenance file within a branch not
  yet on the default branch) is exactly what the sanctioned `backfilling-provenance` flow also
  produces on purpose, so the check exempts a branch carrying that flow's own PR title
  (`Provenance: backfill <pack>`) and `_declined.md`, where several distinct candidates
  legitimately land together; advisory rather than blocking because a genuinely separate second
  decision landing in one ordinary PR, while rare, is not a defect.
- **Retire when:** `provenance.mjs append` itself refuses or folds a second call naming an element
  whose file already changed within the current branch, making the check's job structural.

## 2026-10-09 · moved · the repo moved off the Node engine, which ran the JavaScript check; cn runs Go checks
- **Reason:** cn runs no JavaScript check, so the rule would have stopped firing silently with the
  move.
- **Actor:** @missingbulb (owner), re-adoption onto cn.
- **Model:** Claude.
- **Mechanism:** the same work-scope advisory check, ported line for line to
  `checks/provenance_once_per_pr.go`; proven to fire on a branch adding two entries and to stay
  silent under a `Provenance: backfill` commit.
