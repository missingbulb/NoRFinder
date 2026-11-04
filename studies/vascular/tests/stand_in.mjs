// The vascular page's test surface: a local server for the site, with a stand-in for the study's Python worker
// that offers two algorithms (their names, icons and steps as the study's Python gives them), opens any file as a drawn stack as many slices deep as the given model, and answers
// Execute with that model, the arguments it was asked with in its "asked" field. The study is served in the
// stage asked for.
import { repoFile } from "../../../web-tests/repo_file.mjs";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

export const ALGORITHMS = [
  { key: "v5", name: "v5-no-short-islands", title: "island-free", icon: "🏝️", about: "- Start from the dead-end check's network\n- Drop every vessel shorter than 45 µm\n  - that touches no junction at either end" },
  { key: "v4", name: "v4-line-evidence", title: "dead-end check", icon: "🔍", about: "- Start from the bridges network\n- Drop a short dead end that is no line" },
];

// a stack as many slices deep as the model, its signal a grid of bright lines nowhere near most of the model's vessels
const standIn = (model) => `
const W = 120, H = 120, Z = ${model.slices}, n = W * H;
const vol = new Uint8Array(Z * n);
for (let z = 0; z < Z; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) vol[z * n + y * W + x] = (x % 17 < 2 || y % 23 < 2) ? 240 : 10;
const flat = new Uint8Array(n);
for (let z = 0; z < Z; z++) for (let i = 0; i < n; i++) flat[i] = Math.max(flat[i], vol[z * n + i]);
const meta = { W, H, Z, spacing: null, um: ${model.um_per_px} * ${model.size_px[0]} / W, um_y: ${model.um_per_px} * ${model.size_px[1]} / H,
  info: [["Slices", String(Z)]], channels: [{ name: "CD31", colour: "#ff0000" }] };
const MODEL = ${JSON.stringify(model)}, info = { algorithms: ${JSON.stringify(ALGORITHMS)} };
postMessage({ type: "ready", info });
onmessage = ({ data: m }) => {
  if (m.type === "study") postMessage({ type: "ready", info });
  else if (m.type === "open") { const images = new Uint8Array(flat.length + vol.length); images.set(flat); images.set(vol, flat.length); postMessage({ type: "opened", meta, images }, [images.buffer]); }
  else if (m.type === "call" && m.action === "extract")
    setTimeout(() => postMessage({ type: "result", action: "extract", meta: { ...MODEL, algorithm: info.algorithms.find((a) => a.key === m.args.algorithm).name, asked: m.args }, bytes: null }), 50);
};`;

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
// the server, on a free port: {origin, close()}
export async function serve(repo, studies, model, stage) {
  const server = http.createServer((q, r) => {
    const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
    if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(standIn(model)); }
    if (u === "/web/vendor/wheels.json") { r.writeHead(200, { "content-type": "application/json" }); return r.end("[]"); }
    if (u === "/studies/vascular/study.json") {
      r.writeHead(200, { "content-type": "application/json" });
      return r.end(JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(repo, u), "utf8")), stage }));
    }
    const f = u === "/web/studies.json" ? studies : repoFile(repo, u);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
