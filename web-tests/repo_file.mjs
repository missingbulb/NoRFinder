// What a test's server sends for a path into the repo: a study's address (/web/<id>, or /web/ for the
// default study) is the page, as the build publishes it under each listed study's id; a file a study's generated
// names is its script's output, as the build writes it; anything else is the repo's own file.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function repoFile(repo, u) {
  const id = /^\/web\/([\w-]*)$/.exec(u)?.[1];
  if (id === "" || (id && fs.existsSync(path.join(repo, "studies", id, "study.json")))) return path.join(repo, "web", "index.html");
  return generated(repo, u) || path.join(repo, u);
}

const made = new Map();
function generated(repo, u) {
  const [, sid, rel] = /^\/studies\/([\w-]+)\/(.+)$/.exec(u) || [];
  const manifest = sid && path.join(repo, "studies", sid, "study.json");
  const script = manifest && fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest, "utf8")).generated?.[rel];
  if (!script) return null;
  if (!made.has(u)) {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "generated-")), path.basename(rel));
    fs.writeFileSync(out, execFileSync("python3", [script], { cwd: path.dirname(manifest) }));
    made.set(u, out);
  }
  return made.get(u);
}
