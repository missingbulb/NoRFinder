// The intake, by code: every open issue labelled new-ground-truth has its attached file added to the
// ground-truth data set (detection/ground_truth.py ingest), the quality baseline is re-recorded against the
// new reference, and the result is delivered as this run's pull request, which closes the issues it took
// when merged. A submission that cannot be used gets a comment saying why and loses the label, so it waits
// for its author instead of being retried every day. The agent is asked for only when something was added.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LABEL } from './label.mjs';

const MARK = '<!-- ground-truth-intake -->';

async function paged(gh, path) {
  const out = [];
  for (let page = 1; ; page += 1) {
    const { status, json } = await gh(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (status !== 200) throw new Error(`GitHub answered ${status} for ${path}`);
    out.push(...json);
    if (json.length < 100) return out;
  }
}

export async function worker({ gh, log, deliver, root, repo, defaultBranch, token }) {
  const open = (await paged(gh, `/repos/${repo}/issues?state=open&labels=${LABEL}`)).filter((i) => !i.pull_request);
  const issues = [];
  for (const i of open) {
    const comments = await paged(gh, `/repos/${repo}/issues/${i.number}/comments`);
    issues.push({ number: i.number, title: i.title, body: i.body ?? '', comments: comments.map((c) => c.body ?? '') });
  }
  log(`${issues.length} open issue(s) labelled ${LABEL}: ${issues.map((i) => `#${i.number}`).join(' ')}`);

  // a scratch checkout of the base, so nothing here touches the executor's own
  const tmp = mkdtempSync(join(tmpdir(), 'gt-intake-'));
  const wt = join(tmp, 'repo');
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  git('fetch', '--quiet', 'origin', defaultBranch ?? 'main');
  git('worktree', 'add', '--quiet', '--detach', wt, 'FETCH_HEAD');
  try {
    const py = join(tmp, 'venv', 'bin', 'python');
    const run = (cmd, args, env = {}) => execFileSync(cmd, args, { cwd: wt, encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
    run('python3', ['-m', 'venv', join(tmp, 'venv')]);
    run(py, ['-m', 'pip', 'install', '--quiet', '-r', 'requirements.txt']);
    writeFileSync(join(tmp, 'issues.json'), JSON.stringify(issues));
    run(py, ['detection/ground_truth.py', 'ingest', join(tmp, 'issues.json'), '--out', join(tmp, 'result.json')], { GITHUB_TOKEN: token });
    const { added, refused } = JSON.parse(readFileSync(join(tmp, 'result.json'), 'utf8'));
    log(`added ${added.length ? added.map((n) => `#${n}`).join(' ') : 'nothing'}; refused ${Object.keys(refused).length}`);

    for (const [n, why] of Object.entries(refused)) {
      await gh(`/repos/${repo}/issues/${n}/comments`, { method: 'POST', body: { body:
        `${MARK}\nThis ground truth could not be added: ${why}.\n\n`
        + `Export it again from the NoR Finder page with the image opened from Google Drive, attach the new file here, `
        + `and put the \`${LABEL}\` label back; the next daily intake will take it.` } });
      await gh(`/repos/${repo}/issues/${n}/labels/${LABEL}`, { method: 'DELETE' });
    }
    if (!added.length) return undefined;

    run(py, ['detection/ground_truth.py', 'fetch']);
    const scores = run(py, ['tests/test_quality.py', '--accept']).split('\n').filter((l) => / real found, /.test(l)).join('\n');
    const changed = execFileSync('git', ['-C', wt, 'status', '--porcelain', '--untracked-files=all', '--', 'detection/lab'], { encoding: 'utf8' })
      .split('\n').filter(Boolean).map((l) => l.slice(3));
    const files = Object.fromEntries(changed.map((p) => [p, readFileSync(join(wt, p), 'utf8')]));
    const body = [
      `Adds ${added.length} ground-truth submission(s) from the NoR Finder page to \`detection/lab/ground_truth/\` and re-records the quality baseline against the new reference (submitted labels outrank older ones: docs/requirements.md R10).`,
      '',
      ...added.map((n) => `Closes #${n}`),
      '',
      'Every finder on every ground-truth image, as now recorded:',
      '```',
      scores.trim(),
      '```',
    ].join('\n');
    const d = await deliver({ files, title: `Ground truth: add ${added.map((n) => `#${n}`).join(', ')}`, body,
      message: `Add ground truth from ${added.map((n) => `#${n}`).join(', ')}` });
    log(`delivered on ${d.branch} as #${d.number}`);
    return { requestAgent: { delivered: { pr: d.number, branch: d.branch }, reason: { code: 'ground-truth-added', detail: `${added.length} submission(s) added` } } };
  } finally {
    try { git('worktree', 'remove', '--force', wt); } catch { /* the scratch tree goes with tmp */ }
    rmSync(tmp, { recursive: true, force: true });
  }
}
