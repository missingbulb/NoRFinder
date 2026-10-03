## 2026-10-03 · born · the owner asked for a daily ground-truth intake, by code, then an agent run
- **Source:** the owner, in the project thread on the ground-truth workflow: "a daily task that goes
  over all open issues and if there are issues marked with new-ground-truth label - take them, add
  them to the repo … Do all of this in code, not agentic work. After those were added - run the
  agentic part (run on opus5.5)."
- **Reason:** submissions from the page arrive as GitHub issues; nobody should have to copy them into
  the repo by hand, and the finders should be re-tuned whenever the reference improves.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a scheduled task in the local pack: its own precondition term (an open issue wears
  the label), code-work that ingests and re-records the baseline, and an opus agent phase following
  the improve-on-ground-truth skill.
