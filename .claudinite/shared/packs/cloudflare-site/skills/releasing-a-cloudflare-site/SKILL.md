---
name: releasing-a-cloudflare-site
description: How a Cloudflare-served site is released, forced and rolled back. Use when changing the release task, the wrangler config or the analytics loader, and when a release parks.
metadata:
  body: workflow
  usage:
    expect: triggered
  force-load-on-file-edits-paths:
    - "**/wrangler.json"
    - "**/wrangler.jsonc"
    - "**/tasks/site-release/**"
---

# Releasing a Cloudflare-served site

A release is one thing: the default branch's tree, uploaded to Cloudflare — at a version the
release advances first, when the public-website pack is declared beside this one. The
`cloudflare-site/site-release` task owns all of it — its
[README](../../tasks/site-release/README.md) says what the worker does; this says how to
operate it and what a change to it must not break.

## The four properties a change preserves

- **The version names what shipped.** The scheme and the page stamp are public-website's, and
  the release reaches that pack's `public/version.mjs` for them, so the bump and the upload are
  one run — and the bump goes first, because of the two possible drifts only one is invisible:
  a site serving a version the repo has no record of. A number consumed by an upload that then
  failed is visible in the park and costs nothing. With public-website undeclared the site is
  uploaded unversioned, and the run says so.
- **A release cannot re-arm itself.** The gate is "the branch has moved past the last release
  commit", read off the `Claudinite-Task:` trailer. Anything that makes the release's own commit
  look like ordinary work releases nightly, forever.
- **Only the published directory is published.** `assets.directory` is the outer boundary, and
  the repo around it holds the vendored mount, the queue's workers and the packs — none of which
  may reach a public URL. Inside it, `.assetsignore` holds back what is documentation rather
  than page, so a file landing there is not automatically a public URL.
- **The beacon token is injected, never committed.** A published loader ships with the
  placeholder and no-ops; the deploy substitutes the `CLOUDFLARE_ANALYTICS_TOKEN` repository
  variable into the copy it uploads. Changing what the page loads or logs changes the promise,
  so the site's own privacy disclosure moves in the same commit.

## Releasing now rather than tonight

The release is the queue's, so force it the way any task is forced:

```
gh workflow run claudinite-scheduler.yml -f wake=cloudflare-site/site-release
```

The gate is still evaluated when the item is picked, so a force with nothing to release rolls
with its reason on record rather than shipping a duplicate.

## Rolling back

Revert on the branch and let the next release carry it — the revert sits above the last release
commit, so the gate opens on it; force the run with the command above when it cannot wait for
the nightly anchor. Don't add a rollback lever: it would be a second path to production, with
its own version arithmetic to keep in step.

## What only a person can change

Everything on the Cloudflare side — the account, the API token and its scopes, and whether the
domain is a zone on that account at all. The wrangler config claims the apex (and usually
`www`) as custom domains, so a deploy fails outright until the zone is there. That is the
intended failure: a release that quietly published to a URL nobody visits is worse than one that
stops and says so. Those steps are the pack's `adoptionHandover`, filed as an issue when the
pack is adopted.

## What the previous host left behind

Adding a zone imports the records the old host was serving, and a custom domain cannot be
attached over an existing `CNAME` — so an inherited `www` record blocks the deploy, and old
apex records keep serving the old host until they go. Nobody is asked to check for these: the
release resolves each claimed hostname in public DNS before it consumes a version number and
parks naming the record it found ([preflight.mjs](../../tasks/site-release/preflight.mjs)), and
`no-second-publisher` catches the repo-side leftovers — a workflow that still deploys, a `CNAME`
file still claiming the domain for GitHub Pages. An unreachable resolver is inconclusive, not a
verdict: the release proceeds and says the probe did not run.

## Reading a park

The worker names the lane it wants, so the label is the diagnosis. **`action`** is a credential,
a scope, the zone, or an inherited record, and the comment names which — nothing is wrong with
the code. **`decision`** means a surface the release depends on changed underneath it
(public-website declared with no `package.json` version to advance, no `assets.directory`,
the analytics placeholder gone), and
whether the release should follow is a person's call. **`failure`** means read the trace; that
lane also holds the next occurrence until the item is woken or closed, so a broken release stops
rather than filing a queue of items that break the same way. A park after the push but before
the upload has consumed a version number — re-queue the item, and the retry counts from the
branch's new tip.

## Changing the release

- **Never add a workflow that publishes.** The release lives in code-work precisely because
  `wrangler` is a CLI and needs no `uses:` step; a workflow beside it would bypass both the
  version bump and the queue's failure lane. `no-second-publisher` refuses one, so don't also
  guard it in review.
- **Keep `wrangler` pinned to an exact version**, so two nights cannot run different toolchains
  without a commit saying so.
- **Correct the task README and this file in the same commit** as any behaviour change — a
  description that still says the old thing is worse than none.
