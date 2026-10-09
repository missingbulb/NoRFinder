// full-tests — run the Full tests workflow on the default branch and wait for its verdict.
//
// The tests need setup-python, setup-node and Playwright's browser, which are `uses:` steps only a
// workflow job can run, so the workflow carries the steps and this task owns when they run.

import { fail, github } from '@claudinite/sdk';
import { makeGh } from '../github-api.mjs';

export const WORKFLOW_FILE = 'tests-full.yml';
export const RUN_APPEARS_WITHIN_MS = 3 * 60 * 1000;
export const RUN_FINISHES_WITHIN_MS = 25 * 60 * 1000;

export async function worker({ log, repo, defaultBranch, gh = makeGh(), dispatch = github.dispatchWorkflow, now = () => Date.now(), sleep = (ms) => new Promise((r) => { setTimeout(r, ms); }) }) {
  const since = new Date(now() - 60 * 1000).toISOString();
  try {
    await dispatch({ workflow: WORKFLOW_FILE, ref: defaultBranch });
  } catch (e) {
    fail('failure', `dispatching ${WORKFLOW_FILE} on ${defaultBranch} failed: ${e?.message ?? e}`);
  }

  const started = now();
  let run = null;
  while (!run && now() - started < RUN_APPEARS_WITHIN_MS) {
    await sleep(10 * 1000);
    const { status: listStatus, json } = await gh(`/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?event=workflow_dispatch&per_page=20`);
    if (listStatus !== 200) continue;
    run = (json?.workflow_runs ?? []).find((r) => r.created_at >= since) ?? null;
  }
  if (!run) fail('failure', `${WORKFLOW_FILE} was dispatched but no run appeared within three minutes`);
  log(`full tests started: ${run.html_url}`);

  while (run.status !== 'completed') {
    if (now() - started > RUN_FINISHES_WITHIN_MS) fail('failure', `the full tests did not finish in time: ${run.html_url}`);
    await sleep(20 * 1000);
    const { status: readStatus, json } = await gh(`/repos/${repo}/actions/runs/${run.id}`);
    if (readStatus === 200 && json) run = json;
  }
  if (run.conclusion !== 'success') fail('failure', `the full tests ended ${run.conclusion} on ${defaultBranch}: ${run.html_url}`);
  log(`full tests passed: ${run.html_url}`);
}
