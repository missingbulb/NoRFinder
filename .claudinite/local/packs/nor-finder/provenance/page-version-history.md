## 2026-10-07 · born · a page change adds its line to the version history (#369)
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
- **Landed:** #369.

## 2026-11-03 · reworded · a change rewrites the Next release story instead of adding a line (#701)
- **Source:** the owner: "add blocks of general descriptions of what happened in a version, and not
  breaking down each and every feature … no more than 3 paragraphs of 60 words under \"next
  version\"."
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5.5
- **Landed:** #701

## 2026-11-04 · reworded · each pull request tells its change in its own commit line, no shared file
- **Source:** the owner: "we cannot have all changes write to the same file. This is terrible." and
  "Not blocking is much more important" than the three-paragraph limit.
- **Reason:** every page change edited one file, so every open pull request conflicted with every
  other.
- **Mechanism:** a prose rule, now backed by the Tests workflow's version-history job, which fails a
  pull request changing `web/` or a study's `web/` without the line.
- **Rejected:** a fragment file per pull request (still a commit of files only to be folded away);
  the line in the PR description (needs the squash default switched, and main's commit bodies would
  lose the per-commit messages).
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5.5
