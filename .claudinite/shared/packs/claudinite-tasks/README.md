# claudinite-tasks — scheduled work

Everything whose subject is task work: the work-item queue, the executor, the task contract and
its signals, calendar/anchor math, run records, code-work, and the delivery lane a task's output
lands through. Declaring this pack is what gives a repo scheduled work; a repo that does not
declare it runs none, which is a supported state rather than a degraded one.

The mechanism itself, from the state machine and the generator to the executor's protocol,
urgency, forcing and recovery, is stated as claims in the engine's `tasks/doc.go`, each citing the
Go test that proves it; authoring a task is the `writing-tasks` skill's subject. This file is the pack's own map.

## Layout

The task runner itself — the task contract and its validation, the precondition and merge-policy
grammars, the work-item queue on GitHub issues, the scheduler run, the executor, the landing lane,
repair and continuation, the routine and delivery procedures a session follows, the declared
checks below and the two workflow files — is the engine's: `cn schedule …`, `cn execute …`,
`cn work …` and `cn tasks …`. `cn hook session-start` writes the routine procedure, the pull-request
delivery included, to `.claudinite/cache/instructions.md` wherever this pack is declared.
The request lane's own task, `implement-request`, is the task-flow pack's. This pack is what a
repo declares to turn it on, and what the engine reads from it:

| Path | What it holds |
|---|---|
| `merge-rules.json` | the pack's declared merge rules, which a task's `automerge` may name |
| `tasks/` | this pack's own task, `usage-fold` (what the repo's sessions did, and what the machinery itself cost - runs, billed minutes, API calls, outcomes, parks, latencies), a `@claudinite/sdk` worker carrying its own copy of the queue vocabulary it reads |
| `test/tasks/` | the task's unit tests, run against the SDK stand-in in `tools/test/` |
| `docs/PRINCIPLES.md` | the mechanism's design record; its claims, each with its test, are the engine's `tasks/doc.go` |

The pack publishes no modules; a worker reaches the queue, git and GitHub through `@claudinite/sdk`.

## Adoption

The two workflow files and the routine endpoints cannot converge into place — `.github/workflows/`
is the one directory a member's nightly update may never write — so they are written once, at
adoption, from the engine's templates; `cn workflows diff` prints the patch that brings a member's
copies to its engine version's.

## Checks

| Rule | Confidence | Dimension | Enforcement |
|---|---|---|---|
| `task-declaration-shape` | high | correctness | cn built-in: blocking |
| `task-code-work-env` | high | correctness | cn built-in: blocking |
| `automerge-policy-scope` | high | correctness | cn built-in: blocking |
| `executor-workflow-secrets` | high | correctness | cn built-in: advisory |
| `tasks-pack-read-through-its-surface` | high | correctness | cn built-in (declared): blocking |
| `repo-variables-through-the-bag` | high | correctness | cn built-in (declared): blocking |
| `issue-label-outside-the-queue-vocabulary` | high | correctness | cn built-in (declared): blocking |
| `queue-mark-named-literally` | high | correctness | cn built-in (declared): blocking |

`tasks-pack-read-through-its-surface` is this pack's, not the canon's, because the consumers that
can get it wrong are members: it scans a repo's own `packs/` **and** its `.claudinite/local/packs/`,
the tree no converge may rewrite, so a deep import written there is caught in that repo's own run
rather than when it crashes.

`repo-variables-through-the-bag` — a module reads a repository variable over the REST variables
API, which the Actions `GITHUB_TOKEN` is refused on in every member (403, and no `permissions:` key
grants it), so the read never answers. Every repository variable already travels in the executor's
vars bag (`CLAUDINITE_VARS`): a task's code-work finds it in `process.env`.

The first two are relevance-first — inert until the repo carries a `tasks/<name>/task.json` of its own; the third is self-gating on the branch's own arming trailer.

- `task-declaration-shape` — a task declaration the scheduler reads is incomplete or illegal — no `trigger` saying who mints an occurrence, an unknown condition, an illegal value — so the task never fires or fires wrong.
- `task-code-work-env` — a task reads a `CLAUDINITE_*` variable code-work never sets, so a parameter (a scope filter, a dry-run switch) silently never arrives and the run goes green in its most dangerous mode.
- `executor-workflow-secrets` — the executor workflow does not pass a secret the tasks of this repo's packs declare, so the queue picks the item up and only the run finds out the secret is not there. The list is the tasks' alone; an invocation endpoint's `tokenSecret` is config, written with the workflows and reported by the invocation call itself. Advisory because the remedy is a human-merged PR to `.github/workflows/`, the one fix a member's own machinery cannot make.
- `issue-label-outside-the-queue-vocabulary`: an `issue_write` call files work for the queue under a label no scheduler run, executor or janitor reads - a label outside the `task:` namespace beside a `task:` mark, or one named for a queue (`claudinite-queue`, `conformance-backlog`) in place of the mark. `task:origin:ad-hoc` asks the queue for the work. Any other label is the project's own and passes: a project's tasks read their own labels, and `issue_write` replaces the whole list, so swapping one on the project's own issue must stay possible.
- `queue-mark-named-literally`: a pack's prose tells a session to mark an issue for the queue, or to tag a backlog issue, without naming the label; naming `task:origin:ad-hoc` on the line satisfies it.
- `automerge-policy-scope` — a branch that stamped the `Claudinite-Automerge-Policy` trailer (its run intends to land its own PR) carries a diff its declared policy does not cover, which is exactly the unreviewed change the policy exists to stop.
