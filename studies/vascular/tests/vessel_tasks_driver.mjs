// Drives the vascular study's page in a GT stage (web/) in headless Chromium against a stand-in worker
// (stand_in.mjs) whose Execute answers with a model fixture. Checks req/vascular/model/run: Processing lists the
// algorithms with their icons, precision and recall, the default first, says how the chosen one works and how well, and Execute runs it with the spacing shown, opening
// its model; req/vascular/truth/tasks and req/vascular/truth/order: how many areas chosen first, a row per area, the
// areas' map floating over the view while tagging, req/shell/ground-truth/tagging: nothing opens until Start GT tagging,
// Stop tagging gives the stack back; an area opening from above, turning in 3D, its handles kept in depth from above, a
// tip dropped on a vessel attached there, a right-click on the image drawing a missed vessel, its junctions judged one at
// a time and picked on the view, Area is right, Ctrl showing the model alone, Back to image and Back to task, a file of
// the earlier three steps read; req/vascular/truth/marks: an area done blacked out of the stack while tagging, under the Show menu's Cut out what is done; req/vascular/model/ground-truth: Submit
// last, its export carrying every verdict. Exits 1 on a failed check, 2 when it cannot run.
//   node studies/vascular/tests/vessel_tasks_driver.mjs STUDIES
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { offSite } from "../../../web-tests/off_site.mjs";
import { ENGINE, LAUNCH } from "../../../web-tests/engine.mjs";
import { asTagger } from "../../../web-tests/tagger.mjs";
import { serve, ALGORITHMS, drawnStack } from "./stand_in.mjs";
import { standInDrive, openFromDrive } from "../../../web-tests/drive_open.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, "..", "..", "..");
const [studies] = process.argv.slice(2);
const model = JSON.parse(fs.readFileSync(path.join(here, "fixtures", "cd31_frontal_x20_r_1_slices1-12.vessels.json"), "utf8"));
const site = await serve(repo, studies, model, "GT");

const browser = await pw[ENGINE].launch(LAUNCH);
let failed = false;
const check = (ok, what) => { if (!ok) { failed = true; console.error("FAILED: " + what); } else console.log("ok: " + what); };
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
await asTagger(ctx);
await ctx.route(offSite(site.origin), (r) => r.abort());
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
await standInDrive(ctx);
const page = await ctx.newPage();
page.on("pageerror", (e) => { failed = true; console.error("page error: " + e.message); });
page.setDefaultTimeout(10000);

// the 3D view's brightness, the whole stack in view from above: its mean over every pixel of red, green and blue
const brightness = () => page.evaluate(async () => {
  const v = window.shellForTests.viewer.three;
  Object.assign(v.S, { rot: v.facing(0, 0), dist: v.FIT_DIST, pivot: [0, 0, 0], clip: null }); v.redraw();
  // the view draws in the frame after it is changed: two frames on, the change is on the canvas
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const gl = document.querySelector("#v3-gl"), c = document.createElement("canvas"); c.width = gl.width; c.height = gl.height;
  const g = c.getContext("2d"); g.drawImage(gl, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data; let s = 0;
  for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
  return s / (d.length / 4);
});
const tasks = () => page.evaluate(() => window.vascular.tasks());
const doc = () => page.evaluate(() => window.vascular.model().model);
const rows = () => page.evaluate(() => [...document.querySelectorAll("#gt-tasks > li")].map((li) => li.querySelector(".task-head .t, .task-head #gt-submit").textContent.trim()));
const [W, H] = [model.size_px[0] * model.um_per_px, model.size_px[1] * model.um_per_px];

try {
  await page.goto(site.origin + "/web/vascular");
  await page.waitForFunction(() => window.$ && $("#status").textContent.startsWith("Ready"));
  // the numbers the page shows are the shipped metrics file's, which the lab's grader writes
  const quality = JSON.parse(fs.readFileSync(path.join(repo, "studies", "vascular", "web", "algorithm_metrics.json"), "utf8"));
  const two = (x) => x.toFixed(2).replace(/^0/, "");
  await page.waitForFunction(() => /\bR\u00a0/.test($("#vm-algo").options[0]?.textContent || ""));
  const algos = await page.evaluate(() => ({ titles: [...$("#vm-algo").options].map((o) => o.textContent), value: $("#vm-algo").value,
    about: $("#vm-about summary").textContent, note: $("#vm-about-note").textContent, run: $("#vm-run").disabled, last: $("#model-set .row").lastElementChild.id,
    nested: !!$("#vm-about-note").querySelector("ul > li > ul > li"), bold: $("#vm-about-note").lastElementChild?.querySelector("strong")?.textContent || "" }));
  const listed = ALGORITHMS.map((a) => { const q = quality.versions[a.key]; return `${a.icon} ${a.title} (P\u00a0${two(q.precision)}\u00a0·\u00a0R\u00a0${two(q.recall)})`; });
  check(algos.titles.join() === listed.join() && algos.value === ALGORITHMS[0].key, `Processing lists each algorithm with its icon, name, precision and recall, the default first: ${algos.titles}`);
  check(algos.about === `How the ${ALGORITHMS[0].title} algorithm works` && algos.note.includes("touches no junction") && algos.nested,
    `How the algorithm works gives the chosen one's steps as a nested list: ${algos.about}`);
  const q0 = quality.versions[ALGORITHMS[0].key], said = `precision of ${q0.precision.toFixed(2)} and recall of ${q0.recall.toFixed(2)}`;
  check(algos.bold.startsWith(`Island-free algorithm shows ${said} on ${quality.curves} curves`) && /not the owner/.test(algos.note),
    `... and ends with its precision and recall in bold, judged by a model, not the owner: ${algos.bold}`);
  check(algos.run && algos.last === "vm-run", "Execute ends the box, off until a stack is open");

  await openFromDrive(page, { name: model.source, mimeType: "image/tiff", buffer: drawnStack(model) });
  await page.waitForFunction(() => !$("#vm-run").disabled);
  await page.evaluate(() => { $("#notice").hidden = true; });
  const before = await page.evaluate(() => ({ model: !$("#model-on").hidden, tasks: !$("#vm-tasks").hidden,
    modes: [...document.querySelectorAll("#model-mode button")].filter((b) => !b.disabled).map((b) => b.dataset.v),
    switch: !$("#switch").hidden, items: !!$("#items-view") && !$("#items-view").hidden }));
  check(!before.model && !before.tasks && before.modes.join() === "image", `a stack opens with no model until Execute: ${JSON.stringify(before)}`);
  check(!before.switch && !before.items, "while the study makes ground truth there is no item view and no switch to one");

  await page.selectOption("#vm-algo", "v4");
  await page.click("#vm-run");
  await page.waitForFunction(() => !$("#model-on").hidden);
  const ran = await doc();
  check(ran.algorithm === "v4-line-evidence" && ran.asked?.algorithm === "v4" && ran.asked.z_step === 1 && ran.asked.source === model.source,
    `Execute runs the chosen algorithm on the stack, with the spacing shown: ${JSON.stringify(ran.asked)}`);
  check(await page.evaluate(() => $('#model-mode [data-v="overlay"]').getAttribute("aria-pressed") === "true"), "the model opens over the stack");
  check(await page.evaluate(() => !!($("#model-set").compareDocumentPosition($("#tasks-box")) & Node.DOCUMENT_POSITION_FOLLOWING) && !$("#tasks-box").hidden && !$("#vm-tasks").hidden),
    "Ground Truth Tasks sits under Processing once a model is open");

  const view = () => page.evaluate(() => { const v = window.shellForTests.viewer.three; return { rot: v.S.rot.map((r) => [...r]), clip: v.S.clip && [...v.S.clip], held: !!v.S.held,
    mode: $("#model-mode [aria-pressed=true]")?.dataset.v, show: !$("#vm-show").hidden, focus: $("#vm-focus").hidden ? null : $("#vm-focus").textContent.trim(), big: $("#vm-focus").classList.contains("big"),
    cut: { on: $("#m-cut").checked, off: $("#m-cut").disabled }, start: $("#gt-start").offsetParent ? $("#gt-start").textContent.trim() : null, open: document.querySelector("#gt-tasks > li.now")?.dataset.task || null }; });
  // req/shell/ground-truth/tagging: Execute leaves the stack in view; nothing opens until Start GT tagging
  let t = await tasks(), v = await view();
  check(!t.focused && !v.clip && v.show && !v.focus && !v.open && v.mode === "overlay", `drawn, the whole stack stays in view as the Show menu sets it, no task open: ${JSON.stringify({ focused: t.focused, clip: v.clip, show: v.show, focus: v.focus, open: v.open })}`);
  check(v.start === "Start GT tagging" && v.cut.off, `Start GT tagging heads the tasks, and Cut out what is done is off out of tagging: ${JSON.stringify(v)}`);
  // out of tagging the model's points carry no handles on the main view, zoomed in or not; tagging, they do
  const zoomedHandles = () => page.evaluate(async () => { const v = window.shellForTests.viewer.three, d = v.S.dist; v.S.dist = v.FIT_DIST / 4; v.redraw();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const h = window.vascular.model().handles; v.S.dist = d; v.redraw(); return h; });
  check(await zoomedHandles() === false, "out of GT tagging, the model's points have no handles on the main view, even zoomed in");
  await page.click("#gt-start");
  check(await page.evaluate(() => window.vascular.model().handles) === true, "... and once tagging starts, they do");

  // the tasks are the stack's areas, a row each, 4 × 4 at first, the choice of how many first in the box
  t = await tasks();
  const r0 = await rows(), all = t.grid * t.grid;
  check(t.grid === 4 && r0.length === all + 1 && r0.slice(0, all).every((x, k) => x === `Area ${k + 1}`) && /Submit Ground Truth/.test(r0[all]),
    `a row per area, 4 × 4 at first, then Submit: ${r0.join(" | ")}`);
  check(await page.evaluate(() => $("#gt-bar").children.length === 16), "the bar has a part per area");
  check(await page.evaluate(() => !!($("#area-grid").compareDocumentPosition($("#gt-start")) & Node.DOCUMENT_POSITION_FOLLOWING)
    && !!($("#gt-start").compareDocumentPosition($("#gt-bar")) & Node.DOCUMENT_POSITION_FOLLOWING)), "how many areas is the box's first row, the bar after it");
  check(await page.evaluate(() => !$("#m-draw") && !$("#m-lasso") && ![...document.querySelectorAll("button")].some((b) => /Draw a missed vessel|No missed vessels|Area done|Lines are right|Mark a damaged area/.test(b.textContent)) && !/Hold Ctrl/.test(document.body.textContent)),
    "no Draw a missed vessel, No missed vessels here, Area done, Mark a damaged area or Ctrl note on the page");
  check(t.area === 0 && t.focused, `Start GT tagging opens the walk on the first area, alone in view: ${JSON.stringify({ area: t.area, focused: t.focused })}`);
  v = await view();
  check(v.start === "Stop tagging" && v.open === "a0", `the button now reads Stop tagging, the first area's row open: ${v.start} ${v.open}`);
  check(v.focus === "Back to image" && v.big && !v.show, `in an area, a big Back to image button takes the Show menu's place: "${v.focus}", Show ${v.show ? "shown" : "hidden"}`);
  check(v.rot[2][2] > 0.99 && !v.held && v.mode === "overlay" && !!v.clip, `the area shows alone, from straight above, the lines over the stack, free to turn: ${JSON.stringify({ z: v.rot[2][2], held: v.held, mode: v.mode, clip: v.clip })}`);
  const mini = () => page.evaluate(() => { const el = $("#gt-mini"), r = el?.getBoundingClientRect(), mm = getComputedStyle(document.documentElement).getPropertyValue("--mm-width");
    return el && { shown: el.checkVisibility(), cells: el.querySelectorAll(".mm-body button").length, now: [...el.querySelectorAll(".mm-body button")].findIndex((b) => b.classList.contains("now")),
      done: [...el.querySelectorAll(".mm-body button")].filter((b) => b.classList.contains("done")).length, width: Math.round(r.width),
      mm: parseFloat(mm), over: $("#image-view").contains(el) }; });
  let mm = await mini();
  check(mm?.shown && mm.over && mm.cells === 16 && mm.now === 0 && mm.width === mm.mm, `while tagging the areas float as a map over the view, the minimap's width, the current one marked: ${JSON.stringify(mm)}`);
  check(await page.evaluate(() => !!$("#gt-tasks li.now #task-card canvas") && $("#task-card .verdict").children.length === 2), "the area's current junction is pictured in the box, its two verdicts under it");

  // how many areas is the person's to choose
  await page.selectOption("#area-grid", "2");
  t = await tasks();
  check(t.grid === 2 && (await rows()).length === 5 && Math.abs(t.box.x1 - W / 2) < 0.01 && t.box.x0 === 0 && t.box.y0 === 0, `choosing 2 × 2 makes four areas, the first the top-left quarter: ${JSON.stringify(t.box)}`);
  mm = await mini();
  check(mm.cells === 4 && mm.now === 0, `the map shows the four areas, the first current: ${JSON.stringify(mm)}`);

  const mcv = () => page.evaluate(() => { const r = $("#mcv").getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  const [cx, cy, cw, ch] = await mcv();
  const rot0 = (await view()).rot;
  // dragging a handle from straight above moves its point across the picture, never in depth
  let m = await doc();
  const pts = await page.evaluate(() => window.vascular.model().points);
  // inside the current area, the top-left quarter, at least margin µm from its edges
  const inArea = (n, margin = 0) => n.x > margin && n.x < W / 2 - margin && n.y > margin && n.y < H / 2 - margin;
  const deg = (d) => { const g = new Map(); for (const e of d.edges) if (e.state !== "rejected") for (const id of [e.a, e.b]) g.set(id, (g.get(id) || 0) + 1); return g; };
  const node = m.nodes.find((n) => pts[n.id] && n.x > W * 0.1 && n.x < W * 0.4 && n.y > H * 0.1 && n.y < H * 0.4);
  const [px, py] = pts[node.id];
  await page.mouse.move(cx + px, cy + py); await page.mouse.down(); await page.mouse.move(cx + px + 25, cy + py + 15, { steps: 5 }); await page.mouse.up();
  m = await doc();
  const moved = m.nodes.find((n) => n.id === node.id);
  check(moved && (moved.x !== node.x || moved.y !== node.y) && moved.z === node.z, `a handle drags its point across the picture and keeps its depth: (${node.x.toFixed(1)}, ${node.y.toFixed(1)}, ${node.z}) → (${moved?.x.toFixed(1)}, ${moved?.y.toFixed(1)}, ${moved?.z})`);
  check(JSON.stringify((await view()).rot) === JSON.stringify(rot0), "... and the view stays as it was");

  // a vessel's tip dragged onto another vessel's point is attached there, a junction made
  {
    const d = await doc(), { points, at, kinds } = await page.evaluate(() => window.vascular.model());
    const degree = deg(d);
    const onScreen = (p) => p && p[0] > 20 && p[0] < cw - 20 && p[1] > 20 && p[1] < ch - 20;
    const near = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
    let pair = null;
    for (const e of d.edges) {
      if (e.state === "rejected" || pair) continue;
      for (const [tip, from] of [[e.a, e.b], [e.b, e.a]]) {
        if (degree.get(tip) !== 1 || !onScreen(points[tip]) || !inArea(at[tip], 10) || pair) continue;
        const own = [at[from], ...e.via];
        const to = Object.keys(at).find((k) => /^(vessel|accepted)-curve$/.test(kinds[k]) && onScreen(points[k]) && inArea(at[k], 10) && !own.some((p) => near(p, at[k]) < 1e-6)
          && near(at[k], at[tip]) > 8 && Math.hypot(points[k][0] - points[tip][0], points[k][1] - points[tip][1]) < 200);
        if (to) pair = [tip, +to];
      }
    }
    if (pair) {
      const [tip, to] = pair, [tx, ty] = points[tip], [qx, qy] = points[to];
      await page.mouse.move(cx + tx, cy + ty); await page.mouse.down(); await page.mouse.move(cx + qx, cy + qy, { steps: 8 }); await page.mouse.up();
      const after = await page.evaluate(() => window.vascular.model());
      check(!after.at[tip] && /-end$/.test(after.kinds[to] || ""), `a tip dropped on another vessel's point attaches there, the point now a junction: tip ${tip} → point ${to} (${after.kinds[to]})`);
      check((await tasks()).junctions.some((j) => j.key === `j${to}`), "... and the new junction is one of the area's to judge");
    } else check(false, "a vessel's tip in the area, near another vessel's point, to attach");
  }

  // the area turns in 3D
  await page.mouse.move(cx + 5, cy + ch - 5); await page.mouse.down(); await page.mouse.move(cx + 80, cy + ch - 60, { steps: 6 }); await page.mouse.up();
  check(JSON.stringify((await view()).rot) !== JSON.stringify(rot0), "a drag where no point is turns the area");
  const flat = () => page.evaluate(async () => { const v = window.shellForTests.viewer.three; v.S.rot = v.facing(0, 0); v.redraw();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });

  // a right-click on the image where no line is offers to draw a missed vessel, from that spot
  {
    await flat();
    const { points } = await page.evaluate(() => window.vascular.model());
    const ps = Object.values(points).filter(Boolean), far = ([x, y]) => ps.every((p) => Math.hypot(p[0] - x, p[1] - y) > 30);
    const spots = [];
    // the area fills a square in the middle of the view
    const side = Math.min(cw, ch) * 0.8, x0 = (cw - side) / 2, y0 = (ch - side) / 2;
    for (let i = 1; i < 16; i++) for (let j = 1; j < 16; j++) { const s = [x0 + side * i / 16, y0 + side * j / 16]; if (far(s)) spots.push(s); }
    check(spots.length >= 10, `spots on the image away from every point: ${spots.length}`);
    const menuNow = () => page.evaluate(() => (document.querySelector("#ctx").hidden ? [] : [...document.querySelectorAll("#ctx .item")].map((b) => b.textContent)));
    let from = null, menu = [];
    for (const s of spots.slice(0, 12)) {
      await page.mouse.click(cx + s[0], cy + s[1], { button: "right" });
      menu = await menuNow();
      if (menu.includes("Draw a missed vessel")) { from = s; break; }
      await page.keyboard.press("Escape");
    }
    check(!!from, `a right-click on the image offers Draw a missed vessel: ${menu}`);
    if (from) {
      const before = (await doc()).edges.length;
      await page.click("#ctx .item");
      const drawingNow = () => page.evaluate(() => !!$("#draw-note").textContent && !$("#draw-note").closest("[hidden]"));
      check(await drawingNow(), "... which starts drawing, its note in view");
      const to = spots.find((s) => Math.hypot(s[0] - from[0], s[1] - from[1]) > 60);
      await page.mouse.click(cx + to[0], cy + to[1]);
      await page.keyboard.press("Escape");
      const after = await doc();
      check(after.edges.length === before + 1 && !(await drawingNow()), `the right-clicked spot is the drawn vessel's first point, the next click its next: ${before} → ${after.edges.length} edges`);

      // drawn again, the line's end snaps onto a vessel's point under the pointer, as a dragged tip's target lights,
      // never onto the vessel just drawn; the click joins it there
      const seg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(a[0] + u * dx - p[0], a[1] + u * dy - p[1]); };
      let from2 = null;
      for (const s of spots.filter((s) => seg(s, from, to) > 30)) {
        await page.mouse.click(cx + s[0], cy + s[1], { button: "right" });
        if ((await menuNow()).includes("Draw a missed vessel")) { from2 = s; break; }
        await page.keyboard.press("Escape");
      }
      check(!!from2, "a second spot away from the drawn vessel to draw from");
      await page.click("#ctx .item");
      const to2 = spots.find((s) => seg(s, from, to) > 30 && Math.hypot(s[0] - from2[0], s[1] - from2[1]) > 60);
      await page.mouse.click(cx + to2[0], cy + to2[1]);
      const { points, at, kinds } = await page.evaluate(() => window.vascular.model());
      const onScreen = (p) => p && p[0] > 20 && p[0] < cw - 20 && p[1] > 20 && p[1] < ch - 20;
      const alone = (k) => Object.entries(points).every(([j, q]) => j === k || !q || Math.hypot(q[0] - points[k][0], q[1] - points[k][1]) > 30);
      const target = Object.keys(at).find((k) => /^(vessel|accepted)-curve$/.test(kinds[k]) && onScreen(points[k]) && inArea(at[k], 10) && alone(k));
      check(!!target, "a vessel's point in the area to draw to");
      if (target) {
        const [qx, qy] = points[target];
        await page.mouse.move(cx + qx + 5, cy + qy + 4, { steps: 3 });
        const snap = await page.evaluate(() => window.vascular.model().drawing);
        check(snap?.onto?.node === +target && Math.hypot(snap.end[0] - qx, snap.end[1] - qy) < 0.5,
          `over a vessel's point, the line being drawn ends on it, not at the pointer: ${JSON.stringify(snap)} vs point ${target} at ${qx.toFixed(1)}, ${qy.toFixed(1)}`);
        const mid = [(from2[0] + to2[0]) / 2, (from2[1] + to2[1]) / 2];
        await page.mouse.move(cx + mid[0], cy + mid[1], { steps: 3 });
        const own = await page.evaluate(() => window.vascular.model().drawing);
        check(own && !own.onto && Math.hypot(own.end[0] - mid[0], own.end[1] - mid[1]) < 0.5,
          `over the segment just drawn, the line ends at the pointer: ${JSON.stringify(own)}`);
        const n0 = (await doc()).edges.length;
        await page.mouse.click(cx + qx + 5, cy + qy + 4);
        const joined = await page.evaluate(() => window.vascular.model());
        check(joined.model.edges.length === n0 + 1 && /-end$/.test(joined.kinds[target]) && !(await drawingNow()),
          `the click there joins the drawn vessel to that point and ends drawing: ${n0} → ${joined.model.edges.length} edges, point ${target} ${joined.kinds[target]}`);
      }
      await page.keyboard.press("Escape");
    }
  }

  // a curve point's menu takes it out of its line, the two lines into it one; a segment's middle is split there into
  // two tips set a little apart
  {
    await flat();
    const { points, kinds } = await page.evaluate(() => window.vascular.model());
    const onScreen = (p) => p && p[0] > 20 && p[0] < cw - 20 && p[1] > 20 && p[1] < ch - 20;
    const at0 = (await page.evaluate(() => window.vascular.model())).at;
    const menuNow = () => page.evaluate(() => (document.querySelector("#ctx").hidden ? [] : [...document.querySelectorAll("#ctx .item")].map((b) => b.textContent)));
    const bend = Object.keys(kinds).find((k) => kinds[k] === "candidate-curve" && onScreen(points[k]) && inArea(at0[k], 10));
    check(!!bend, "a low-confidence vessel's curve point in the area");
    if (bend) {
      const n0 = (await doc()).edges.length, segs0 = (await page.evaluate(() => window.vascular.model())).kinds;
      await page.mouse.click(cx + points[bend][0], cy + points[bend][1], { button: "right" });
      const menu = await menuNow(), k = menu.findIndex((x) => /^Remove this point/.test(x));
      check(k >= 0, `a curve point's menu offers to remove it from its line: ${menu}`);
      if (k >= 0) {
        await page.click(`#ctx .item >> nth=${k}`);
        const after = await page.evaluate(() => window.vascular.model());
        check(!after.at[bend] && after.model.edges.length === n0 && Object.keys(after.kinds).length === Object.keys(segs0).length - 1,
          `... which takes it out, the line running on through its neighbours: ${n0} → ${after.model.edges.length} edges`);
      } else await page.keyboard.press("Escape");
    }
    const m1 = await page.evaluate(() => window.vascular.model()), d1 = await doc();
    // the middle of a segment between two curve points of one confident vessel, on screen and in the area
    let mid = null;
    for (const e of d1.edges) {
      if (mid || e.state !== "vessel" || e.via.length < 3) continue;
      const ids = Object.keys(m1.at).filter((k) => e.via.some((p) => Math.hypot(p.x - m1.at[k].x, p.y - m1.at[k].y) < 1e-6 && p.z === m1.at[k].z));
      for (let i = 0; i + 1 < ids.length && !mid; i++) {
        const p = m1.points[ids[i]], q = m1.points[ids[i + 1]];
        if (onScreen(p) && onScreen(q) && inArea(m1.at[ids[i]], 10) && Math.hypot(p[0] - q[0], p[1] - q[1]) > 40) mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      }
    }
    check(!!mid, "a segment in the area, long enough on screen to split");
    if (mid) {
      const n0 = d1.edges.length, tips0 = Object.values(m1.kinds).filter((k) => /-end$/.test(k)).length;
      await page.mouse.click(cx + mid[0], cy + mid[1], { button: "right" });
      const menu = await menuNow(), k = menu.indexOf("Split this segment here");
      check(k >= 0 && menu.includes("Delete this segment"), `a segment's menu offers Split this segment here beside Delete this segment: ${menu}`);
      if (k >= 0) {
        await page.click(`#ctx .item >> nth=${k}`);
        const after = await page.evaluate(() => window.vascular.model()), fresh = Object.keys(after.at).filter((id) => !m1.at[id]);
        const gap = fresh.length === 2 && Math.hypot(after.points[fresh[0]][0] - after.points[fresh[1]][0], after.points[fresh[0]][1] - after.points[fresh[1]][1]);
        check(fresh.length === 2 && fresh.every((id) => /-end$/.test(after.kinds[id])) && after.model.edges.length === n0 + 1 && gap > 6,
          `... which cuts it into two tips, set apart on screen: ${n0} → ${after.model.edges.length} edges, new points ${fresh.map((id) => after.kinds[id])}, ${gap && gap.toFixed(1)} px apart`);
      } else await page.keyboard.press("Escape");
    }
  }

  // Ctrl shows the model alone while it is held
  await page.keyboard.down("Control");
  const held = (await view()).mode;
  await page.keyboard.up("Control");
  check(held === "model" && (await view()).mode === "overlay", `holding Ctrl shows the model alone, letting go the lines over the stack again: ${held} → ${(await view()).mode}`);

  // the area's junctions, one at a time
  t = await tasks();
  const js = t.junctions;
  check(js.length > 2 && t.key === js.find((j) => !j.done).key, `the area's junctions come one at a time: ${js.length} here`);
  check(await page.evaluate(() => $("#area-ok").disabled), "Area is right is off while a junction there has no verdict");
  const j1 = Number(t.key.slice(1));
  await page.click("#task-card .verdict .yes");
  m = await doc(); t = await tasks();
  check(!!m.checked_junctions?.includes(j1) && t.key !== "j" + j1, `Junction marks it found right and moves on: ${m.checked_junctions}`);
  const j2 = t.key, n2 = t.junctions.length;
  await page.click("#task-card .verdict .no");
  t = await tasks();
  check(!t.junctions.some((x) => x.key === j2) && t.junctions.length < n2, `They cross splits the junction: ${n2} → ${t.junctions.length} junctions here`);
  // a junction clicked on the view becomes the one to judge
  {
    await flat();
    const { points } = await page.evaluate(() => window.vascular.model()), now = (await tasks()).key;
    const other = (await tasks()).junctions.find((j) => !j.done && j.key !== now && points[j.key.slice(1)]);
    if (other) {
      const [x, y] = points[other.key.slice(1)];
      await page.mouse.click(cx + x, cy + y);
      check((await tasks()).key === other.key, `a junction clicked on the view is the one to judge: ${now} → ${(await tasks()).key} (wanted ${other.key})`);
    } else check(false, "a second junction of the area on screen to click");
  }

  // every junction judged, Area is right does the area
  for (let k = 0; k < 200 && (await tasks()).key; k++) await page.click("#task-card .verdict .yes");
  check(!(await page.evaluate(() => $("#area-ok").disabled)), "Area is right is on once every junction there has a verdict");
  await page.click("#area-ok");
  m = await doc(); t = await tasks();
  const nodeAt = new Map(m.nodes.map((n) => [n.id, n]));
  const mid = (e) => { const ps = [nodeAt.get(e.a), ...(e.via || []), nodeAt.get(e.b)]; return ps[ps.length >> 1]; };
  // (a vessel whose middle lies on the area's edge may fall either side, and a curve running past the field's edge is in
  // the area at that edge)
  const clear = (e) => { const p = mid(e); return Math.abs(p.x - W / 2) > 5 && Math.abs(p.y - H / 2) > 5; };
  const inQuarter = (p) => p.x < W / 2 && p.y < H / 2;
  const there = m.edges.filter((e) => e.proposed && clear(e) && inQuarter(mid(e))), elsewhere = m.edges.filter((e) => e.proposed && clear(e) && !inQuarter(mid(e)));
  check(there.length > 0 && there.every((e) => e.state === (e.proposed === "vessel" ? "accepted" : "rejected")) && elsewhere.every((e) => e.state === e.proposed),
    `Area is right accepts the area's vessels and declines its low-confidence ones, and nothing elsewhere: ${there.length} there`);
  check(m.reviewed_regions?.length === 1 && m.reviewed_regions[0].step === "area" && t.area === 1, `... keeps the area done and moves to the next: ${JSON.stringify(m.reviewed_regions)} area ${t.area}`);
  const doneRows = () => page.evaluate(() => [...document.querySelectorAll("#gt-tasks > li.done")].map((li) => li.dataset.task));
  check((await doneRows()).join() === "a0", `the first area's row is done: ${await doneRows()}`);
  mm = await mini();
  check(mm.done === 1 && mm.now === 1, `the map shows the area done and the next current: ${JSON.stringify(mm)}`);
  check(await page.evaluate(() => { const ps = [...$("#gt-bar").children]; return ps.length === 4 && parseFloat(ps[0].style.getPropertyValue("--done")) === 1; }), "the bar's first part is full");

  // a finer choice keeps what was done over the areas it covers
  await page.selectOption("#area-grid", "4");
  check((await doneRows()).join() === "a0,a1,a6,a7", `the top-left quarter done is four areas of 4 × 4: ${await doneRows()}`);
  await page.selectOption("#area-grid", "2");

  // Back to image: the whole stack, the Show menu again, the map still over it; Back to task returns
  await page.click("#vm-focus");
  v = await view(); t = await tasks();
  check(!t.focused && !v.clip && !v.held && v.show && v.focus === "Back to task", `Back to image shows the whole stack and the Show menu, the button now Back to task: ${JSON.stringify({ clip: v.clip, show: v.show, focus: v.focus })}`);
  check((await mini()).shown, "the map of the areas shows over the whole stack too");
  const gl = await page.evaluate(() => !!document.createElement("canvas").getContext("webgl2"));
  if (gl) {
    const cut = await brightness();
    await page.keyboard.press("Control+z");
    const lit = await brightness();
    await page.keyboard.press("Control+y");
    check(cut < lit, `an area done is cut out of the stack: brightness ${lit.toFixed(2)} → ${cut.toFixed(2)}`);
    await page.click("#vm-show summary"); await page.click("#m-cut"); await page.click("#vm-show summary");
    const whole = await brightness();
    check(Math.abs(whole - lit) < 1e-6, `the Show menu's Cut out what is done off: the stack whole: brightness ${whole.toFixed(2)}`);
    await page.click("#vm-show summary"); await page.click("#m-cut"); await page.click("#vm-show summary");
    check(Math.abs((await brightness()) - cut) < 1e-6, "and on again, cut out again");
  } else console.log(`not checked in this ${ENGINE}: the area cut out of the 3D view, which needs the WebGL2 it lacks`);
  await page.click("#vm-focus");
  v = await view(); t = await tasks();
  check(t.focused && !!v.clip && v.focus === "Back to image" && t.area === 1, "Back to task returns to the area");

  // Stop tagging: the whole stack, no task open, nothing cut out, the Show menu's row off, no map
  await page.click("#gt-start");
  v = await view(); t = await tasks();
  check(!t.focused && !v.clip && v.show && !v.focus && !v.open && v.cut.off && v.start === "Start GT tagging", `Stop tagging gives the whole stack back, no task open, Cut out what is done off: ${JSON.stringify(v)}`);
  check(!(await mini()).shown, "out of tagging the map of the areas is gone");
  if (gl) {
    await page.keyboard.press("Control+z");
    const lit = await brightness();
    await page.keyboard.press("Control+y");
    check(Math.abs((await brightness()) - lit) < 1e-6, "out of tagging nothing is cut out of the stack");
  }
  await page.click("#gt-start");
  t = await tasks();
  check(t.focused && t.area === 1, "Start GT tagging again returns to the walk's next area not done");

  await page.click("#gt-submit");
  check(await page.evaluate(() => $("#gt-dlg").open && !$("#gt-export").disabled), "Submit Ground Truth, the last task, exports once there are verdicts");
  const open = await page.evaluate(() => $("#gt-dlg").textContent);
  check(/Areas: 3 of 4 left/.test(open), `its checklist says how many areas are left: ${open.replace(/\s+/g, " ").slice(0, 200)}`);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#gt-export")]);
  const out = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
  check(out.status === "corrected" && out.edges.some((e) => e.state === "accepted" && e.proposed === "vessel") && out.edges.some((e) => e.state === "rejected")
    && !!out.checked_junctions?.includes(j1) && out.reviewed_regions.map((g) => g.step).join() === "area", "the export carries every verdict: states, junctions found right, the area done");
  await page.click("#gt-close");

  await page.keyboard.press("Control+z");
  check(!(await doc()).reviewed_regions.length && !(await doneRows()).length, "Undo takes the area back");

  // a file from the three steps: an area whose lines, missed and junctions boxes all cover it is done
  await page.evaluate(() => window.vascular.edit((m) => ({ ...m, reviewed_regions: ["lines", "missed", "junctions"].map((step) => ({ x: [0, m.size_px[0] * m.um_per_px / 2], y: [0, m.size_px[1] * m.um_per_px / 2], z: [0, m.slices - 1], step })) })));
  check((await doneRows()).join() === "a0", `an area its earlier lines, missed and junctions steps all cover is done: ${await doneRows()}`);
  await page.evaluate(() => window.vascular.edit((m) => ({ ...m, reviewed_regions: ["lines", "missed"].map((step) => ({ x: [0, m.size_px[0] * m.um_per_px / 2], y: [0, m.size_px[1] * m.um_per_px / 2], z: [0, m.slices - 1], step })) })));
  check(!(await doneRows()).length, "... and one missing its junctions step is not");
} catch (e) {
  failed = true; console.error(e);
}
await browser.close(); site.close();
process.exit(failed ? 1 : 0);
