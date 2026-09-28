// What a repo says about its Pages deployment — `.github/site.config`, the one file
// the deploy workflow's build step, the release task and the checks all read — and
// the names of the vendored pieces. Every other file in this pack asks these
// questions here, and none asks the repo to repeat the answers anywhere else.
//
// REQUIRED AND FULLY EXPLICIT — three keys, no defaults. A default that "happens to
// match" a repo's layout silently publishes the wrong tree the day the layout or the
// default changes, and the published set is exactly the thing that must never be
// guessed:
//
//   publish_root    the directory the published site is rooted at ("." = the repo
//                   root). Every publish path is relative to it, and it is what
//                   becomes the site's "/".
//   publish_paths   the explicit publish set — the files and directories under
//                   publish_root that are copied into the artifact, and nothing
//                   else. Space-separated, relative to publish_root.
//   build_command   the command that produces whatever publish_paths names
//                   ("" = nothing to build, stated).
//
// The set is ADDITIVE on purpose. The rejected alternative — "publish the repo except
// the tooling" — publishes every draft, note and key nobody thought to exclude, and
// publishes each new one silently the day it lands. An additive list can only ever
// publish what the repo asked for, and its failure mode, a file that does not show
// up, is visible on the site and caught by `gp/site-config` before it merges.
//
// A missing file, a missing key, an unknown (typo'd) key and an empty required path
// key are all hard failures — a deploy that "worked" because a typo fell back to a
// default is the failure mode this shape exists to prevent.
//
// One key is OPTIONAL, and deliberately so:
//
//   build_vars      space-separated names of repo VARIABLES the build may read,
//                   exported into build_command's environment (absent = none).
//
// It is optional because the explicitness rule above exists to stop a default from
// silently publishing the WRONG TREE — and an absent build_vars cannot do that.
// Absent means the build sees no variables, which is what every site did before the
// key existed. What is NOT tolerated is a declared name with no value behind it:
// that is the silently half-configured build — a blank analytics token, an empty
// base URL — baked into a published page, so a declared-but-unset variable fails
// the run.
//
// VARIABLES, NEVER SECRETS. The build step is handed `toJSON(vars)`, a context that
// structurally cannot carry a secret. A value that must not appear in a published
// artifact has no business reaching the step whose output IS that artifact, so the
// boundary is enforced by which context the workflow passes, not by a convention
// someone has to remember.

export const CONFIG_PATH = '.github/site.config';

// The one vendored workflow: dispatched by the release task, never by a push.
export const DEPLOY_WORKFLOW_FILE = 'github-pages-deploy.yml';
export const DEPLOY_WORKFLOW_NAME = 'Deploy to GitHub Pages';
export const DEPLOY_WORKFLOW_PATH = `.github/workflows/${DEPLOY_WORKFLOW_FILE}`;

// Where the build step assembles the publish set, and what the workflow uploads.
export const SITE_DIR = '_site';

// Directories that must never appear in a publish set. Two of them are the agent
// tooling (whose skill symlinks dangle on a runner and whose content is nobody's
// business on the public web), one is the CI plumbing, one is the dependency tree.
// A floor, not the mechanism — the additive set is what keeps a draft or a key off
// the site — but these are what a "just publish everything" instinct reaches for
// first, so naming them fails fast with the reason attached.
export const NEVER_PUBLISHED = ['.claude', '.claudinite', '.github', 'node_modules'];

// The three required keys, plus the one optional key. `allowEmpty` marks the value
// whose empty form is a real, stated answer ("no build") rather than an omission;
// `optional` marks the key a config may leave out entirely.
export const KEYS = [
  { name: 'publish_root', allowEmpty: false },
  { name: 'publish_paths', allowEmpty: false },
  { name: 'build_command', allowEmpty: true },
  { name: 'build_vars', allowEmpty: true, optional: true },
];

// A build_vars entry becomes an environment variable name, so it must be one.
// Rejecting `FOO=bar` or `foo-bar` here means the failure lands on the config line
// that is wrong, not as an unbound shell name three steps later.
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

// dotenv-ish: KEY=value, one per line; # comments and blank lines ignored; the value
// may be wrapped in matching single or double quotes (so a command with trailing
// spaces or a leading # is expressible). Returns { values, errors }.
export function parseConfig(text) {
  const values = new Map();
  const errors = [];
  const known = new Set(KEYS.map((k) => k.name));

  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 1) {
      errors.push(`${CONFIG_PATH}:${i + 1}: '${line}' is not KEY=value`);
      return;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
      value = value.slice(1, -1);
    }
    if (!known.has(key)) {
      errors.push(`${CONFIG_PATH}:${i + 1}: unknown key '${key}' — the keys are ${[...known].join(', ')}`);
      return;
    }
    if (values.has(key)) errors.push(`${CONFIG_PATH}:${i + 1}: '${key}' is set twice`);
    values.set(key, value);
  });

  for (const { name, allowEmpty, optional } of KEYS) {
    if (!values.has(name)) {
      if (!optional) errors.push(`${CONFIG_PATH}: required key '${name}' is missing`);
    } else if (!allowEmpty && !values.get(name)) {
      errors.push(`${CONFIG_PATH}: '${name}' is empty — it must name a real path`);
    }
  }

  for (const name of (values.get('build_vars') ?? '').split(/\s+/).filter(Boolean)) {
    if (!ENV_NAME.test(name)) {
      errors.push(`${CONFIG_PATH}: build_vars entry '${name}' is not a variable name — list the repo variable NAMES to export, space-separated, never their values`);
    }
  }
  return { values, errors };
}

// The publish set as repo-relative paths: `root` as written, `siteRoot` as a prefix
// ("" for the repo root), the paths as written, and `fullOf` mapping one to where
// it sits in the repo.
export function publishSet(values) {
  const root = values.get('publish_root') || '.';
  const siteRoot = root === '.' ? '' : `${root.replace(/^\.\//, '').replace(/\/+$/, '')}/`;
  const paths = (values.get('publish_paths') ?? '').split(/\s+/).filter(Boolean);
  const fullOf = (p) => (p === '.' ? (siteRoot.replace(/\/$/, '') || '.') : `${siteRoot}${p}`);
  return { root, siteRoot, paths, fullOf };
}

// Has this repo adopted the standard? TWO INDEPENDENT SIGNALS, either sufficient —
// because the artifact the checks most need to catch missing IS one of them. Gating
// on the config alone would let a repo that vendored the workflow and never wrote
// its config pass silently, which is the one case `gp/site-config` exists to report.
export const adoptedPages = (ctx) => ctx.read(CONFIG_PATH) !== null || ctx.read(DEPLOY_WORKFLOW_PATH) !== null;
