## 2026-09-04 · born · seeded empty by the adoption (#2)
- **Source:** the adopt-claudinite bootstrap, which gives every member one local pack named for the
  repo.
- **Reason:** a home for everything specific to this repository, so no local lesson has to invent
  one; seeded with no rules, checks, skills or tasks, everything in it the repo's own to write.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the pack manifest, no detect and no marker - a local pack is declared by existing,
  not fingerprinted.
- **Landed:** Closes #1 · #2 · pack version 1.

## 2026-09-28 · moved · renamed from no-rfinder, a mis-split of the repo name
- **Reason:** the bootstrap derived the id from `NoRFinder` as `no-rfinder`; the name reads as
  NoR-Finder.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the directory name, which is the pack id by convention, and its `local/`
  declaration.

## 2026-09-30 · reworded · dropped the retired detect and marker fields
- **Reason:** nothing reads them and the legacy-shape advisory fired; a local pack is declared by
  hand.
- **Actor:** Claudinite update task, work item #272.
- **Model:** Claude, per the commit trailer.
- **Mechanism:** deleted the two null lines from the pack manifest.
- **Landed:** PR #275.
