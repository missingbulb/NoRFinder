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

## 2026-11-04 · reworded · the tasks are one walk area by area, with Back; the Show menu stays, task-named (#739)
- **Source:** the owner on the NoR page: separate passes left the image scattered and never finished
  region by region; "we need a way to go back"; the display options belong on the image, aligned to
  the tagging actions; the mask stays where the summary is; rejected candidates need the finalists'
  adjusters.
- **Reason:** "No Go back" and per-task ordering were wrong guidance for every study that follows.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5.5
- **Landed:** #739

## 2026-11-05 · reworded · the NoR reference build's requirements moved to studies/nor/requirements.md
- **Reason:** the path it named no longer holds req/nor (req/checks/spec-layout).
- **Actor:** @missingbulb (owner).

## 2026-11-07 · reworded · tagging starts and stops by hand
- **Reason:** jumping into the first task as the algorithm finished was wonky; entering tagging is
  explicit, for every study.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5.5
- **Source:** the owner, on the vascular GT process: "entering GT tagging mode should be explicit.
  Obviously I'm saying things relevant to the shell and all studies"; "There should be a 'Stop
  tagging' button".
- **Landed:** #859
