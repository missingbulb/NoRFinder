# github-pages pack

Serving a site from GitHub Pages: the nightly `site-release` task that deploys the default branch (advancing the version first where public-website is declared), the **one vendored workflow** in [`stubs/`](stubs/) that performs the deploy, materialized into each site repo's own `.github/`, `.github/site.config` naming what is published, the in-session rules in [RULES.md](RULES.md), and the two checks beside them. **Opt-in**: a project declares it when its site is served from Pages. The contract and its setup are [the **github-pages-pipeline** skill](skills/github-pages-pipeline/SKILL.md).

Fingerprint: `.github/site.config`, the pack's own central artifact. It only *suspects* the pack; declaring is the project's call.

## What this pack does not own

The version. [public-website](../public-website/README.md) owns the scheme and the page stamp, and the release reaches that pack's `public/version.mjs` to advance it when the pack is declared; a repo that declares only this one is deployed unversioned.

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `gp/site-config` | high | correctness | check: blocking |
| `gp/deploy-workflow` | high | correctness | check: blocking |

What each holds:

- `gp/site-config`: `.github/site.config` exists with its three explicit keys, no unknown keys, every publish path tracked, no tooling directory published, and an `index.html` in the set.
- `gp/deploy-workflow`: the vendored deploy workflow is present, named, dispatch-only and building from the mount, and no other workflow publishes to Pages.

Relevance for both is **two independent signals, either sufficient**: the site config, or the vendored deploy workflow.

## Tasks

| Task | Cadence | What it does |
|---|---|---|
| [`site-release`](tasks/site-release/README.md) | daily, when the branch has moved past the last release | advances the version where public-website is declared, pushes it, dispatches the deploy workflow at that commit, waits for it, probes the site |

## Skills

[**github-pages-pipeline**](skills/github-pages-pipeline/SKILL.md) is the standard itself: wiring a repo, forcing and rolling back a release, reading a park, and the one-time GitHub settings no automation can turn on. It is the contract the checks above judge against, reached when a release is being set up or debugged. The rule that the workflow is a managed copy of the pack's stub lives there too, forced for the `github-pages-*` workflows and `site.config`.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| The site is served from a subpath | high | correctness | prose: <50 words |
| One path to production | high | correctness | prose: <100 words + check (`gp/deploy-workflow`) |

## Adoption

The pack declares its `adoptionHandover` — the two repository *settings* nothing in the repo can turn on (Pages source, the `github-pages` environment's branch rule). The install flow prints them and files them as a tracking issue; until they are on, the first release parks naming the failed deploy run.
