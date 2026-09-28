import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { isPage, STAMP, VERSION_RECORD } from '../public/version.mjs';

// WHY. A page names the released version in a `title="version …"` attribute, so a
// visitor can say which build they are looking at. That number is a copy of
// `package.json`'s version — the single record a release advances — and a copy that
// drifts is worse than no number at all: it names a build that is not the one being
// served, and nothing about the page looks wrong.
//
// The copy is generated, not hand-maintained: the bump writes the version into
// `package.json` and stamps it into every page that carries the attribute, in the
// same run. This rule is that generator's drift guard — it fires on what a
// hand-edit, a half-applied release, or a page added without the stamp all look
// like.
//
// SCOPE. Every tracked page that carries a stamp, wherever it sits: the stamp is the
// page's own opt-in, and this pack knows nothing about which directory is served. A
// page without one has made no claim to check.

const rule = {
  id: 'public-website/version-stamp-matches-package',
  on_fail: 'block',
  since: '2026-09-13',
  description: "A page's version stamp must carry package.json's version",
  doc: 'packs/public-website/RULES.md',
  why: 'the stamp is the only place a visitor can read which build they are on, and a stale copy names a build that was never served',

  run(ctx) {
    const record = ctx.read(VERSION_RECORD);
    if (record === null) return [];
    let version;
    try { version = JSON.parse(record).version; } catch { return []; }
    if (!version) return [];

    const out = [];
    const pages = [...new Set([...ctx.tracked, ...(ctx.files || [])])].filter(isPage);
    for (const page of pages) {
      const text = ctx.read(page);
      if (text === null) continue;
      text.split('\n').forEach((line, i) => {
        for (const [stamp] of line.matchAll(STAMP)) {
          const stamped = stamp.slice('title="version '.length, -1);
          if (stamped === version) continue;
          out.push(finding(rule, {
            file: page,
            line: i + 1,
            what: `the page names version ${stamped}, but ${VERSION_RECORD} says ${version}`,
            fix: 'run `node .claudinite/shared/packs/public-website/bump-version.mjs --stamp-only` — it stamps every page from package.json and consumes no version number; never hand-edit either side',
          }));
        }
      });
    }
    return out;
  },
};

export default rule;
