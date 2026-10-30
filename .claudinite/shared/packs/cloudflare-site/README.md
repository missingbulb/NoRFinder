# cloudflare-site pack

Active when a near-root `wrangler.json`/`.jsonc` declares `assets.directory`: a repo whose
wrangler config describes a *site* rather than a Worker backend. It brings the nightly
`site-release` task (advance the version where public-website is declared, push the bump,
upload the tree, report what the domain answered and whether it shows that version), and the
checks that keep the upload boundary, the beacon token and the single path to production
honest.

## What this pack does not own

The version. [public-website](../public-website/README.md) owns the scheme and the page stamp,
and the release reaches that pack's `public/version.mjs` to advance it when the pack is declared;
a repo that declares only this one is uploaded unversioned.

The Cloudflare account's own steps, the zone, the account id and the API token, are the pack's
`adoptionHandover`, filed as a tracking issue when the pack is adopted. What a previous host
left behind is **not** on that list: an inherited DNS record on a claimed hostname is resolved
in public DNS by the release before it consumes a version number, and a workflow or `CNAME` file
still publishing is a check's finding.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Only the published tree reaches the site | high | correctness | prose: <100 words |
| Internal links omit `.html` | low | performance | prose: <50 words |
| One path to production | high | correctness | prose: <50 words + check (`cloudflare-site/no-second-publisher`) |
| What a parked release is asking for | medium | correctness | prose: <100 words |

## Skills

| Skill | Trigger |
|---|---|
| [`releasing-a-cloudflare-site`](skills/releasing-a-cloudflare-site/SKILL.md) | any edit of a `wrangler.json`/`.jsonc` or the release task, held by the guard until loaded |

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `cloudflare-site/publishes-a-site-directory` | critical | correctness | check: blocking |
| `cloudflare-site/no-second-publisher` | high | correctness | check: blocking |
| `cloudflare-site/beacon-token-is-not-committed` | high | legal | check: blocking |

## Tasks

| Task | Cadence | What it does |
|---|---|---|
| [`site-release`](tasks/site-release/README.md) | daily, when the branch has moved past the last release | advances the version where public-website is declared, pushes it, uploads the published tree to Cloudflare, probes the domain |

## Upstream

- Cloudflare Workers static assets and custom domains —
  https://developers.cloudflare.com/workers/static-assets/ and
  https://developers.cloudflare.com/workers/configuration/routing/custom-domains/ (mirrored as
  source at `raw.githubusercontent.com/cloudflare/cloudflare-docs`, `production` branch, under
  `src/content/docs/workers/static-assets/` and
  `src/content/docs/workers/configuration/routing/custom-domains.mdx`) — reconciled through
  2026-09-15.
- Wrangler releases — https://github.com/cloudflare/workers-sdk/releases (the same notes are the
  `packages/wrangler/CHANGELOG.md` of that repository) — reconciled through `wrangler@4.131.2`.
  The release pins `wrangler@4.128.0`; the pin moves in a commit that says so.
