// site-release — cut a version, publish the site tree to Cloudflare, record the release.
//
// The whole run is deterministic: read the branch tip, advance the version, push that
// bump, upload the tree. Nothing here is a judgment call, which is why the task runs
// no agent — and nothing here is a marketplace action either: `wrangler deploy` is a
// CLI, so the release needs no workflow of its own and lives entirely in the queue.
//
// ORDER IS DELIBERATE: the bump lands on the branch BEFORE the upload. Either half
// can fail, and of the two possible drifts only one is silent — a site serving a
// version the repo has no record of. A consumed version number that never shipped is
// visible in the park and costs nothing; the next release simply takes the next one.
//
// THE VERSION IS ANOTHER PACK'S. public-website owns the scheme and the page stamp,
// and publishes them through its `public/version.mjs`; this worker imports that seam
// when the pack is on the mount and releases without a bump when it is not. Nothing
// else of that pack is reached, and nothing here knows how the version is shaped.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// The remote and the trailer that says which task wrote a commit are the engine's:
// a fetch or a push goes through the SDK's `git`, which carries the job's token, and
// `commitMessage` stamps the trailers. Everything local is plain git on the checkout.
import { commitMessage, git as engineGit } from '@claudinite/sdk';
import { BEACON_PLACEHOLDER, claimedHostnames, parseWranglerConfig, publishedDir, wranglerConfigPath } from '../../lib.mjs';
import { preflight } from './preflight.mjs';

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

// Pinned rather than floating: a release that silently changes its own toolchain
// between two nights is a change nobody reviewed.
export const WRANGLER = 'wrangler@4.128.0';

// Re-exported so a member reading the worker finds the placeholder where it is used;
// `lib.mjs` owns it, because the check keeping a real token out of the tree names it
// too (see there).
export { BEACON_PLACEHOLDER };
// Cloudflare's beacon tokens are hex. Anything else would be substituted into a string
// literal in a served script, so it is refused rather than shipped.
const BEACON_SHAPE = /^[0-9a-f]{8,}$/i;

// How many times the bump push re-reads the tip and rebuilds before giving up. The
// scheduler and the maintenance PRs also land on the default branch, and a lost race
// here would leave the repo naming an older version than the one being served.
const PUSH_ATTEMPTS = 5;

const log = (m) => console.log(`site-release: ${m}`);

const git = (cwd, args, opts = {}) => execFileSync('git', ['-C', cwd, ...args], {
  encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts,
});

// A command that talks to the remote, through the engine; a non-zero exit is a throw.
async function remoteGit(...args) {
  const r = await engineGit(...args);
  if (r.code !== 0) throw new Error(`git ${args[0]} exited ${r.code}: ${r.stderr.trim()}`);
  return r.stdout;
}

// The base branch's remote tip, fetched into the checkout's object store: read from
// the remote, never from HEAD, which the executor's other items share.
export async function baseTip(root, base) {
  await remoteGit('fetch', '--quiet', 'origin', base);
  return git(root, ['rev-parse', 'FETCH_HEAD']).trim();
}

// One file's content at a commit, or null when the path does not exist there.
export function readAt(root, sha, path) {
  try { return git(root, ['show', `${sha}:${path}`], { stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
}

// The deployment as the commit at `sha` declares it: which config wrangler will read,
// which tree it uploads, and which hostnames it claims. Read from the commit rather
// than the checkout, so the release describes what it is about to ship.
export function deploymentAt(root, sha) {
  const tracked = git(root, ['ls-tree', '-r', '--name-only', sha]).split('\n').filter(Boolean);
  const configPath = wranglerConfigPath(tracked);
  if (!configPath) {
    console.error('claudinite-needs-human: decision — no wrangler.json/.jsonc at the repo root or one directory down, so nothing declares what the release uploads');
    throw new Error('no wrangler config on the branch');
  }
  const config = parseWranglerConfig(readAt(root, sha, configPath));
  const dir = publishedDir(config, configPath);
  if (!dir) {
    console.error(`claudinite-needs-human: decision — ${configPath} declares no assets.directory, so the release has no tree to upload`);
    throw new Error(`${configPath} declares no assets.directory`);
  }
  return { configPath, dir, hostnames: claimedHostnames(config), tracked };
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
export async function pushRelease(root, { base, versioning, now = new Date() }) {
  let lastError = null;
  for (let attempt = 1; attempt <= PUSH_ATTEMPTS; attempt += 1) {
    const parent = await baseTip(root, base);
    const deployment = deploymentAt(root, parent);
    if (!versioning) return { version: null, commit: parent, attempts: attempt, deployment };

    const bump = versioning.bumpedFiles({ read: (path) => readAt(root, parent, path), tracked: deployment.tracked, now });
    if (!bump) {
      console.error(`claudinite-needs-human: decision — package.json is absent from ${base} or carries no version, so public-website has nothing to advance — add one, or undeclare public-website to release unversioned`);
      throw new Error(`package.json on ${base} carries nothing to advance`);
    }

    const commit = commitOnto(root, {
      parent,
      files: bump.files,
      message: commitMessage(`Release site version ${bump.version}`),
    });
    const pushed = await engineGit('push', '--quiet', 'origin', `${commit}:refs/heads/${base}`);
    if (pushed.code === 0) return { version: bump.version, commit, attempts: attempt, deployment };
    lastError = new Error(pushed.stderr.trim());
    log(`push rejected on attempt ${attempt} — ${base} moved; rebuilding on its new tip`);
  }
  throw new Error(`could not push the version bump after ${PUSH_ATTEMPTS} attempts: ${lastError?.message ?? 'unknown'}`);
}

// The exact tree that is about to be uploaded, checked out beside the repo so the
// deployed bytes are the released commit's and nothing else's.
function withReleaseTree(root, commit, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'claudinite-release-'));
  git(root, ['worktree', 'add', '--detach', '--quiet', dir, commit]);
  try { return fn(dir); } finally {
    try { git(root, ['worktree', 'remove', '--force', dir]); } catch { rmSync(dir, { recursive: true, force: true }); }
  }
}

// Substitute the beacon token into every file of the copy being uploaded that carries
// the placeholder. Returns whether analytics will actually be live on this release —
// the placeholder surviving is the documented off state, not a failure, and saying
// which happened is the only way a run where the beacon never engaged is
// distinguishable from one where it did.
export function injectBeacon(treeDir, files, token) {
  if (!token) return false;
  if (!BEACON_SHAPE.test(token)) {
    console.error('claudinite-needs-human: action — the CLOUDFLARE_ANALYTICS_TOKEN repository variable is not a Cloudflare beacon token (hex); fix or clear it');
    throw new Error('CLOUDFLARE_ANALYTICS_TOKEN is malformed');
  }
  let injected = 0;
  for (const file of files) {
    const path = join(treeDir, file);
    let text;
    try { text = readFileSync(path, 'utf8'); } catch { continue; }
    if (!text.includes(BEACON_PLACEHOLDER)) continue;
    writeFileSync(path, text.split(BEACON_PLACEHOLDER).join(token));
    injected += 1;
  }
  if (!injected) {
    console.error(`claudinite-needs-human: decision — the CLOUDFLARE_ANALYTICS_TOKEN variable is set, but no published file carries the ${BEACON_PLACEHOLDER} placeholder, so the token has nowhere to go`);
    throw new Error('the analytics placeholder is gone');
  }
  return true;
}

// A wrangler failure a person can fix in seconds (a token without the right scope, an
// account id that is not theirs, a zone that is not on Cloudflare yet) versus one that
// needs the trace read. The park lane follows from this.
export const isOperatorFailure = (output) => /\b(10000|10001|10021)\b|authentication error|not authorized|unauthorized|permission|no such zone|could not find zone/i.test(output ?? '');

function deploy(dir, { apiToken, accountId }) {
  try {
    const out = execFileSync('npx', ['--yes', WRANGLER, 'deploy'], {
      cwd: dir,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: apiToken,
        CLOUDFLARE_ACCOUNT_ID: accountId,
        WRANGLER_SEND_METRICS: 'false',
        CI: 'true',
      },
    });
    console.log(out);
    return out;
  } catch (e) {
    const output = `${e.stdout ?? ''}\n${e.stderr ?? ''}`;
    console.log(output);
    console.error(isOperatorFailure(output)
      ? 'claudinite-needs-human: action — Cloudflare refused the upload; check the CLOUDFLARE_API_TOKEN scopes, the CLOUDFLARE_ACCOUNT_ID, and that the claimed domain is a zone on this account'
      : 'claudinite-needs-human: failure — wrangler deploy failed; the output above is the trace');
    throw new Error(`wrangler deploy failed: ${e.message}`);
  }
}

// What the hostnames served after the upload, and whether the page shows the version
// just cut. A release is not finished when the API returns 200: the point of the
// exercise is that a visitor reaches the page, and the run is the only place that is
// ever checked. A first attach issues a certificate, which takes minutes, so this
// REPORTS rather than parks — the version is already cut and the upload already
// happened, and there is nothing here to undo. `stamp` is `matches`, `stale`, `none`
// (the page carries no stamp) or null (no version was cut).
export async function reportServed(hostnames, { version = null, fetchImpl = fetch } = {}) {
  const served = [];
  for (const hostname of hostnames) {
    try {
      const res = await fetchImpl(`https://${hostname}/`, { redirect: 'follow' });
      const body = typeof res.text === 'function' ? await res.text() : '';
      let stamp = null;
      if (version) {
        if (body.includes(`title="version ${version}"`)) stamp = 'matches';
        else stamp = /title="version [^"]*"/.test(body) ? 'stale' : 'none';
      }
      served.push({ hostname, status: res.status, stamp });
    } catch (e) { served.push({ hostname, error: e.message }); }
  }
  return served;
}

export async function worker({ root, defaultBranch, secrets }) {
  const base = defaultBranch ?? 'main';
  const apiToken = secrets.CLOUDFLARE_API_TOKEN;
  const accountId = secrets.CLOUDFLARE_ACCOUNT_ID;

  if (!apiToken || !accountId) {
    console.error('claudinite-needs-human: action — CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must both be configured as repository secrets before the site can be published');
    throw new Error('the Cloudflare credentials are not configured');
  }

  // Before the version is consumed: what the previous host left on the hostnames
  // this deploy claims.
  const claimed = deploymentAt(root, await baseTip(root, base)).hostnames;
  const { blocked, unprobed } = await preflight(claimed);
  if (unprobed.length) log(`could not resolve ${unprobed.join(', ')} — the inherited-record probe did not run for ${unprobed.length === 1 ? 'it' : 'them'}`);
  if (blocked.length) {
    for (const b of blocked) log(`${b.what} — ${b.fix}`);
    console.error(`claudinite-needs-human: action — ${blocked.map((b) => b.what).join('; ')}. ${blocked.map((b) => b.fix).join(' ')}`);
    throw new Error('a claimed hostname still answers from the previous host');
  }

  const versioning = await loadVersioning();
  log(versioning
    ? 'public-website is declared — the release advances the version before uploading'
    : 'public-website is not declared — the release uploads the branch tip with no version bump');

  const { version, commit, attempts, deployment } = await pushRelease(root, { base, versioning });
  log(version
    ? `released version ${version} as ${commit.slice(0, 7)}${attempts > 1 ? ` (after ${attempts} push attempts)` : ''}`
    : `releasing ${commit.slice(0, 7)}`);

  withReleaseTree(root, commit, (dir) => {
    const published = deployment.tracked.filter((p) => p.startsWith(`${deployment.dir}/`));
    // A repo VARIABLE, not a declared secret, so it rides the environment rather than
    // the bag's `secrets` - every variable reaches code-work, none is declared.
    const live = injectBeacon(dir, published, process.env.CLOUDFLARE_ANALYTICS_TOKEN);
    log(live
      ? 'injected the Cloudflare Web Analytics beacon token — analytics is live on this release'
      : 'no CLOUDFLARE_ANALYTICS_TOKEN variable — the placeholder ships and analytics stays off');
    const configDir = deployment.configPath.includes('/')
      ? join(dir, deployment.configPath.slice(0, deployment.configPath.lastIndexOf('/')))
      : dir;
    deploy(configDir, { apiToken, accountId });
  });

  for (const r of await reportServed(deployment.hostnames, { version })) {
    if (r.error) { log(`https://${r.hostname}/ did not answer: ${r.error}`); continue; }
    const stamp = r.stamp === 'matches' ? ` and shows version ${version}`
      : r.stamp === 'stale' ? ' but still shows an earlier version — the edge propagates for a minute or so; a later visit is the check'
        : r.stamp === 'none' ? ' (the page carries no version stamp)' : '';
    log(`https://${r.hostname}/ answered ${r.status}${stamp}`);
  }
  log(`published ${deployment.dir}${version ? ` at version ${version}` : ''}`);
}
