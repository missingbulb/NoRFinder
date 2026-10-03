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
