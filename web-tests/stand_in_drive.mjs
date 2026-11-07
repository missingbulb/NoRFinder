// A stand-in Google Drive and the page that reaches it, shared by the Data Management drivers: the folder ROOT (the
// files of a directory on disk, and its subdirectories as subfolders) served through the Drive API as a public folder,
// to the site's key and the signed-in user's token alike;
// the signed-in user's token approved for ROOT alone, and for the folders and files the page itself makes; the
// fixture study given ROOT as its root; a stand-in worker answering ANSWERS
// (tests/test_study_runs.py), which keeps the last file it was handed as self.lastOpen (the page reads and shows
// images itself), and answers the calls of a study ANSWERS' live names from that study's own Python (study_calls.py). Exits 2 when it cannot run.
import { EARLY } from "./early_messages.mjs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { repoFile } from "./repo_file.mjs";
import { ENGINE, LAUNCH } from "./engine.mjs";
import { offSite } from "./off_site.mjs";
import { cutShort } from "./page_errors.mjs";

// uploaded(file): each file the page creates or replaces, {name, bytes}
export async function standIn({ answers, studies, rootDir, uploaded = () => {}, gt = true }) {
  const require = createRequire(import.meta.url);
  let pw;
  try { pw = require("playwright"); } catch {
    try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
  }
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const ROOT = "dmrootfolder00000001", EMAIL = "tester@example.com";
  const sha = (b) => createHash("sha256").update(b).digest("hex");

  // the stand-in Drive: {id, name, parent, folder, bytes, mine, props, modified}; Drive's clock moves a second each write
  let next = 0, clock = Date.parse("2026-11-05T08:00:00Z");
  const tick = () => new Date(clock += 1000).toISOString();
  const FILES = [];
  const add = (dir, parent) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name), folder = fs.statSync(p).isDirectory(), id = folder ? "dmsubfolder" + String(next++).padStart(9, "0") : "dmfile" + String(next++).padStart(14, "0");
      FILES.push({ id, name, parent, folder, bytes: folder ? null : fs.readFileSync(p), mine: false, props: {}, modified: tick() });
      if (folder) add(p, id);
    }
  };
  add(rootDir, ROOT);
  const SUB = FILES.find((f) => f.folder)?.id ?? null;
  // gt: the study set up with review, its settings file in ROOT naming two ground-truth folders kept outside ROOT,
  // which Drive's sharing lets the user write to (req/shell/data/roles)
  const GT = { curated: "dmgtcurated000000000001", submissions: "dmgtsubmissions0000001" };
  if (gt) {
    FILES.push({ id: GT.curated, name: "GT curated", parent: "elsewhere", folder: true, bytes: null, mine: false, props: {}, modified: tick() },
      { id: GT.submissions, name: "GT submissions", parent: "elsewhere", folder: true, bytes: null, mine: false, props: {}, modified: tick() },
      { id: "dmsettings00000000001", name: "rauntruth-study.json", parent: ROOT, folder: false, mine: false, props: {}, modified: tick(),
        bytes: Buffer.from(JSON.stringify({ format: "rauntruth-study/1", data: null, curated: GT.curated, submissions: GT.submissions, review: true })) });
  }
  const approved = new Set([ROOT]);
  // the approved folders Drive lets the user only view
  const viewOnly = new Set();
  // the folders Drive's sharing lets the user write to, though the site was never approved for them
  const shared = new Set(gt ? [GT.curated, GT.submissions] : []);
  // who Drive's sharing lets write to ROOT, which makes them its study manager (req/shell/data/roles)
  const writers = new Set([EMAIL]);
  // the folders the page shared with anyone with the link
  const sharedOut = [];
  // what the token may write in: the folders approved, and the ones the page made
  const may = (id) => approved.has(id) || !!FILES.find((f) => f.id === id && f.folder && f.mine);
  const writes = [];
  // the names of files replaced asking Drive to keep the version they replace forever
  const keptForever = [];

  const rooted = (m) => (m.root ? { ...m, root: `https://drive.google.com/drive/folders/${ROOT}` } : m);
  const fixture = JSON.parse(fs.readFileSync(path.join(repo, "studies", "fixture", "study.json"), "utf8"));
  fixture.root = `https://drive.google.com/drive/folders/${ROOT}`;
  const STAND_IN = `
  const A = await (await fetch("answers.json")).json();
  const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  let id = new URL(self.location.href).searchParams.get("study");
  postMessage({ type: "ready", info: A.ready[id], heap: 0, files: 0 });
  onmessage = async ({ data: m }) => {
    if (m.type === "study") { id = m.id; postMessage({ type: "ready", info: A.ready[id], heap: 0, files: 0 }); }
    else if (m.type === "open") {
      self.lastOpen = { name: m.name, bytes: new Uint8Array(m.bytes) };
      postMessage({ type: "held" });
    }
    // a study ANSWERS names as live answers from its own Python, on the file it was handed last
    else if (m.type === "call" && A.live?.includes(id)) {
      let s = ""; for (let k = 0; k < self.lastOpen.bytes.length; k += 32768) s += String.fromCharCode(...self.lastOpen.bytes.subarray(k, k + 32768));
      const r = await (await fetch("/py", { method: "POST", body: JSON.stringify({ id, name: self.lastOpen.name, bytes: btoa(s), action: m.action, args: m.args }) })).json();
      if (r.error) throw new Error(r.error);
      const b = r.bytes == null ? null : bytes(r.bytes);
      postMessage({ type: "result", action: m.action, meta: r.meta, bytes: b, echo: m.echo }, b ? [b.buffer] : []);
    }
    else if (m.type === "call") { const b = bytes(A.mask); postMessage({ type: "result", action: m.action, meta: A.count, bytes: b, echo: m.echo }, [b.buffer]); }
  };`;
  const CONFIG = `window.NOR_CONFIG = { google: { apiKey: "stand-in", clientId: "123456-stand.apps.googleusercontent.com" } };`;
  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
  // the studies' own Python, for the live studies' calls: one request a line, answered in turn
  let py = null;
  const waiting = [];
  const ask = (body) => new Promise((ok) => {
    if (!py) {
      py = spawn("python3", [path.join(repo, "web-tests", "study_calls.py")], { stdio: ["pipe", "pipe", "inherit"] });
      let buf = "";
      py.stdout.on("data", (d) => { buf += d; for (let n; (n = buf.indexOf("\n")) >= 0; buf = buf.slice(n + 1)) waiting.shift()(buf.slice(0, n)); });
    }
    waiting.push(ok); py.stdin.write(body.replace(/\n/g, " ") + "\n");
  });
  // how many of the live studies' calls are on their way: to Python, or back to the page
  let calls = 0;
  const server = http.createServer((q, r) => {
    const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
    const send = (type, body) => { r.writeHead(200, { "content-type": type }); r.end(body); };
    if (u === "/py" && q.method === "POST") {
      const chunks = [];
      calls++;
      q.on("data", (c) => chunks.push(c)).on("end", async () => { send("application/json", await ask(Buffer.concat(chunks).toString())); setTimeout(() => calls--, 200); });
      return;
    }
    if (u === "/web/worker.js") return send("text/javascript", EARLY + STAND_IN);
    if (u === "/web/config.js") return send("text/javascript", CONFIG);
    if (u === "/web/vendor/wheels.json") return send("application/json", "[]");
    if (u === "/studies/fixture/study.json") return send("application/json", JSON.stringify(fixture));
    // every other study with a root has ROOT as its root here
    const named = u.match(/^\/studies\/([\w-]+)\/study\.json$/);
    if (named) return send("application/json", JSON.stringify(rooted(JSON.parse(fs.readFileSync(path.join(repo, "studies", named[1], "study.json"), "utf8")))));
    const f = u === "/web/answers.json" ? answers : u === "/web/studies.json" ? studies : repoFile(repo, u);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const browser = await pw[ENGINE].launch(LAUNCH);
  const done = async (code) => { await browser.close(); server.close(); py?.kill(); process.exit(code); };
  const check = async (ok, what, seen) => { if (!ok) { console.error("FAILED: " + what + (seen === undefined ? "" : ": " + JSON.stringify(seen))); await done(1); } console.log("ok: " + what); };
  // a page or a check gone wrong ends the run

  const json = (route, body, status = 200) => route.fulfill({ status, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: JSON.stringify(body) });
  const meta = (f) => ({ id: f.id, name: f.name, mimeType: f.folder ? "application/vnd.google-apps.folder" : /\.json$/.test(f.name) ? "application/json" : "image/tiff",
    modifiedTime: f.modified, properties: { ...f.props }, ...(f.folder ? {} : { size: String(f.bytes.length), sha256Checksum: sha(f.bytes) }) });
  // a multipart body's metadata and file bytes
  function parts(req) {
    const body = req.postDataBuffer(), boundary = "--" + req.headers()["content-type"].match(/boundary=(.+)$/)[1];
    const chunks = [];
    for (let at = body.indexOf(boundary); at >= 0; ) {
      const end = body.indexOf(boundary, at + boundary.length);
      if (end < 0) break;
      const part = body.subarray(at + boundary.length, end), head = part.indexOf("\r\n\r\n");
      chunks.push(part.subarray(head + 4, part.length - 2));
      at = end;
    }
    return { metadata: JSON.parse(chunks[0].toString()), bytes: Buffer.from(chunks[1]) };
  }
  async function google(route) {
    const req = route.request(), u = new URL(req.url()), auth = req.headers().authorization, method = req.method();
    const id = decodeURIComponent((u.pathname.match(/\/files\/?([^/]*)$/) || [])[1] || ""), fields = u.searchParams.get("fields") || "";
    if (u.pathname.startsWith("/upload/")) {
      if (method === "POST") {
        const { metadata, bytes } = parts(req);
        if (metadata.parents?.[0] === "appDataFolder") return json(route, { id: "settingsfile" });
        if (!may(metadata.parents[0])) return json(route, { error: { message: "The user has not granted the app write access to the folder" } }, 403);
        const f = { id: "dmmade" + String(next++).padStart(14, "0"), name: metadata.name, parent: metadata.parents[0], folder: false, bytes, mine: metadata.appProperties?.rauntruth === "made", props: {}, modified: tick() };
        FILES.push(f); writes.push(["create", f.name]); uploaded(f);
        return json(route, { id: f.id, sha256Checksum: sha(bytes) });
      }
      const f = FILES.find((g) => g.id === id);
      if (!f?.mine) return json(route, { error: { message: "File not found" } }, 404);
      f.bytes = req.postDataBuffer(); f.modified = tick(); writes.push(["replace", f.name]); uploaded(f);
      if (u.searchParams.get("keepRevisionForever") === "true") keptForever.push(f.name);
      return json(route, { id: f.id });
    }
    if (auth && method === "POST" && u.pathname.endsWith("/permissions")) {
      // a share the page makes on a folder it made
      const on = decodeURIComponent(u.pathname.split("/").at(-2)), f = FILES.find((g) => g.id === on);
      if (!f?.mine) return json(route, { error: { message: "File not found" } }, 404);
      sharedOut.push([f.name, JSON.parse(req.postData())]); writes.push(["share", f.name]);
      return json(route, { id: "anyoneWithLink" });
    }
    if (auth && method === "POST") {
      // a folder the page makes
      const m = JSON.parse(req.postData());
      if (!may(m.parents[0])) return json(route, { error: { message: "The user has not granted the app write access to the folder" } }, 403);
      const f = { id: "dmmadefolder" + String(next++).padStart(8, "0"), name: m.name, parent: m.parents[0], folder: true, bytes: null, mine: m.appProperties?.rauntruth === "made", props: {}, modified: tick() };
      FILES.push(f); writes.push(["folder", f.name]);
      return json(route, { id: f.id });
    }
    if (!id) {
      if (u.searchParams.get("spaces") === "appDataFolder") return json(route, { files: [] });
      const parent = u.searchParams.get("q").match(/'([^']+)' in parents/)[1];
      return json(route, { files: FILES.filter((f) => f.parent === parent).map(meta) });
    }
    if (auth) {
      // the signed-in user's token: the page's own files and the folders approved for it
      if (method === "PATCH") {
        const f = FILES.find((g) => g.id === id), body = JSON.parse(req.postData() || "{}");
        if (!f?.mine) return json(route, { error: { message: "File not found" } }, 404);
        if (body.properties) { Object.assign(f.props, body.properties); writes.push(["mark", f.name]); return json(route, { id }); }
        FILES.splice(FILES.indexOf(f), 1); writes.push(["trash", f.name]);
        return json(route, { id });
      }
      if (fields.includes("capabilities")) {
        // the token names who holds it, so ROOT's sharing can tell them apart
        if (id === ROOT && !writers.has(auth.split(":")[1] || EMAIL)) return json(route, { id, capabilities: { canAddChildren: false } });
        if (may(id)) return json(route, { id, capabilities: { canAddChildren: !viewOnly.has(id) } });
        return shared.has(id) ? json(route, { id, capabilities: { canAddChildren: true } }) : json(route, { error: { message: "File not found" } }, 404);
      }
      if (fields.includes("appProperties")) {
        const f = FILES.find((g) => g.id === id);
        return f?.mine ? json(route, { appProperties: { rauntruth: "made" } }) : json(route, { error: { message: "File not found" } }, 404);
      }
      // any other read: the token reads what the public folder holds (req/shell/drive/credentials)
    }
    if (id === ROOT) return json(route, { name: "Study folder one" });
    const f = FILES.find((g) => g.id === id);
    if (!f) return json(route, { error: { message: "File not found" } }, 404);
    if (u.searchParams.get("alt") !== "media") return json(route, meta(f));
    return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: "application/octet-stream", body: f.bytes });
  }

  const SIGNED_IN = { user: { name: "Tester", email: EMAIL, picture: null }, token: "stand-in-token", until: Date.now() + 3600e3,
    scopes: "openid email profile https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file" };
  // scopes: what the signed-in user's token may do, in place of SIGNED_IN's; email: who is signed in, in place of the
  // study's study manager; seed: browser keys kept before the page opens; id: the study opened, the fixture unless
  // named; study: what its study.json says otherwise for this page (its stage, say); prepare(ctx): routes of a
  // driver's own, taking precedence over these
  async function open(signedIn, { scopes, email, seed = {}, id = "fixture", study, prepare } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.route("https://www.googleapis.com/**", google);
    await ctx.route(offSite(origin, "https://www.googleapis.com/"), (r) => r.abort());
    const own = id === "fixture" ? fixture : rooted(JSON.parse(fs.readFileSync(path.join(repo, "studies", id, "study.json"), "utf8")));
    if (study) await ctx.route(`**/studies/${id}/study.json`, (r) => r.fulfill({ json: { ...own, ...study } }));
    if (prepare) await prepare(ctx);
    // the welcome popup answered before, and remembered (req/shell/account/welcome)
    await ctx.addInitScript(([who, seed]) => {
      delete Navigator.prototype.serviceWorker;
      if (who) localStorage.setItem("nor-google-sign-in", JSON.stringify(who));
      localStorage.setItem("nor-welcome", JSON.stringify({ choice: who ? "google" : "anonymous", remember: true }));
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
    }, [signedIn ? { ...SIGNED_IN, token: `stand-in-token:${email || EMAIL}`, ...(scopes ? { scopes } : {}), ...(email ? { user: { ...SIGNED_IN.user, email } } : {}) } : null, seed]);
    const page = await ctx.newPage();
    page.on("pageerror", async (e) => { if (cutShort(e)) return; console.error("page error: " + e.message); await done(1); });
    page.setDefaultTimeout(10000);
    await page.goto(origin + "/web/" + id);
    await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Ready"));
    return page;
  }


  // the role menu's choice (req/shell/account/role), the page then showing it
  async function role(page, name) {
    await page.click("#role-menu summary");
    await page.click(`#role-list .item:text-is("${name}")`);
    await page.waitForFunction((n) => document.querySelector("#role-name").textContent.trim() === n, name);
  }

  return { ROOT, FILES, SUB, GT, writers, writes, keptForever, approved, viewOnly, shared, sharedOut, open, role, check, done, origin, calls: () => calls };
}
