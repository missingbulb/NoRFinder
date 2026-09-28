import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { adoptedPages, CONFIG_PATH, KEYS, NEVER_PUBLISHED, parseConfig, publishSet } from '../lib.mjs';

// The publish set is validated where the repo can see it, not only on the runner at
// deploy time: the same parse the deploy's build step runs (one definition, in
// lib.mjs), plus the existence of every path it names.
const rule = {
  id: 'gp/site-config',
  on_fail: 'block',
  since: '2026-09-17',
  description: `${CONFIG_PATH} declares the publish set explicitly — the three required keys, no unknown keys, every published path present`,
  doc: 'packs/github-pages/skills/github-pages-pipeline/SKILL.md',
  why: 'the published artifact is an explicit list, so a stale entry silently drops a page from the live site and an unknown key silently does nothing',

  run(ctx) {
    if (!adoptedPages(ctx)) return [];
    const text = ctx.read(CONFIG_PATH);
    if (text === null) {
      return [finding(rule, {
        file: CONFIG_PATH,
        what: `missing — the deploy reads every repo value from it (${KEYS.filter((k) => !k.optional).map((k) => k.name).join(', ')})`,
        fix: `write ${CONFIG_PATH} with all three required keys, explicitly (see the github-pages-pipeline skill)`,
      })];
    }

    const { values, errors } = parseConfig(text);
    const out = errors.map((e) => finding(rule, {
      file: CONFIG_PATH,
      what: e.replace(`${CONFIG_PATH}: `, '').replace(`${CONFIG_PATH}:`, 'line '),
      fix: 'fix the key (the three are required and fully explicit — there are no defaults to fall back on; build_vars is the one key a config may omit)',
    }));

    const { root, siteRoot, paths, fullOf } = publishSet(values);
    for (const p of paths) {
      const full = fullOf(p);
      if (NEVER_PUBLISHED.includes(p) || NEVER_PUBLISHED.includes(full) || (p === '.' && full === '.')) {
        out.push(finding(rule, {
          file: CONFIG_PATH,
          what: p === '.' && full === '.'
            ? 'publishes the whole repo root — the mount, the tooling and the workflows would all reach a public URL'
            : `publishes "${p}" — tooling and dependency directories are never part of a published site`,
          fix: p === '.' && full === '.'
            ? 'name the site\'s own files in publish_paths, or root the site in a subdirectory and publish "." under that publish_root'
            : `drop "${p}" from publish_paths and name the site's own files instead`,
        }));
        continue;
      }
      if (!ctx.tracked.some((f) => f === full || f.startsWith(`${full}/`))) {
        out.push(finding(rule, {
          file: CONFIG_PATH,
          what: `publish path "${p}" matches nothing tracked at "${full}" — the deploy fails on it, or quietly ships a smaller site than intended`,
          fix: `remove the entry, or fix the path (publish paths are relative to publish_root "${root}")`,
        }));
      }
    }

    // A site with no front page is the one broken deploy the assembly guard catches
    // at build time; catching it here means it never reaches main.
    const publishesIndex = paths.some((p) => {
      const full = fullOf(p);
      return full === `${siteRoot}index.html` || ctx.tracked.includes(`${full === '.' ? '' : `${full}/`}index.html`);
    });
    if (paths.length && !publishesIndex) {
      out.push(finding(rule, {
        file: CONFIG_PATH,
        what: 'no publish path carries an index.html — the deployed site\'s "/" would 404',
        fix: 'add the site\'s index.html (or the directory holding it) to publish_paths',
      }));
    }
    return out;
  },
};

export default rule;
