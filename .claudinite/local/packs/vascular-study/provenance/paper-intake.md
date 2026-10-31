## 2026-07-31 · born · Literature intake: six papers digested, references restructured, repeatable intake protocol (#58)
- **Source:** digesting six source papers into self-contained `references/<slug>/` folders.
- **Reason:** so the next article follows the same protocol, and its digest makes the PDF redundant.
  The supplementary-material step: Rust 2020's main text left the binarization method, filter
  radius, particle-size floor and heatmap grid all unstated; its supplementary Data Sheet supplied
  every one, plus the verbatim macro and a µm-calibrated native-resolution image that became the
  project's best input and strongest validation - one download away, without which the digest was
  materially wrong.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the paper-intake skill, body guidelines, reached by its description.
- **Retire when:** reaffirm while a paper's supplementary material keeps surfacing method detail the
  main text omits.
- **Landed:** #58.

## 2026-09-02 · reworded · Migrate vascular-coloring's paper-intake skill onto the references convention (#333)
- **Reason:** the references convention: the three Rust 2020 incident narratives moved to
  `references.md` behind `(n)` markers, each step's act-time instruction kept inline; no meaning
  changed.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #333 (Closes #327).

## 2026-09-21 · strengthened · converted from references.md (paper-intake-2), dated by the conversion
- **Reason:** Rust 2020's entire pipeline specification exists only as pixels in Figure 1C —
  papers put their method in figures, not only in prose.
- **Mechanism:** a step of the paper-intake skill, a workflow
- **Retire when:** Reaffirm while a paper is found to state part of its method only in a figure.

## 2026-09-21 · strengthened · converted from references.md (paper-intake-3), dated by the conversion: "Prefer a same-image comparison to a table comparison."
- **Reason:** Comparing this project's figure-crop output to a published summary table produced a
  confident, wrong conclusion about branch counts; running the authors' own macro on their own image
  corrected it — a number from a summary table may not be the raw output of the method it
  describes.
- **Mechanism:** a step of the paper-intake skill, a workflow
- **Retire when:** Reaffirm while re-running a paper's own method on its own image remains available
  and more reliable than a table comparison.

## 2026-09-27 · weakened · Growth dedup: strip the canon-owned ground-truth clause from a rule bullet (#524)
- **Source:** growth dedup (#524), superseding the stale #372.
- **Reason:** "The pipeline's own output is never ground truth for a new panel set" restated
  research-project's "never against the pipeline's own prior output, which validates nothing"; the
  digest-authorship residue (quote the authors, never present our own run as validation) stayed,
  which the canon doesn't state.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #524.

## 2026-09-27 · trigger-changed · skill-description-length advisory, this update cycle (#527)
- **Reason:** description ran 31 words, past the basics pack's 30-word cap for a skill description;
  cut the method detail (folder, digest, figures, panels, calibration, synthesis) since it belongs
  in the skill body, keeping only the trigger.
- **Mechanism:** SKILL.md frontmatter `description` field.
- **Actor:** claudinite-lifecycle/update task, running as work item #527.

## 2026-10-09 · reworded · the inline-figure example is described, not spelled as link syntax
- **Reason:** cn's selftest reads Markdown link syntax inside a code span as a real link, so the
  example blocked every engine update with a missing-file failure.
- **Actor:** @missingbulb (owner), re-adoption request.
- **Model:** Claude.

## 2026-10-21 · reworded · the verify step runs the pinned cn, not the deleted launcher
- **Reason:** engine update 1.61021.1 deletes the old launcher script, so step 10's checks command no
  longer existed; it now runs `.claudinite/bin/cn`, which the setup package installs.
- **Actor:** @missingbulb (owner), asking to finish the claudinite-ci.yml removal by hand.
- **Model:** Claude.
- **Landed:** #711.

## 2026-10-21 · weakened · Growth dedup: strip two canon-owned clauses from the paper-intake skill (#712)
- **Reason:** "never carry a number over from a neighbouring row" restated research-project's "read off
  the input itself, never infer it from a stated setting or borrow it from a neighbour", and the
  "different papers are never averaged together" bullet restated its "never a mean spanning two
  sources that differ in more than scale … Group the rollup by source"; the repo's own table
  mechanics stayed.
- **Actor:** claudinite/growth-dedup task, running as work item #712.

## 2026-10-31 · moved · from missingbulb/vascularColoring's vascular-coloring pack into vascular-study
- **Source:** the owner: migrate vascularColoring into a new study, its requirements and Claudinite
  pack elements included.
- **Reason:** the study now lives in studies/vascular/; paths rewritten to it, and mentions of
  checks not yet ported dropped.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
- **Mechanism:** unchanged carrier, now in the study's own local pack.
