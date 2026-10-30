## 2026-09-28 · born · the repo is where the work lives; a Claude project holds only temporary artifacts (#221)
- **Source:** the owner, in the project thread: "Don't ever keep things only in project folders
  except processing artifacts… The project is just a tool to help the repo grow, never the
  objective."
- **Reason:** three days of NoR detection work (finders, lab, labels, skill, ledger) lived only in
  the project's shared folder, and a fresh session from the repo could not see any of it.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a prose rule in the local pack. This is the owner's process change, and no
  deterministic check can tell a project folder's code from its artifacts. It is a candidate for the
  canon, since it holds in any repo worked from a Claude project.
- **Landed:** #221.

## 2026-10-11 · scope-changed · the NoR study moved under studies/nor/
- **Reason:** the repo now holds one page and several studies; the paths this element names moved
  with the NoR study.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the same carrier, its paths repointed.

## 2026-10-30 · scope-changed · names each study's STATE.md, not the NoR one (#559)
- **Reason:** the rule is repo-wide; NoR's path made it read as the NoR study's.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
- **Mechanism:** the same carrier.
- **Landed:** #559
