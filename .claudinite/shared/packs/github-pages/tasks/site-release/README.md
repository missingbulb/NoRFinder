# site-release — what the worker does

Deploys the default branch to GitHub Pages and, where the public-website pack is
declared, records the version that went out first. There is no `task.md` because
there is no agent: a release is a version number, a push, a dispatch and a wait, and
none of the four is a judgment call.

The operating knowledge — how to force one, how to roll one back, what is on the
GitHub side and what a park means — is the
[github-pages-pipeline](../../skills/github-pages-pipeline/SKILL.md) skill. This file
is only what the worker does.

## The run

1. **Read the branch tip.** The publish set comes from `.github/site.config` as the
   remote has it, never from the executor's checkout, and every path it names is
   checked against that commit's tree — so a release never dispatches a build that
   fails on a path the config names.
2. **Advance and stamp, if there is a version to advance.** The worker imports
   public-website's `public/version.mjs` from beside this pack on the mount. Present,
   it hands back the files a bump rewrites — the record and every page carrying the
   stamp — and the worker commits them. Absent (the pack undeclared), the release is
   the tip as found, and the run says so.
3. **Push the bump to the default branch**, rebuilding on whatever landed underneath
   and retrying — the scheduler and the maintenance PRs land there too, and a lost
   race would leave the repo naming an older version than the one being served.
4. **Dispatch the vendored [deploy workflow](../../stubs/workflows/github-pages-deploy.yml)
   at that exact commit and wait for its run.** The run is found as the workflow's
   newest dispatch created after ours; a run that ends in anything but success parks
   with its URL.
5. **Probe the site.** The Pages URL is fetched and its status reported, along with
   whether the page already shows the version just cut. Pages propagates for a minute
   or so, so a stale stamp is reported, never parked.

The bump lands **before** the deploy on purpose. Both halves can fail, and only one
of the two drifts is silent: a site serving a version the repo has no record of. A
version number consumed by a release whose deploy then failed is visible in the park
and costs nothing — the next release takes the next number.

## Why the declaration reads as it does

**A workflow, dispatched.** A Pages deploy has to be one: its publish steps are
marketplace actions, and no task can invoke a `uses:` step. So the task owns the
trigger and the decision to run, and the workflow carries only the deploy — dispatch
only, no push trigger, so nothing deploys behind the task. Dispatching it with the
executor's own token is the one event kind that token *does* fire a workflow for.

**`unreleased-commits`** ([`preconditions.mjs`](preconditions.mjs)) is the task's own
term because no built-in asks a release's question. The file says why the two nearest
built-ins are both wrong here, and what the gate degrades to on a repo with no version.

**`on_interrupt: needs-human`** because a release is a one-shot external effect: a
reclaimed claim must not re-run it, spend a second version number and redeploy.

**No `code_work_required_secrets`.** The deploy runs on the workflow job's own
identity and the bump on the executor's token; nothing here needs a secret a repo
has to configure.

**`expected_outcome: no_code_changes`** — the run opens no pull request. It does
commit, but to the default branch directly: a version bump reviewed after the fact is
a review of a number a machine derived, and holding the release for it would mean the
site lags the repo by however long the PR sits.

**Daily.** A release goes out the night after anything lands, and a night with
nothing to release files no run at all.
