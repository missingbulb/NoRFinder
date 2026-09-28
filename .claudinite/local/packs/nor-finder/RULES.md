# nor-finder — this repo's own pack

The home for everything **specific to this repository**: the rules below, and beside them the
checks, skills and tasks that carry them. Nothing local needs a home invented for it — this is
that home. This file is loaded into every session through the rules index, so what lands *here*
should be a directive an agent can act on, not a description of how something works; a rule a
deterministic check can enforce belongs in this pack's `declared-checks.json` instead, and a
procedure with a nameable trigger in its own `skills/<name>/SKILL.md`.

A lesson that would hold in another repo does not belong here — propose it to the Claudinite
canon instead, where every repo gets it.

## Where the work lives

- **Working from a Claude project (its shared folder, threads and project memory)** — the repo is
  where the work lives; the project is only a tool that helps the repo grow. Commit every piece
  of processing code, every instruction, skill, label set, ledger and the current state
  (`detection/STATE.md`) to the repo, in a PR, as part of the change that produced it and not
  as a later clean-up. The shared folder may hold only temporary processing artifacts: renders,
  caches, contact sheets and other outputs that validate the repo's algorithm and can be
  regenerated from it. Before replying that work is done, check that nothing the next session
  would need exists only in the project. (working-claude-project)
