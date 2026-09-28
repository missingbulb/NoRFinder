import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { workflowFiles } from '../../../engine/checks/helpers/github-workflows.mjs';
import { adoptedPages, DEPLOY_WORKFLOW_FILE, DEPLOY_WORKFLOW_NAME, DEPLOY_WORKFLOW_PATH } from '../lib.mjs';

// WHY. The deploy workflow is VENDORED into each Pages repo's own .github/ — GitHub
// runs a Pages deploy only from a workflow job in the repo's own tree, never from
// the mount — so the pack holds the template and each repo hosts a managed copy:
// edit the pack, not the copy. And it is the ONE publisher: the `site-release` task
// dispatches it at the commit it released, which is what makes the version the
// repo records the version the site serves. A second workflow that deploys, or a
// push trigger on this one, ships a tree with no version cut and no park lane, and
// its green run looks exactly like success.
//
// SCOPE. The repo's own workflows. A commented-out step is not a publisher.

// The publishing steps a Pages repo reaches for.
const PUBLISHES = /actions\/(deploy-pages|upload-pages-artifact|configure-pages)/;

const rule = {
  id: 'gp/deploy-workflow',
  on_fail: 'block',
  since: '2026-09-17',
  description: 'The vendored deploy workflow is present, dispatch-only, and the only workflow that publishes to Pages',
  doc: 'packs/github-pages/skills/github-pages-pipeline/SKILL.md',
  why: 'the release task dispatches this workflow at the commit it released; a second publisher or a push trigger deploys a tree with no version cut and no park lane',

  run(ctx) {
    if (!adoptedPages(ctx)) return [];
    const out = [];
    const text = ctx.read(DEPLOY_WORKFLOW_PATH);

    if (text === null) {
      out.push(finding(rule, {
        file: DEPLOY_WORKFLOW_PATH,
        what: 'missing — the release task dispatches this workflow to deploy, and a Pages deploy runs only from the repo\'s own .github/',
        fix: `copy it from the pack's stubs/workflows/${DEPLOY_WORKFLOW_FILE}`,
      }));
    } else {
      const name = /^name:\s*['"]?(.+?)['"]?\s*$/m.exec(text)?.[1];
      if (name !== DEPLOY_WORKFLOW_NAME || !/^\s*workflow_dispatch:/m.test(text) || !text.includes('build-site.mjs')) {
        out.push(finding(rule, {
          file: DEPLOY_WORKFLOW_PATH,
          what: 'is not the pack\'s deploy workflow (named, dispatchable, building from the mount)',
          fix: `re-copy it from the pack's stubs/workflows/${DEPLOY_WORKFLOW_FILE}`,
        }));
      }
      if (/^\s*push:/m.test(text)) {
        out.push(finding(rule, {
          file: DEPLOY_WORKFLOW_PATH,
          what: 'has a push: trigger — the site-release task is the one path to production, and a push would deploy behind it with no version cut',
          fix: `re-copy it from the pack's stubs/workflows/${DEPLOY_WORKFLOW_FILE}; force a release with \`gh workflow run claudinite-scheduler.yml -f wake=github-pages/site-release\``,
        }));
      }
    }

    for (const file of workflowFiles(ctx)) {
      if (file === DEPLOY_WORKFLOW_PATH) continue;
      const wf = ctx.read(file);
      if (wf === null) continue;
      wf.split('\n').forEach((line, i) => {
        if (/^\s*#/.test(line) || !PUBLISHES.test(line)) return;
        out.push(finding(rule, {
          file,
          line: i + 1,
          what: `${file} publishes the site from a second workflow`,
          fix: 'delete it — the site-release task dispatches the vendored deploy workflow at the commit it released, and a second publisher ships a tree with no version cut and no park lane',
        }));
      });
    }
    return out;
  },
};

export default rule;
