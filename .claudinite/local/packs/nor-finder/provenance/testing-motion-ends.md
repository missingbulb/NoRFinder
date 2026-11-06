## 2026-11-06 · born · CI's WebKit stalled view transitions that mid-flight checks then failed on (#796)
- **Source:** the owner on #796: "I don't think we need to have animation motion be tested at all. I
  want to know the animation is enabled and running and finished correctly, not how it looks in the
  process."
- **Reason:** checks of a motion's look on the way raced the motion on loaded runners and failed for
  reasons no user sees.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
- **Mechanism:** prose in the repo's own pack, with the shared recorder beside the tests; a check
  would have to tell a mid-motion assertion from an end-state one.
- **Retire when:** a check catches a test reading a motion's geometry before it ends.
- **Landed:** #796
