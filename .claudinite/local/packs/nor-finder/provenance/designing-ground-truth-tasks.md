## 2026-11-03 · born · how a study's page lets a person make ground truth (#720)
- **Source:** the owner, building NoR's tasks: "take my initial instructions on what the rationale
  of tasks and how we want to build this UI … a skill to be used when creating GT creation
  controls."
- **Reason:** NoR's GT redesign set the owner's rationale (a to-do list, one item at a time, area by
  area, progress cut out of the image, a lean box); every other study's GT controls should start
  from it rather than re-derive it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5.5
- **Mechanism:** a guidelines skill picked by its description, with a RULES.md line pointing at it,
  since GT controls are built in study panels no single file-edit path predicts.
- **Retire when:** the shell owns the ground-truth tasks UI itself, so studies only declare their
  tasks.
- **Landed:** #720

## 2026-11-04 · reworded · the reveal picture is a link, fetched from its own host
- **Source:** the owner: "Dog photo link should be set in the study.json file and fetched, not
  served by us."
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5.5
