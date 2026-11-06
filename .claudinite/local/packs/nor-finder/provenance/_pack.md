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

## 2026-10-30 · scope-changed · the NoR study's skill and task moved to local/nor-study (#559)
- **Reason:** the owner asked that what is uniquely NoR be independent before a second study lands;
  the repo pack keeps the shell and the repo-wide elements.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
- **Mechanism:** the routing guidance in the manifest, and the RULES header pointing at the study
  pack.
- **Rejected:** a third pack for the shell's one rule (owner's choice, two packs).
- **Landed:** #559

## 2026-11-03 · reworded · env setup force-installs Pillow over a broken system copy
- **Reason:** the routine's environment runs Python 3.11, which imports the image's apt Pillow
  (compiled for 3.12 only, no `_imaging`); pip counts it as installed and skips it, so the probe
  failed and every routine run died in setup.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
- **Rejected:** fixing the environment instead (owner's choice): the next image with the same mix
  breaks the same way.

## 2026-11-05 · scope-changed · env setup also fetches the page tests' Pyodide
- **Reason:** the full set needs Pyodide under web-tests/node_modules, which no setup fetched, so a
  fresh web session could not run it.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
- **Mechanism:** the manifest's env setup and probe.
- **Rejected:** also fetching the ground-truth images at image build (owner's choice): a Drive
  download that can be slow or fail there.
- **Landed:** #779

## 2026-11-05 · scope-changed · githubActions drops dispatchWorkflow
- **Reason:** the full-tests task, its only user, is retired.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
- **Mechanism:** the manifest's `githubActions` grant.
