# wiki-growth worker

One compile-once/refine-in-place research pass over the repo's product wikis (the Karpathy LLM-wiki pattern):
read what the wiki already knows, research only what its own backlog flags, write it back cited. **Most runs
find little or nothing — no new citable material means no branch, no PR, and that is the documented good
outcome.** A padded or fabricated update is worse than none.

GitHub access is the session's **GitHub MCP tools** (`mcp__github__*`) — never `gh`/`curl`/a clone.
"Default branch" below means the repo's actual default branch. The wiki set is derived **structurally**: every `README.md` at depth ≥ 2 under
`product-wiki/`, excluding the `product-wiki/product-requirements/` and `product-wiki/sample-data/` subtrees.

There is no preflight: whether this run happens was decided by the task's **precondition** (it declines on a
repo that saw no activity in the window), so by the time you read this the round is granted. Your job is
the research.

## Method

1. **Read every wiki page end to end** (`get_file_contents`), the `## Open questions` and `## Growth log`
   sections first-class. Never re-derive a claim that is already cited and current.
2. **Pick the one or two open questions** across the set most worth this run; also spot-check one or two
   existing citations for staleness (a dead link, a superseded stat). If the Context flagged a product-wiki
   change in the window, spot-check the pages it may have superseded.
3. **Research.** *Web mode* (WebSearch/WebFetch available): the open web. *Repo-derived mode* (web tools
   absent — do not fail, do not fake): citable repo-native signal only — new feature-request/extractor-request
   issues, merged PRs, issue/PR discussion carrying user-side signal — each citable to its own GitHub URL.
4. **Load the [writing-wiki-pages](../../skills/writing-wiki-pages/SKILL.md) skill** (Skill tool, skill: `writing-wiki-pages`) — the guard holds every edit under `product-wiki/` until it is loaded — then **write into the relevant wiki page(s) only**, per that skill: cite every claim in that page's
   `## Sources`; correct a wrong or superseded claim with a note of why, never a silent deletion; touch
   `product-wiki/sample-data/` only when a new claim needs an illustrative example; **never write
   `product-wiki/product-requirements/`** — a finding that should move a requirement gets a growth-log note
   (and a repo issue) and waits for a human.
5. **Reconcile the page's `## Key insights` header** with what the body now says. It leads the page, it is
   bullets only, and it is capped (seven bullets, 140 characters each — about one line) — so a new insight
   that belongs at the top usually displaces a weaker one rather than being appended. Each bullet is one
   finding in plain words: no qualifying clause, no citation, no hedge, and preferably something a reader
   who knows the field would *not* already assume. Judging obviousness is hard, so when in doubt keep the
   line rather than agonising — short and slightly obvious beats long and careful. Rewrite a bullet the run
   superseded (the correction and its *why* live in the body, not in the header); leave the header alone
   when the run changed nothing about the page's top-line understanding. **Never restate the header as a
   table of contents** — each bullet is a finding a reader can act on.
6. **One dated `## Growth log` entry per touched page** (`- **YYYY-MM-DD** — what changed`).
7. **Update `## Open questions` both directions** — remove what this run answered, add what its research
   surfaced.

## Stop condition

Neither mode yields citable material → stop. No commit, no log entry, no PR.

## Delivery

Commits touching only `product-wiki/**` minus `product-requirements/`, on the branch your item names
(`Target-branch:`), pushed onto `Target-pr:` where one is named — the round then joins the review already
pending — and otherwise one **PR opened on that branch — never a push to the default branch directly**.
Never search for an open pull request or pick a branch of your own.
Then deliver it as your instructions say for a pull request. PR body: the question(s)
researched, what changed where, the citations added, and the open questions left for the next run.

## Tracking

The wiki's own git history is the record: every pass that grew it left a PR, and what changed is in the diff.
Keep no standing issue.

A pass that was **blocked** still needs to be visible — that is the human-facing convergence of a failed
unattended run — so say so in the run's own outcome (`blocked: <why>`), where the queue surfaces it. Clean
no-ops stay silent; the pack's freshness advisory is the prolonged-silence observer.

Reading a wiki, judging which of its open questions is worth this run, and telling a citable finding from
a plausible one is the heaviest judgment in the task set — weigh each accordingly.

## What this worker must never do

Edit `product-wiki/product-requirements/`; edit anything outside `product-wiki/`; create new wiki folders
(automation refines existing pages — a human creates a wiki deliberately); write an uncited claim; delete a
claim without a superseded note; leave a `## Key insights` header asserting what the body it heads no longer
says; pad a growth log, a header, or a wiki page to look productive; merge or approve its own
PR; schedule anything (no cron, no `schedule:` workflow); touch the shared canon.
