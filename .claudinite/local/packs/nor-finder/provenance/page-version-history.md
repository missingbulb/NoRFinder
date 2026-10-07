## 2026-10-07 · born · a page change adds its line to the version history (#PR)
- **Source:** the owner, in the project thread: "clicking it would open a "Version history" popup.
  Please implement that and generate a version history document that keeps user-facing terse
  explanations."
- **Reason:** the history is only as complete as the pull requests that feed it; the release
  machinery is vendored and cannot write the lines, so each change must bring its own.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a prose rule in the local pack: whether a change is visible to users is a
  judgment no check can make. Which release carried a line is derived from git by the site build,
  so the rule asks for no version.
- **Landed:** #PR.
