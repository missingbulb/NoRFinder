import { finding } from '../../../../shared/engine/checks/helpers/findings.mjs';

// A still-open PR let a pack element's provenance file grow a `born` entry, a
// `trigger-changed` entry and four further unentried edits before the owner had
// the session wipe it and write one entry covering the whole PR (nor-finder
// provenance/provenance-once-per-pr.md). The append-only growth rule
// (changing-pack-elements) reads naturally as "every landing change gets its
// own entry" — right once a PR has merged, wrong while it is still iterating:
// an in-flight PR's own pushes are amendments to one not-yet-landed decision,
// not a sequence of landed ones.
//
// `_declined.md` is exempt: a growth run legitimately appends several distinct
// candidates' `declined` entries there in one pass, each a separate candidate
// rather than one candidate's own iteration.
//
// The sanctioned backfilling-provenance flow writes the same shape of diff on
// purpose — a brand-new file's whole history, `born` through its later entries,
// arriving in one pass — so a branch carrying that flow's own PR title
// (backfilling-provenance/SKILL.md step 10, `Provenance: backfill <pack>`) is
// exempt rather than flagged.
const PROVENANCE_FILE = /(^|\/)provenance\/(?!_declined\.md$)[^/]+\.md$/;
const ENTRY_HEADER = /^## \d{4}-\d{2}-\d{2} · /;
const BACKFILL_RUN = /^Provenance: backfill\b/;

const rule = {
  id: 'provenance-once-per-pr',
  on_fail: 'advise',
  since: '2026-09-28',
  scope: 'work',
  description: 'A pack element\'s provenance file gets one entry per still-open PR, not one per push',
  why: 'the append-only growth rule is for landed history; squashing a PR\'s own mid-flight entries into one before merge is what the owner asked for after one local-pack element accumulated two',

  run(work) {
    if (work.onDefaultBranch()) return [];
    if (work.commits.some((m) => BACKFILL_RUN.test(m))) return [];
    const files = (work.changedFiles ?? []).filter((f) => PROVENANCE_FILE.test(f));
    if (!files.length) return [];
    const findings = [];
    for (const file of files) {
      const added = work.addedLines([file]).filter(({ text }) => ENTRY_HEADER.test(text));
      if (added.length < 2) continue;
      findings.push(finding(rule, {
        file,
        line: added[added.length - 1].line,
        what: `this still-open PR adds ${added.length} provenance entries to ${file}`,
        fix: 'squash this PR\'s own entries into one before merging — a still-open PR\'s provenance is one decision in progress, not a landed history yet',
      }));
    }
    return findings;
  },
};

export default rule;
