# product-wiki pack

The self-growing product research wiki standard: a repo keeps its
market/user/competitor research as agent-maintained wikis under `product-wiki/` -
compile findings once, refine in place, cite everything - walled off from the code
so nothing can silently depend on unreviewed research, with one human-reviewed
crossing point. Declared by the
project, never suggested from its shape. Takes **no config**: the layout is the
standard.

## The standard

- `product-wiki/` at the repo root. Two reserved children with fixed meaning:
  **`product-wiki/product-requirements/`** — the human-reviewed distillation of the
  wikis into product requirements, the **only** `product-wiki/` content the rest of
  the repo may reference, never auto-grown — and **`product-wiki/sample-data/`** —
  small illustrative assets a wiki claim points to (never test fixtures).
- **Everything else under `product-wiki/` is wiki space** — any names, any nesting.
  A wiki page is a `README.md` at depth ≥ 2 under `product-wiki/` outside the two
  reserved subtrees. The folder is the classifier; there is no wikis manifest
  to drift, and a renamed wiki folder is still a wiki folder — still checked,
  still barred.
- Every wiki page **opens with `## Key insights`** — up to seven bullets, one
  terse plain-words line each, carrying what the research found, ahead of every
  other section. The body is the research record; the header is what makes it
  readable, so a human who reads only the header understands what was researched
  and what came of it.
- Every wiki page also carries `## Sources` (every source bullet carrying its
  real URL), `## Growth log` (dated bullets, newest change appended per pass),
  and `## Open questions` (the research backlog the growth passes work from).
- Growth is scheduled research: the pack's weekly scheduled task
  ([tasks/wiki-growth/task.md](tasks/wiki-growth/task.md)) reads
  the wikis, researches what their own open questions flag, writes back cited,
  and delivers an unmerged PR. Most passes correctly change nothing.

## Rules (`RULES.md`)

Two rules, for the sessions that only read the wiki:

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Working on a requirement or spec | high | correctness | prose: <50 words |
| Building on `product-wiki/` elsewhere | critical | correctness | prose: <50 words + check (`product-wiki-isolation`) |

Everything about *editing* a page — the `## Key insights` header, citation, correction without
deletion, the growth log, sample-data, the no-fabricated-growth stop — is the
[`writing-wiki-pages`](skills/writing-wiki-pages/SKILL.md) skill, forced for `product-wiki/**` by
its own `force-load-on-file-edits-paths`: the PreToolUse guard holds a file tool aimed there until the
session has loaded it, and the `skill-loaded-before-editing` work rule catches an edit made
another way. The weekly task loads it by name.

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `product-wiki-layout` | high | correctness | check: blocking |
| `product-wiki-page-sections` | medium | complexity | check: blocking |
| `product-wiki-key-insights` | medium | complexity | check: blocking |
| `product-wiki-growth-log` | medium | correctness | check: blocking |
| `product-wiki-sources` | high | correctness | check: blocking |
| `product-wiki-freshness` | medium | correctness | check: advisory |
| `product-wiki-isolation` | critical | correctness | check: blocking (fixed barrier) |

`product-wiki-key-insights` enforces the header's **shape** — it leads every other
section, it is bullets only, it carries at least one and at most seven, and no
bullet runs past **140 characters**, about one line (a bullet's indented
continuation lines count as part of it, so hard-wrapping is free).
*Which* insights lead, how plainly they are worded, and keeping them true as
research moves is judgment — that lives in RULES.md and the growth worker, and
no check can score it. The missing heading itself is
`product-wiki-page-sections`' finding, never double-reported.

`product-wiki-freshness` is advisory: it fires per page after 45 days without a
growth-log entry, the in-repo observer for a growth channel that has stopped
firing. Silence it with `rules: {"product-wiki-freshness": "off"}`.

## Skill

| Skill | Trigger |
|---|---|
| [`writing-wiki-pages`](skills/writing-wiki-pages/SKILL.md) | any edit under `product-wiki/` — held by the guard until loaded |
| [`explore-link`](skills/explore-link/SKILL.md) | the owner hands over a URL (`/explore-link <url>`) — mine it for product, market, usage and pricing insights and fold them into an existing wiki page |

The two growth lanes differ only in who chooses the source: the weekly task picks
its own from the pages' open questions, the skill is given one.

## Scaffold template

```
product-wiki/
  README.md                        # index: what lives here, why it's walled off
  product-requirements/README.md   # the human-reviewed sink (required)
  <YourWiki>/README.md             # one folder per wiki — seeded like this:
```

```markdown
# <YourWiki>

What this wiki tracks, in a sentence or two.

## Key insights

- The non-obvious thing this research found, in one plain line.
- ...up to seven; short beats clever, no citations, no hedges.

## <Your content sections>

## Sources

- [Title](https://real.url/)

## Open questions

- What should the next growth pass look into?

## Growth log

- **YYYY-MM-DD** — initial seed.
```

## Excusing a deliberate crossing (accept, not except)

`product-wiki-isolation` is a **fixed** barrier — its edges are pack code, so a
consumer cannot add the barrier mechanism's per-rule `except` entries to it. Each
crossing finding's own fix text says so and names the lever that works: a
top-level (or pack-entry) **accept**:

```json
"accept": [
  { "rule": "product-wiki-isolation", "path": "docs/inventory.md",
    "reason": "historical ledger — enumerates the wikis it catalogs" }
]
```

Matched by rule id + exact path (or a `dir/` prefix for a subtree); the reason
is mandatory. Unlike a barrier rule's own `except`, accepts are **not**
staleness-audited — prune one by hand when the crossing it excused is gone.

## Bootstrap ordering

Declaring the pack before scaffolding `product-wiki/` yields two `layout` findings
plus the barrier's fail-closed empty-glob finding — three blocking arrows all
pointing at the same two-file scaffold. That is deliberate: a declaration is a
statement of intent, unlike an unconfigured barrier graph's no-op (where
config absence means "nothing declared").

## Known gaps

- **User research has no first-party evidence channel.** The pack's market and competitor halves
  cite public URLs; its user half has no in-repo home for interviews, tickets or call notes, so a
  user-research page is sourced from public proxies — review sites, forum threads, competitors'
  testimonials — which satisfies every check while describing other people's customers. The
  remedy is honest labelling, in [`writing-wiki-pages`](skills/writing-wiki-pages/SKILL.md).

- The barrier engine never scans `*.test.mjs`/test files as sources, so a test
  importing from wiki space is invisible to `product-wiki-isolation` — covered
  by prose (nothing a test asserts against belongs under `product-wiki/`), not
  fought in code.
- Accepts against `product-wiki-isolation` are pruned by hand (no staleness
  audit — see above).
- The weekly growth task rides the repo's own scheduler
  (the engine's `writing-tasks` skill);
  a repo without a `taskScheduler` anchor gets no unattended growth — the freshness
  advisory is the backstop that surfaces that, and the owner phrase "grow the
  product wiki" runs the same worker method in-session.
