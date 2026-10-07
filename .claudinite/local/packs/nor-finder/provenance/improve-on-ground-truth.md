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
