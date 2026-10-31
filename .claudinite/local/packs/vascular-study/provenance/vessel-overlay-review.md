## 2026-07-27 · born · Claudinite growth: discover local pack vascular-coloring (#23)
- **Source:** `analysis/WORKING-GUIDE.md`'s visual-assertion workflow and the overlay style
  `analysis/annotate_overlays.py` carries.
- **Reason:** the owner reacts to pictures with claims attached, not to metric tables, so a pipeline
  change is shown as an overlay before its numbers are quoted.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the vessel-overlay-review skill, body guidelines, reached by its description - a
  procedure with a nameable trigger (proposing, revising or reporting on the pipeline), too long for
  a rule.
- **Landed:** #23.

## 2026-07-29 · reworded · Growth dedup: strip one canon-owned clause from vessel-overlay-review (#43)
- **Source:** growth dedup (#18).
- **Reason:** step 4's "quote metrics after the picture" was research-project's own rule verbatim;
  the length-density / area % residue is this repo's narrower case and stayed.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #43.

## 2026-07-29 · reworded · Prose to checks: calibration-single-source, render-outputs-gitignored (#44)
- **Reason:** the regenerate step now names each render check's half - `render-outputs-gitignored`
  keeps the directories ignored, `rendered-overlays-untracked` catches a PNG committed anyway.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #44.

## 2026-07-31 · reworded · Literature intake: six papers digested, references restructured, repeatable intake protocol (#58)
- **Reason:** the expected-results path followed the `references/` restructure.
- **Actor:** @missingbulb (owner).
- **Landed:** #58.

## 2026-08-16 · reworded · Claudinite growth: dedup local packs (#128)
- **Source:** growth dedup (#18).
- **Reason:** "a review that only shows the good fields is not a review" carried no local content
  once research-project gained "show where the method breaks"; the overlay palette specifics stayed
  as local residue.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #128.

## 2026-09-27 · weakened · Growth dedup: strip the canon-owned self-validation clause (#524)
- **Source:** growth dedup (#524), superseding the stale #372.
- **Reason:** the trailing "never against the pipeline's own previous output" restated
  research-project's ground-truth rule verbatim; the instruction to compare against
  `expected-results.md` is this repo's own residue and stayed.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #524.

## 2026-09-27 · trigger-changed · skill-description-length advisory, this update cycle (#527)
- **Reason:** description ran 37 words, past the basics pack's 30-word cap for a skill description;
  trimmed the method clause ("Show a vessel-extraction result as an annotated overlay on the
  original panel and state explicit visual assertions about it" shortened) while keeping the trigger
  intact.
- **Mechanism:** SKILL.md frontmatter `description` field.
- **Actor:** claudinite-lifecycle/update task, running as work item #527.

## 2026-10-31 · moved · from missingbulb/vascularColoring's vascular-coloring pack into vascular-study
- **Source:** the owner: migrate vascularColoring into a new study, its requirements and Claudinite
  pack elements included.
- **Reason:** the study now lives in studies/vascular/; paths rewritten to it, and mentions of
  checks not yet ported dropped.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
- **Mechanism:** unchanged carrier, now in the study's own local pack.
