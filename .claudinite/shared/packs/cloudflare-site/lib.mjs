// What the repo's own wrangler config says about the deployment: which tree is
// published, and which hostnames the Worker claims. Every other file in this pack
// asks these two questions, and none of them asks the repo to repeat the answers
// as config — the config file wrangler already reads is the one source.
//
// JSON only (`wrangler.json`/`wrangler.jsonc`). A TOML config is a legitimate
// wrangler setup and simply not one this pack reads: parsing a second
// configuration language to answer two questions buys nothing that moving the
// config does not, and `publishes-a-site-directory` says so where a repo meets it.

// The config filenames wrangler resolves, in its own precedence order.
export const WRANGLER_CONFIGS = ['wrangler.json', 'wrangler.jsonc'];

// The config in `paths`, at the repo root or one directory down — the same reach
// the cloudflare-workers pack fingerprints on, so a stray config in a fixture or
// example tree deeper in the tree is not mistaken for the deployment's.
export function wranglerConfigPath(paths = []) {
  const candidates = paths.filter((p) => {
    const parts = p.split('/');
    return parts.length <= 2 && WRANGLER_CONFIGS.includes(parts[parts.length - 1]);
  });
  // Shallowest first, then the extension order wrangler itself prefers.
  candidates.sort((a, b) => a.split('/').length - b.split('/').length
    || WRANGLER_CONFIGS.indexOf(a.split('/').pop()) - WRANGLER_CONFIGS.indexOf(b.split('/').pop()));
  return candidates[0] ?? null;
}

// JSONC to JSON: drop `//` and `/* */` comments that are not inside a string.
// Hand-written because the whole need is two comment forms over a file wrangler
// itself accepts, and a dependency for that is a dependency to keep.
export function stripJsonComments(text) {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (inLine) { if (c === '\n') { inLine = false; out += c; } continue; }
    if (inBlock) { if (c === '*' && next === '/') { inBlock = false; i += 1; } continue; }
    if (inString) {
      out += c;
      if (c === '\\') { out += next ?? ''; i += 1; } else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === '/' && next === '/') { inLine = true; i += 1; continue; }
    if (c === '/' && next === '*') { inBlock = true; i += 1; continue; }
    out += c;
  }
  return out;
}

// The parsed config, or null when it is absent or unparseable — the callers all
// have something to say about that themselves.
export function parseWranglerConfig(text) {
  if (typeof text !== 'string') return null;
  try { return JSON.parse(stripJsonComments(text)); } catch { return null; }
}

// The published tree, as a repo-relative path: `assets.directory` resolved against
// the directory holding the config, exactly as wrangler resolves it.
export function publishedDir(config, configPath = 'wrangler.json') {
  const dir = config?.assets?.directory;
  if (typeof dir !== 'string' || !dir.trim()) return null;
  const base = configPath.includes('/') ? `${configPath.slice(0, configPath.lastIndexOf('/'))}/` : '';
  const normalized = dir.replace(/^\.\//, '').replace(/\/+$/, '');
  return `${base}${normalized}`;
}

// The hostnames the deploy attaches as custom domains — the ones a visitor types,
// and the ones a record inherited from a previous host can block or shadow.
export function claimedHostnames(config) {
  const routes = Array.isArray(config?.routes) ? config.routes : [];
  return routes
    .filter((r) => r && r.custom_domain === true && typeof r.pattern === 'string')
    .map((r) => r.pattern);
}

// The Cloudflare Web Analytics beacon token is public — it ships in the client — so it
// rides a repository VARIABLE and is substituted into the copy being uploaded, never
// into the commit. A loader carrying this placeholder no-ops while it is still in
// place. Here rather than in the release worker because the check that keeps a real
// token out of the tree names it too, and a check may not drag a task's worker (and
// its imports) into every sweep.
export const BEACON_PLACEHOLDER = 'REPLACE_WITH_CLOUDFLARE_WEB_ANALYTICS_TOKEN';
