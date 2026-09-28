#!/usr/bin/env node
// The deploy workflow's one `run:` step: read `.github/site.config`, export the build
// variables it declares, run its build command, and assemble the publish set into
// `_site` for the upload step. It runs FROM THE MOUNT, so how the config is read,
// how the variables reach the build and how the set is assembled change with the
// pack and never with the vendored workflow file.
//
// Two loud guards on the assembly, because a Pages deploy has no other reviewer: a
// publish path that does not exist fails the run (a rename that silently dropped a
// directory from the site is exactly what the explicit list is for), and so does an
// assembled site with no index.html at its root (a site whose "/" 404s is a broken
// deploy, not a deploy). `gp/site-config` holds the same two on the repo, so a
// release that reaches this step has already passed them once.
import { execSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { removeTree } from '../../engine/remove-tree.mjs';
import { CONFIG_PATH, parseConfig, publishSet, SITE_DIR } from './lib.mjs';

// The declared build variables against the repo's `vars`. A DECLARED NAME WITH NO
// VALUE IS A HARD FAILURE: exporting an empty string instead would give the config's
// whole failure mode one level down — the build succeeds, the page ships, and the
// feature that needed the value is silently dead on the live site. Unset and empty
// are the same failure: nothing usable behind the name.
export function resolveBuildVars(declaredText, repoVars) {
  const resolved = [];
  const missing = [];
  for (const name of (declaredText ?? '').split(/\s+/).filter(Boolean)) {
    const value = repoVars?.[name];
    if (value === undefined || value === null || value === '') missing.push(name);
    else resolved.push([name, String(value)]);
  }
  return { resolved, missing };
}

const filesUnder = (dir, base = dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const path = join(dir, e.name);
  return e.isDirectory() ? filesUnder(path, base) : [relative(base, path)];
});

// Copy the publish set under `root` into `root/dest`, freshly. Returns the files the
// assembled site holds, for the run summary.
export function assemble(root, values, dest = SITE_DIR) {
  const { siteRoot, paths, fullOf } = publishSet(values);
  const target = join(root, dest);
  removeTree(target);
  mkdirSync(target, { recursive: true });
  for (const p of paths) {
    const source = join(root, fullOf(p));
    if (!existsSync(source)) {
      throw new Error(`publish path '${p}' does not exist under '${siteRoot || '.'}' — fix ${CONFIG_PATH} or restore the file`);
    }
    const to = p === '.' ? target : join(target, p);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(source, to, { recursive: true });
  }
  if (!existsSync(join(target, 'index.html'))) {
    throw new Error("the assembled site has no index.html at its root — the site's / would 404");
  }
  return filesUnder(target).sort();
}

export function main(root = process.cwd(), env = process.env) {
  let text;
  try {
    text = readFileSync(join(root, CONFIG_PATH), 'utf8');
  } catch {
    throw new Error(`${CONFIG_PATH} is missing — a Pages repo declares its publish set explicitly there`);
  }
  const { values, errors } = parseConfig(text);
  if (errors.length) throw new Error(errors.join('\n'));

  let repoVars;
  try {
    repoVars = JSON.parse(env.REPO_VARS_JSON || '{}');
  } catch {
    throw new Error('REPO_VARS_JSON is not valid JSON — the workflow must pass ${{ toJSON(vars) }}');
  }
  const { resolved, missing } = resolveBuildVars(values.get('build_vars'), repoVars);
  if (missing.length) {
    throw new Error(`${CONFIG_PATH} declares ${missing.length === 1 ? 'a build variable' : 'build variables'} with no value in this repo: ${missing.join(', ')}. `
      + 'Set them under Settings → Secrets and variables → Actions → Variables, or drop the name from build_vars. '
      + 'Failing here rather than building with a blank value, which would publish a page with the feature silently dead.');
  }
  // Names only in the log — the values belong in the build's environment.
  if (resolved.length) console.log(`build-site: exported ${resolved.map(([n]) => n).join(', ')}`);

  const build = values.get('build_command');
  if (build) {
    console.log(`build-site: ${build}`);
    execSync(build, { cwd: root, stdio: 'inherit', shell: '/bin/bash', env: { ...env, ...Object.fromEntries(resolved) } });
  }

  const files = assemble(root, values);
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `### Published set\n\n${files.map((f) => `- ${f}`).join('\n')}\n`);
  }
  console.log(`build-site: assembled ${SITE_DIR} (${files.length} files)`);
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (e) { console.error(`::error::${e.message}`); process.exitCode = 1; }
}
