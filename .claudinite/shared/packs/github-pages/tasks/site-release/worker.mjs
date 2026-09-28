// site-release — cut a version, deploy the default branch to GitHub Pages, record it.
//
// The whole run is deterministic: read the branch tip, advance the version, push that
// bump, dispatch the deploy at that exact commit and wait for it. Nothing here is a
// judgment call, which is why the task runs no agent. The deploy itself is the one
// part that is not code-work: a Pages deploy is made of marketplace actions that only
// a workflow job can run, so the task owns the trigger and the decision and the
// vendored workflow carries those steps.
//
// ORDER IS DELIBERATE: the bump lands on the branch BEFORE the deploy. Either half
// can fail, and of the two possible drifts only one is silent — a site serving a
// version the repo has no record of. A consumed version number that never shipped is
// visible in the park and costs nothing; the next release simply takes the next one.
//
// THE VERSION IS ANOTHER PACK'S. public-website owns the scheme and the page stamp,
// and publishes them through its `public/version.mjs`; this worker imports that seam
// when the pack is on the mount and releases without a bump when it is not. Nothing
// else of that pack is reached, and nothing here knows how the version is shaped.

import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Reading a branch tip without disturbing the executor's checkout, stamping the
// trailer that says which task wrote a commit, and reaching GitHub the way the
// executor does are claudinite-tasks' to own; the published `public/` seam is the
// only way a pack may reach another's code, and the relative path resolves the same
// from the canon and from a member's mount.
import { baseTip, readAt, remoteUrl } from '../../../claudinite-tasks/public/delivery.mjs';
import { withTaskTrailer } from '../../../claudinite-tasks/public/work-item-grammar.mjs';
import { dispatchWorkflow, listWorkflowRuns, readPagesSite, readWorkflowRun } from '../../../claudinite-tasks/public/github.mjs';
import { CONFIG_PATH, DEPLOY_WORKFLOW_FILE, DEPLOY_WORKFLOW_PATH, parseConfig, publishSet } from '../../lib.mjs';

// public-website's seam, resolved beside this pack on whatever tree runs the worker.
// Absent means the pack is not declared here (the mount holds declared packs only),
// which is the documented no-bump release, not an error; any other failure to load
// it is a real one.
export const VERSIONING_SEAM = '../../../public-website/public/version.mjs';

export async function loadVersioning(importImpl = (specifier) => import(specifier)) {
  try {
    return await importImpl(VERSIONING_SEAM);
  } catch (e) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw e;
  }
}

// How many times the bump push re-reads the tip and rebuilds before giving up. The
// scheduler and the maintenance PRs also land on the default branch, and a lost race
// here would leave the repo naming an older version than the one being served.
const PUSH_ATTEMPTS = 5;

// How long the worker waits for the dispatched run to show up, then to finish. The
// second stays under the task's `code_work_timeout`, so a run that hangs parks with
// its URL rather than dying at the ceiling with nothing printed.
export const RUN_APPEARS_WITHIN_MS = 3 * 60 * 1000;
export const RUN_FINISHES_WITHIN_MS = 22 * 60 * 1000;

const log = (m) => console.log(`site-release: ${m}`);

const git = (cwd, args, opts = {}) => execFileSync('git', ['-C', cwd, ...args], {
  encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts,
});

const park = (lane, what) => {
  console.error(`claudinite-needs-human: ${lane} — ${what}`);
  return new Error(what);
};

// The deployment as the commit at `sha` declares it: the publish set the deploy will
// assemble, checked against the tree at that commit so a release never dispatches a
// build that fails on a path the config names. Read from the commit rather than the
// checkout, so the release describes what it is about to ship.
export function deploymentAt(root, sha) {
  const tracked = git(root, ['ls-tree', '-r', '--name-only', sha]).split('\n').filter(Boolean);
  const text = readAt(root, sha, CONFIG_PATH);
  if (text === null) throw park('decision', `${CONFIG_PATH} is absent from the branch, so nothing declares what the release publishes`);
  const { values, errors } = parseConfig(text);
  if (errors.length) throw park('decision', `${CONFIG_PATH} does not parse: ${errors.join('; ')}`);
  const { paths, fullOf } = publishSet(values);
  const missing = paths.filter((p) => {
    const full = fullOf(p);
    return full !== '.' && !tracked.some((f) => f === full || f.startsWith(`${full}/`));
  });
  if (missing.length) throw park('decision', `${CONFIG_PATH} names publish path(s) that do not exist on the branch: ${missing.join(', ')}`);
  return { tracked, values };
}

// A commit carrying `files` on top of `parent`, built through a scratch index so the
// executor's checkout and working tree are never touched.
function commitOnto(root, { parent, files, message }) {
  const index = join(tmpdir(), `claudinite-release-${process.pid}-${Date.now()}.index`);
  const plumb = (args, opts) => git(root, args, { ...opts, env: { ...process.env, GIT_INDEX_FILE: index } });
  try {
    plumb(['read-tree', parent]);
    for (const [path, content] of Object.entries(files)) {
      const blob = git(root, ['hash-object', '-w', '--stdin'], { input: content }).trim();
      plumb(['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`]);
    }
    const tree = plumb(['write-tree']).trim();
    return git(root, [
      '-c', 'user.name=claudinite[bot]', '-c', 'user.email=claudinite@users.noreply.github.com',
      'commit-tree', tree, '-p', parent, '-m', message,
    ]).trim();
  } finally { rmSync(index, { force: true }); }
}

// Advance the version on `base` and push it, rebuilding on top of whatever landed
// under us. The version is recomputed from each attempt's tip rather than carried
// across, so a release that raced another writer still counts from what is there.
// With no `versioning` there is nothing to write: the release is the tip as found.
//
// Deliberately not `pushGenerated`: that lane force-pushes, which is correct for a
// regenerate-not-reconcile branch and catastrophic for the default branch.
export function pushRelease(root, { remote, base, taskId, versioning, now = new Date() }) {
  let lastError = null;
  for (let attempt = 1; attempt <= PUSH_ATTEMPTS; attempt += 1) {
    const parent = baseTip(root, remote, base);
    const deployment = deploymentAt(root, parent);
    if (!versioning) return { version: null, commit: parent, attempts: attempt, deployment };

    const bump = versioning.bumpedFiles({ read: (path) => readAt(root, parent, path), tracked: deployment.tracked, now });
    if (!bump) throw park('decision', `package.json is absent from ${base} or carries no version, so public-website has nothing to advance — add one, or undeclare public-website to release unversioned`);

    const commit = commitOnto(root, {
      parent,
      files: bump.files,
      message: withTaskTrailer(`Release site version ${bump.version}`, taskId),
    });
    try {
      git(root, ['push', '--quiet', remote, `${commit}:refs/heads/${base}`]);
      return { version: bump.version, commit, attempts: attempt, deployment };
    } catch (e) {
      lastError = e;
      log(`push rejected on attempt ${attempt} — ${base} moved; rebuilding on its new tip`);
    }
  }
  throw new Error(`could not push the version bump after ${PUSH_ATTEMPTS} attempts: ${lastError?.message ?? 'unknown'}`);
}

// Dispatch the vendored deploy workflow at `commit` and wait for the run it starts.
// Judged by status, never by the body: a token without `actions: write` 403s the
// dispatch with a plausible JSON body. A dispatch answers 204 and names no run, so
// the run is found by being this workflow's newest dispatch created after ours —
// with a minute of tolerance for clock skew between the runner and GitHub.
export async function deploy(gh, repo, { base, commit, now = () => Date.now(), sleep = (ms) => new Promise((r) => { setTimeout(r, ms); }) }) {
  const since = new Date(now() - 60 * 1000).toISOString();
  const { ok, status } = await dispatchWorkflow(gh, repo, DEPLOY_WORKFLOW_FILE, base, { ref: commit });
  if (!ok) {
    if (status === 404) throw park('action', `${DEPLOY_WORKFLOW_PATH} is not on ${base}, so the release has no deploy to dispatch — re-vendor the pack so its stub lands`);
    if (status === 401 || status === 403) throw park('action', 'the executor token cannot dispatch workflows (actions: write is missing, or Actions are restricted for this repository)');
    throw park('failure', `dispatching ${DEPLOY_WORKFLOW_FILE} answered ${status}`);
  }

  const started = now();
  let run = null;
  while (!run && now() - started < RUN_APPEARS_WITHIN_MS) {
    await sleep(10 * 1000);
    const { status: listStatus, json } = await listWorkflowRuns(gh, repo, DEPLOY_WORKFLOW_FILE);
    if (listStatus !== 200) continue;
    run = (json?.workflow_runs ?? []).find((r) => r.event === 'workflow_dispatch' && r.created_at >= since) ?? null;
  }
  if (!run) throw park('failure', `the deploy was dispatched but no run of ${DEPLOY_WORKFLOW_FILE} appeared within three minutes`);
  log(`deploy run started: ${run.html_url}`);

  while (run.status !== 'completed') {
    if (now() - started > RUN_FINISHES_WITHIN_MS) throw park('failure', `the deploy run did not finish in time: ${run.html_url}`);
    await sleep(20 * 1000);
    const { status: readStatus, json } = await readWorkflowRun(gh, repo, run.id);
    if (readStatus === 200 && json) run = json;
  }
  if (run.conclusion !== 'success') {
    throw park('failure', `the deploy run ended ${run.conclusion}: ${run.html_url} — on a first release, check Settings → Pages → Source is "GitHub Actions"; otherwise the run's log is the trace`);
  }
  return run;
}

// What the site answers after the deploy, and whether it shows the version just cut.
// A release is not finished when the API returns success: the point of the exercise
// is that a visitor reaches the page, and the run is the only place that is ever
// checked. Pages propagates for a minute or so after a deploy, so this REPORTS
// rather than parks — the version is already cut and the deploy already happened,
// and there is nothing here to undo. `stamp` is `matches`, `stale`, `none` (the
// page carries no stamp) or null (no version was cut).
export async function reportServed(url, { version = null, fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(url, { redirect: 'follow' });
    const body = await res.text();
    let stamp = null;
    if (version) {
      if (body.includes(`title="version ${version}"`)) stamp = 'matches';
      else stamp = /title="version [^"]*"/.test(body) ? 'stale' : 'none';
    }
    return { url, status: res.status, stamp };
  } catch (e) {
    return { url, error: e.message };
  }
}

export async function worker({ root, repo, defaultBranch, pack, task, token, gh }) {
  const base = defaultBranch ?? 'main';
  const taskId = `${pack}/${task}`;


  const versioning = await loadVersioning();
  log(versioning
    ? 'public-website is declared — the release advances the version before deploying'
    : 'public-website is not declared — the release deploys the branch tip with no version bump');

  const { version, commit, attempts } = pushRelease(root, { remote: remoteUrl(repo, token), base, taskId, versioning });
  log(version
    ? `released version ${version} as ${commit.slice(0, 7)}${attempts > 1 ? ` (after ${attempts} push attempts)` : ''}`
    : `releasing ${commit.slice(0, 7)}`);

  const run = await deploy(gh, repo, { base, commit });
  log(`deploy run succeeded: ${run.html_url}`);

  const { status, json: site } = await readPagesSite(gh, repo);
  if (!site?.html_url) {
    log(`the Pages API reports no site for ${repo} (${status}) — nothing to probe`);
  } else {
    const r = await reportServed(site.html_url, { version });
    if (r.error) log(`${r.url} did not answer: ${r.error}`);
    else {
      const stamp = r.stamp === 'matches' ? ` and shows version ${version}`
        : r.stamp === 'stale' ? ` but still shows an earlier version — Pages propagates for a minute or so; a later visit is the check`
          : r.stamp === 'none' ? ' (the page carries no version stamp)' : '';
      log(`${r.url} answered ${r.status}${stamp}`);
    }
  }
  log(`published ${commit.slice(0, 7)}${version ? ` at version ${version}` : ''}`);
}
