---
name: github-pages-pipeline
description: Wiring, operating or debugging a site repo's GitHub Pages release. Use when setting one up, when a gp/ check fires, when a release parks, or to deploy now.
metadata:
  body: workflow
  usage:
    expect: triggered
  force-load-on-file-edits-paths:
    - ".github/site.config"
    - ".github/workflows/github-pages-*.yml"
    - "**/tasks/site-release/**"
---

# The GitHub Pages release

A release is one thing: the default branch's tree, deployed to Pages by the vendored
[deploy workflow](../../stubs/workflows/github-pages-deploy.yml), which the
`github-pages/site-release` task dispatches at the exact commit it released — after
advancing the version, when the public-website pack is declared. The task's
[README](../../tasks/site-release/README.md) says what the worker does; this says how to
wire it, operate it, and what a change to it must not break.

## Wiring it into a repo

1. Declare `github-pages` and answer its one adoption question. Write the answer into
   `.github/site.config`: `publish_root`, `publish_paths` (the additive publish set), and
   `build_command` (`""` = nothing to build, stated), plus `build_vars` only if the build
   reads repo variables. `gp/site-config` is the checklist for whether it is complete.
2. Re-vendor, and copy the pack's [deploy workflow stub](../../stubs/workflows/github-pages-deploy.yml)
   into `.github/workflows/`. There are no tokens to replace; the file is a managed copy, so
   fix the pack and re-vendor, never the copy.
3. File the pack's `adoptionHandover` as an issue — two repository *settings* nothing in the
   repo can set. Until they are on, the first release parks naming the failed deploy run.
4. Want a version on the site? Declare `public-website` beside this pack. The release then
   advances `package.json` and stamps every page carrying `title="version …"` before it
   deploys; with the pack undeclared the site is deployed unversioned, and the run says so.

## Releasing now rather than tonight

The release is the queue's, so force it the way any task is forced:

```
gh workflow run claudinite-scheduler.yml -f wake=github-pages/site-release
```

The gate is still evaluated when the item is picked, so a force with nothing to release
rolls with its reason on record rather than shipping a duplicate. To redeploy the same
tree after a settings fix, the same command: a repo with no version has nothing to gate on
but the window, and one with a version takes the next number.

## Rolling back

Revert on the branch and let the next release carry it — the revert sits above the last
release commit, so the gate opens on it; force the run with the command above when it
cannot wait for the nightly anchor. Don't add a rollback lever: it would be a second path to
production, and `gp/deploy-workflow` refuses one.

## Reading a park

The worker names the lane it wants, so the label is the diagnosis. **`action`** is the
deploy workflow missing from the branch or a token that cannot dispatch it — nothing is wrong
with the code. **`decision`** means a surface the release depends on changed underneath it:
no `site.config` on the branch, a publish path that no longer exists, or public-website
declared with no `package.json` version to advance. **`failure`** is a deploy run that did
not succeed, with its URL — on a first release, Settings → Pages → Source is the usual cause;
otherwise the run's log is the trace. A park after the push but before the deploy has
consumed a version number — re-queue the item, and the retry counts from the branch's new
tip.

## Changing the release

- **Never add a workflow that publishes, and never give the deploy workflow a push trigger.**
  The task is the one path to production; a second publisher ships a tree with no version cut
  and no park lane. `gp/deploy-workflow` refuses both, so don't also guard it in review.
- **Keep the workflow to the `uses:` steps.** Reading the config, exporting build variables
  and assembling the publish set are the pack's [`build-site.mjs`](../../build-site.mjs), run
  from the mount, so a fix reaches every Pages repo the night it lands without a workflow
  edit anywhere.
- **Correct the task README and this file in the same commit** as any behaviour change.
