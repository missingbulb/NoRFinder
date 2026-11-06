# nor-finder — this repo's own pack

The home for everything **specific to this repository** and its shell: the rules below, and
beside them the checks, skills and tasks that carry them. Nothing local needs a home invented for
it — this is that home. This file is loaded into every session through the rules index, so what
lands *here* should be a directive an agent can act on, not a description of how something works;
a rule a deterministic check can enforce belongs in this pack's `declared-checks.json` instead,
and a procedure with a nameable trigger in its own `skills/<name>/SKILL.md`.

What is specific to one study belongs in that study's pack (`nor-study` for `studies/nor/`), so a
study can leave without taking a repo rule with it. A lesson that would hold in another repo does
not belong here — propose it to the Claudinite canon instead, where every repo gets it.

## Where the work lives

- **Working from a Claude project (its shared folder, threads and project memory)** — the repo is
  where the work lives; the project is only a tool that helps the repo grow. Commit every piece
  of processing code, every instruction, skill, label set, ledger and the current state
  (each study's `STATE.md`) to the repo, in a PR, as part of the change that produced it and
  not as a later clean-up. The shared folder may hold only temporary processing artifacts:
  renders, caches, contact sheets and other outputs that validate the repo's algorithm and can
  be regenerated from it. Before replying that work is done, check that nothing the next session
  would need exists only in the project. (working-claude-project)

## Production and its tests

- **A test needing the page to behave otherwise than it does on the live site** — change the
  testing surface (a stand-in, a route, a seeded browser key, a shared helper beside the tests),
  never `web/` or a study's `web/`: the production code is written for the live site alone.
  (tests-bend-test-surface)

- **Testing a motion the page makes** (a transition, an animation, a view transition) - check that it is on where
  it should be, that it starts and that it ends in the right state, through `web-tests/page_motions.mjs`; never
  how it looks on the way. (testing-motion-ends)

## The page's controls

- **Placing several indicators on each row of a list** (a size, a date, an age tag, a mark) - put
  the ones every row shows at the row's edges and the optional ones inward, between the name and
  them, so what is always there lines up down the list and a missing one leaves no hole at the
  edge. (row-indicators-edges)

## The page's version history

- **Changing what a user of the NoR Finder page sees** — tell it in a `Version-history:` line of
  one of the pull request's commit messages, at most 20 words a user reads, or
  `Version-history: none`; never in a file the pull requests share. The `writing-version-history`
  skill says how. (page-version-history)

## Ground truth

- **Building or changing a study's ground-truth controls** (what its page shows in a GT or PostGT
  stage) — load the `designing-ground-truth-tasks` skill first: the tasks in the left bar, one
  item at a time, area by area, what is done cut out of the image. (designing-ground-truth-tasks)

## The shell's states

- **Working with `dev/requirements/shell-states.json`, a study's `states.json` grafted into it, or what they generate** — treat it as a development harness
  the owner does not review: never present a case there as approved, and bring each tentative or undecided case,
  and each change to what a state shows, to the owner as a question. (shell-states-unreviewed)

## Merging

- **A small pull request fixing a bug** — merge it yourself, unasked, once its first commit added
  a test that failed on the bug, a later commit fixed the bug, and the same test passed with no
  test file changed after that first commit. Any other pull request waits for the owner.
  (merge-proven-fix)
