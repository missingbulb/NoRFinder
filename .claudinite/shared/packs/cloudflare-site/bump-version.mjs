#!/usr/bin/env node
// A SHIM, NOT THE BUMP. The version scheme and the page stamp are public-website's,
// and the working-tree bump is `packs/public-website/bump-version.mjs`; this pack's
// release reaches the scheme through that pack's `public/version.mjs` and never
// through this file.
//
// The path stays because this pack's own RULES.md once told sessions to run it, and a
// member's local prose may carry that line — prose no converge can rewrite
// (member-runnable-doc-paths.test.mjs). It delegates by spawning the sibling pack's
// bump with the same arguments, which resolves on any mount where public-website is
// declared — and the `cloudflare-site-keeps-its-version` record declares it on every
// member serving from Cloudflare.
// @legacy-tolerance advisory:none retire:#2113
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'public-website', 'bump-version.mjs');
if (!existsSync(target)) {
  console.error('bump-version: the version scheme is the public-website pack\'s now — declare public-website and run `node .claudinite/shared/packs/public-website/bump-version.mjs` instead');
  process.exitCode = 1;
} else {
  const { status } = spawnSync(process.execPath, [target, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exitCode = status ?? 1;
}
