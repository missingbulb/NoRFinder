// The vascular page's test surface: a local server for the site, with a stand-in for the study's Python worker
// that offers two algorithms (their names, icons and steps as the build lists them), a drawn stack to open as many
// slices deep as the given model (drawnStack), and answers
// Execute with that model, the arguments it was asked with in its "asked" field. The study is served in the
// stage asked for.
import { writeTiff } from "../../../web/split.js";
import { EARLY } from "../../../web-tests/early_messages.mjs";
import { repoFile } from "../../../web-tests/repo_file.mjs";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

export const ALGORITHMS = [
  { key: "v5", name: "v5-no-short-islands", title: "island-free", icon: "🏝️", about: "- Start from the dead-end check's network\n- Drop every vessel shorter than 45 µm\n  - that touches no junction at either end" },
  { key: "v4", name: "v4-line-evidence", title: "dead-end check", icon: "🔍", about: "- Start from the bridges network\n- Drop a short dead end that is no line" },
];

// a CD31 stack as many slices deep as the model and over the model's field, its signal a grid of bright lines nowhere
// near most of the model's vessels, as the TIFF a study's Drive folder would hold
export function drawnStack(model) {
  const W = 120, H = 120, Z = model.slices, n = W * H, planes = [];
  for (let z = 0; z < Z; z++) {
    const p = new Uint8Array(n);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) p[y * W + x] = (x % 17 < 2 || y % 23 < 2) ? 240 : 10;
    planes.push(p);
  }
  const res = (um) => [1e6, Math.round(um * 1e6)];
  return Buffer.from(writeTiff({ w: W, h: H, bps: 1, planes, xres: res((model.um_per_px * model.size_px[0]) / W), yres: res((model.um_per_px * model.size_px[1]) / H),
    description: `ImageJ=1.54f\nimages=${Z}\nslices=${Z}\nunit=micron\n` }));
}

const standIn = (model) => `
const MODEL = ${JSON.stringify(model)}, info = {}, ALGORITHMS = ${JSON.stringify(ALGORITHMS)};
postMessage({ type: "ready", info });
onmessage = ({ data: m }) => {
  if (m.type === "study") postMessage({ type: "ready", info });
  else if (m.type === "open") postMessage({ type: "held" });
  else if (m.type === "call" && m.action === "extract")
    postMessage({ type: "result", action: "extract", meta: { ...MODEL, algorithm: ALGORITHMS.find((a) => a.key === m.args.algorithm).name, asked: m.args }, bytes: null });
};`;

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
// the server, on a free port: {origin, close()}
export async function serve(repo, studies, model, stage) {
  const server = http.createServer((q, r) => {
    const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
    if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(EARLY + standIn(model)); }
    if (u === "/studies/vascular/web/algorithms.GENERATED.json") { r.writeHead(200, { "content-type": "application/json" }); return r.end(JSON.stringify(ALGORITHMS)); }
    if (u === "/web/vendor/wheels.json") { r.writeHead(200, { "content-type": "application/json" }); return r.end("[]"); }
    if (u === "/studies/vascular/study.json") {
      r.writeHead(200, { "content-type": "application/json" });
      // the drawn stack's levels shown as drawn
      const m = JSON.parse(fs.readFileSync(path.join(repo, u), "utf8"));
      return r.end(JSON.stringify({ ...m, stage, view: { ...m.view, stretch: false } }));
    }
    const f = u === "/web/studies.json" ? studies : repoFile(repo, u);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
