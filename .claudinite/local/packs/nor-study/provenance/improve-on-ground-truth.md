## 2026-10-03 · born · the owner asked for an agentic improvement run on new ground truth
- **Source:** the owner, in the project thread on the ground-truth workflow: after the daily intake
  adds submitted ground truth, "run the agentic part … a skill for improving the algorithms on new
  ground truth data", which re-runs all finders on all ground truth to see how they changed, focuses
  on candidate detection for newly marked missed candidates, and then overall quality.
- **Reason:** the intake task's agent needs a stated order of work that keeps the quality lock and the
  ledger discipline, so an unattended run improves the finders without trading away what the owner
  accepted.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a workflow skill in the local pack, loaded by the ground-truth-intake task's agent
  and by its description when someone asks for the same work.

## 2026-10-06 · strengthened · the improvement run also commits and reads the finder metrics
- **Source:** the owner, in the project chat: "We'll need to start maintaining per-algorithm quality
  metrics … overall numbers for precision and recall based on the ground truth images" (R11).
- **Reason:** the quality baseline rewrite now regenerates `detection/lab/finder_metrics.json`, so a
  run that records gains must commit it, and its precision and recall per preset are the overall
  view of how each finder moved.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** two sentences in the skill's "See what moved" and "Land it" steps.

## 2026-10-11 · scope-changed · the NoR study moved under studies/nor/
- **Reason:** the repo now holds one page and several studies; the paths this element names moved
  with the NoR study.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the same carrier, its paths repointed.

## 2026-10-30 · moved · from nor-finder to the NoR study's own pack (#559)
- **Reason:** a second study is coming; what only the NoR study needs leaves with it.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
- **Mechanism:** the same carrier in local/nor-study; the repo pack's shared helper and skill are
  reached by relative path, so the study depends on the repo pack and never the reverse.
- **Rejected:** copying the GitHub helper into the study pack, which would need a drift guard.
- **Landed:** #559

## 2026-10-30 · trigger-changed · loads only when work touches studies/nor/ (#566)
- **Reason:** the owner wants NoR-only guidance out of sessions that never touch the study.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
- **Mechanism:** Claude Code's `paths` frontmatter, `studies/nor/**`; the intake task links the file
  directly, so it still reads it.
- **Landed:** #566

## 2026-10-30 · reworded · the metrics file's path follows its move to web/ (#572)
- **Reason:** finder_metrics.json moved into the study's published page part.
- **Landed:** #572

## 2026-11-04 · reworded · the generic order of work is now refitting-on-new-ground-truth's
- **Reason:** this skill fills that order in with NoR's commands.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5

## 2026-11-04 · reworded · each step is now the generic skill's step of the same number, with NoR's commands
- **Reason:** a review of the skill against Anthropic's skill best practices, the house style and
  the code found missing invocations, rules owned twice and hand-offs the family lacked; applied.
- **Actor:** @missingbulb (owner), who asked for the review.
- **Model:** claude-opus-5-5

## 2026-11-05 · trigger-changed · new ground truth is curated on Drive, not added to the repo (#783)
- **Reason:** the lab's ground truth now lives in the study's curated Drive folder; a change shows
  as a new dataset SHA.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the same skill, its description naming the curated folder and the dataset SHA.
- **Landed:** #783
