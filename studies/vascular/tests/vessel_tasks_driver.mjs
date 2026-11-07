// Drives the vascular study's page in a GT stage (web/) in headless Chromium against a stand-in worker
// (stand_in.mjs) whose Execute answers with a model fixture. Checks req/vascular/model/run: Processing lists the
// algorithms with their icons, precision and recall, the default first, says how the chosen one works and how well, and Execute runs it with the spacing shown, opening
// its model; req/vascular/truth/tasks and req/vascular/truth/order: a row per step counted in areas, how many areas
// chosen, req/shell/ground-truth/tagging: nothing opens until Start GT tagging, Stop tagging gives the stack back; Lines
// opening from above, turning in 3D, its handles kept in depth from above and a tip dropped on a vessel attached there, Missed vessels, Junctions in 3D with an
// artifact dropped, Ctrl showing the model alone, Back to image and Back to task; req/vascular/truth/marks: an area done
// in every step blacked out of the stack while tagging, under the Show menu's Cut out what is done; req/vascular/model/ground-truth: Submit
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
// an area's place in the review, as the requirement orders them: rows top to bottom, each the way back from the last
const [W, H] = [model.size_px[0] * model.um_per_px, model.size_px[1] * model.um_per_px];
// (a curve point just outside the field is in the area at its edge)
const cell = (v, L) => Math.min(9, Math.max(0, Math.floor((v / L) * 10)));
const areaOf = (p) => { const r = cell(p.y, H), k = cell(p.x, W); return r * 10 + (r % 2 ? 9 - k : k); };

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
  await page.click("#gt-start");

  // the tasks are the stack's areas, each worked through in three steps
  t = await tasks();
  const r0 = await rows(), all = t.grid * t.grid;
  check(r0.length === 4 && r0[0] === `0/${all} Lines` && r0[1] === `0/${all} Missed vessels` && r0[2] === `0/${all} Junctions` && /Submit Ground Truth/.test(r0[3]),
    `a row per step, counted in areas: ${r0.join(" | ")}`);
  check(await page.evaluate(() => $("#gt-bar").children.length === 3), "the bar has a part per step");
  check(t.step === "lines" && t.area === 0 && t.focused, `Start GT tagging opens the walk on the first area's Lines, the area alone in view: ${JSON.stringify({ step: t.step, area: t.area, focused: t.focused })}`);
  v = await view();
  check(v.start === "Stop tagging" && v.open === "lines", `the button now reads Stop tagging, the Lines row open: ${v.start}`);
  check(v.focus === "Back to image" && v.big && !v.show, `in an area, a big Back to image button takes the Show menu's place: "${v.focus}", Show ${v.show ? "shown" : "hidden"}`);
  check(v.rot[2][2] > 0.99 && !v.held && v.mode === "overlay" && !!v.clip, `Lines shows the area alone, from straight above, the lines over the stack, free to turn: ${JSON.stringify({ z: v.rot[2][2], held: v.held, mode: v.mode, clip: v.clip })}`);

  // how many areas is the person's to choose
  await page.selectOption("#area-grid", "2");
  t = await tasks();
  check(t.grid === 2 && (await rows())[0] === "0/4 Lines" && Math.abs(t.box.x1 - W / 2) < 0.01 && t.box.x0 === 0 && t.box.y0 === 0, `choosing 2 × 2 makes four areas, the first the top-left quarter: ${JSON.stringify(t.box)}`);
  check(await page.evaluate(() => $("#area-map").children.length === 4 && $("#area-map .now") === $("#area-map").children[0]), "the map of the areas shows them, the current one marked");

  const mcv = () => page.evaluate(() => { const r = $("#mcv").getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  const [cx, cy, cw, ch] = await mcv();
  const rot0 = (await view()).rot;
  // dragging a handle from straight above moves its point across the picture, never in depth
  let m = await doc();
  const pts = await page.evaluate(() => window.vascular.model().points);
  // inside the current area, the top-left quarter, at least margin µm from its edges
  const inArea = (n, margin = 0) => n.x > margin && n.x < W / 2 - margin && n.y > margin && n.y < H / 2 - margin;
  const node = m.nodes.find((n) => pts[n.id] && n.x > W * 0.1 && n.x < W * 0.4 && n.y > H * 0.1 && n.y < H * 0.4);
  const [px, py] = pts[node.id];
  await page.mouse.move(cx + px, cy + py); await page.mouse.down(); await page.mouse.move(cx + px + 25, cy + py + 15, { steps: 5 }); await page.mouse.up();
  m = await doc();
  const moved = m.nodes.find((n) => n.id === node.id);
  check(moved && (moved.x !== node.x || moved.y !== node.y) && moved.z === node.z, `a handle drags its point across the picture and keeps its depth: (${node.x.toFixed(1)}, ${node.y.toFixed(1)}, ${node.z}) → (${moved?.x.toFixed(1)}, ${moved?.y.toFixed(1)}, ${moved?.z})`);
  check(JSON.stringify((await view()).rot) === JSON.stringify(rot0), "... and the view stays as it was");

  // a vessel's tip dragged onto another vessel's point is attached there, for a connection the algorithm missed
  {
    const d = await doc(), { points, at, kinds } = await page.evaluate(() => window.vascular.model());
    const degree = new Map();
    for (const e of d.edges) if (e.state !== "rejected") for (const id of [e.a, e.b]) degree.set(id, (degree.get(id) || 0) + 1);
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
    } else check(false, "a vessel's tip in the area, near another vessel's point, to attach");
  }

  // the area turns in 3D in Lines too
  await page.mouse.move(cx + 5, cy + ch - 5); await page.mouse.down(); await page.mouse.move(cx + 80, cy + ch - 60, { steps: 6 }); await page.mouse.up();
  check(JSON.stringify((await view()).rot) !== JSON.stringify(rot0), "in Lines a drag where no point is turns the area");

  // Lines are right: the area's confident vessels accepted, its low-confidence ones declined
  await page.click("#lines-ok");
  m = await doc(); t = await tasks();
  const nodeAt = new Map(m.nodes.map((n) => [n.id, n]));
  const mid = (e) => { const ps = [nodeAt.get(e.a), ...(e.via || []), nodeAt.get(e.b)]; return ps[ps.length >> 1]; };
  // (a vessel whose middle lies on the area's edge may fall either side, and a curve running past the field's edge is in
  // the area at that edge)
  const clear = (e) => { const p = mid(e); return Math.abs(p.x - W / 2) > 5 && Math.abs(p.y - H / 2) > 5; };
  const inQuarter = (p) => p.x < W / 2 && p.y < H / 2;
  const there = m.edges.filter((e) => e.proposed && clear(e) && inQuarter(mid(e))), elsewhere = m.edges.filter((e) => e.proposed && clear(e) && !inQuarter(mid(e)));
  check(there.length > 0 && there.every((e) => e.state === (e.proposed === "vessel" ? "accepted" : "rejected")) && elsewhere.every((e) => e.state === e.proposed),
    `Lines are right accepts the area's vessels and declines its low-confidence ones, and nothing elsewhere: ${there.length} there`);
  check(m.reviewed_regions?.length === 1 && m.reviewed_regions[0].step === "lines" && t.step === "missed" && t.area === 0, `... keeps the step done over the area, and moves to its Missed vessels: ${JSON.stringify(m.reviewed_regions)}`);
  check((await rows())[0] === "1/4 Lines", "the row counts the area");
  check(await page.evaluate(() => !!$("#gt-tasks li.now #m-draw") && !!$("#gt-tasks li.now #area-ok")), "Missed vessels offers Draw a missed vessel and No missed vessels here");

  // Ctrl shows the model alone while it is held
  await page.keyboard.down("Control");
  const held = (await view()).mode;
  await page.keyboard.up("Control");
  check(held === "model" && (await view()).mode === "overlay", `holding Ctrl shows the model alone, letting go the stack again: ${held} → ${(await view()).mode}`);

  await page.click("#area-ok");
  m = await doc(); t = await tasks(); v = await view();
  check(m.reviewed_regions.at(-1).step === "missed" && t.step === "junctions" && t.area === 0, `No missed vessels here checks the area and moves to its Junctions: ${t.step}`);
  check(!v.held && v.mode === "image" && v.rot[2][2] < 0.99 && !!v.clip, `Junctions shows the area in 3D, the stack alone, free to turn: ${JSON.stringify({ held: v.held, mode: v.mode, z: v.rot[2][2] })}`);
  check(await page.evaluate(() => !!$("#gt-tasks li.now #task-card canvas") && $("#task-card .verdict").children.length === 2), "the current junction is pictured in the box, its two verdicts under it");
  await page.keyboard.down("Control");
  const held3 = (await view()).mode;
  await page.keyboard.up("Control");
  check(held3 === "model" && (await view()).mode === "image", `in 3D too, Ctrl shows the model alone and letting go the stack: ${held3} → ${(await view()).mode}`);
  // the view turns in 3D
  const rot3 = (await view()).rot;
  await page.mouse.move(cx + 5, cy + ch - 5); await page.mouse.down(); await page.mouse.move(cx + 80, cy + ch - 60, { steps: 6 }); await page.mouse.up();
  check(JSON.stringify((await view()).rot) !== JSON.stringify(rot3), "in Junctions a drag turns the area");

  t = await tasks();
  const js = t.junctions;
  check(js.length > 2 && t.key === js[0].key, `the area's junctions come one at a time: ${js.length} here`);
  check(await page.evaluate(() => $("#area-done").disabled), "Area done is off while a junction there has no verdict");
  const j1 = Number(t.key.slice(1));
  await page.click("#task-card .verdict .yes");
  m = await doc(); t = await tasks();
  check(!!m.checked_junctions?.includes(j1) && t.key !== "j" + j1, `Junction marks it found right and moves on: ${m.checked_junctions}`);
  const j2 = t.key, n2 = t.junctions.length;
  await page.click("#task-card .verdict .no");
  t = await tasks();
  check(!t.junctions.some((x) => x.key === j2) && t.junctions.length < n2, `They cross splits the junction: ${n2} → ${t.junctions.length} junctions here`);

  // a vessel clicked on the view is dropped as an artifact
  // from straight above, two frames on, so the points' places on screen are the new view's
  await page.evaluate(async () => { const v = window.shellForTests.viewer.three; v.S.rot = v.facing(0, 0); v.redraw();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
  // a curve point of an accepted vessel in the area, well inside the view: its vessel is the one clicked
  const drop = await page.evaluate(([W, H]) => {
    const { points, at, kinds } = window.vascular.model(), r = $("#mcv").getBoundingClientRect();
    const id = Object.keys(points).find((k) => kinds[k] === "accepted-curve" && at[k].x > W * 0.05 && at[k].x < W * 0.45 && at[k].y > H * 0.05 && at[k].y < H * 0.45
      && points[k][0] > 20 && points[k][0] < r.width - 20 && points[k][1] > 20 && points[k][1] < r.height - 20);
    return id && points[id];
  }, [W, H]);
  if (drop) {
    const before = (await doc()).edges.filter((e) => e.state === "rejected").length;
    await page.mouse.click(cx + drop[0], cy + drop[1]);
    const menu = await page.evaluate(() => [...document.querySelectorAll("#ctx .item")].map((b) => b.textContent));
    check(menu.some((x) => /Drop this vessel/.test(x)), `clicking a vessel in 3D offers to drop it: ${menu}`);
    await page.locator("#ctx .item", { hasText: "Drop this vessel" }).click();
    check((await doc()).edges.filter((e) => e.state === "rejected").length > before, "Drop this vessel declines it");
  } else check(false, "a vessel of the area on screen to drop");

  // every junction judged, Area done ends the area
  for (let k = 0; k < 200 && (await tasks()).key; k++) await page.click("#task-card .verdict .yes");
  check(!(await page.evaluate(() => $("#area-done").disabled)), "Area done is on once every junction there has a verdict");
  await page.click("#area-done");
  m = await doc(); t = await tasks();
  check(m.reviewed_regions.at(-1).step === "junctions" && t.area === 1 && t.step === "lines", `Area done keeps the step and moves to the next area's Lines: area ${t.area} ${t.step}`);
  check((await rows()).slice(0, 3).join() === "1/4 Lines,1/4 Missed vessels,1/4 Junctions", `each row counts the area: ${(await rows()).join(" | ")}`);
  check(await page.evaluate(() => $("#area-map").children[0].classList.contains("done")), "the map shows the area done");

  // a finer choice keeps what was done over the areas it covers
  await page.selectOption("#area-grid", "4");
  check((await rows())[2] === "4/16 Junctions", `the top-left quarter done is four areas of 4 × 4: ${(await rows())[2]}`);
  await page.selectOption("#area-grid", "2");

  // Back to image: the whole stack, the Show menu again; Back to task returns
  await page.click("#vm-focus");
  v = await view(); t = await tasks();
  check(!t.focused && !v.clip && !v.held && v.show && v.focus === "Back to task", `Back to image shows the whole stack and the Show menu, the button now Back to task: ${JSON.stringify({ clip: v.clip, show: v.show, focus: v.focus })}`);
  const gl = await page.evaluate(() => !!document.createElement("canvas").getContext("webgl2"));
  if (gl) {
    const cut = await brightness();
    await page.keyboard.press("Control+z");
    const lit = await brightness();
    await page.keyboard.press("Control+y");
    check(cut < lit, `an area done in every step is cut out of the stack: brightness ${lit.toFixed(2)} → ${cut.toFixed(2)}`);
    await page.click("#vm-show summary"); await page.click("#m-cut"); await page.click("#vm-show summary");
    const whole = await brightness();
    check(Math.abs(whole - lit) < 1e-6, `the Show menu's Cut out what is done off: the stack whole: brightness ${whole.toFixed(2)}`);
    await page.click("#vm-show summary"); await page.click("#m-cut"); await page.click("#vm-show summary");
    check(Math.abs((await brightness()) - cut) < 1e-6, "and on again, cut out again");
  } else console.log(`not checked in this ${ENGINE}: the area cut out of the 3D view, which needs the WebGL2 it lacks`);
  await page.click("#vm-focus");
  v = await view(); t = await tasks();
  check(t.focused && !!v.clip && v.focus === "Back to image" && t.area === 1 && t.step === "lines", "Back to task returns to the area and its step");

  // Stop tagging: the whole stack, no task open, nothing cut out, the Show menu's row off
  await page.click("#gt-start");
  v = await view(); t = await tasks();
  check(!t.focused && !v.clip && v.show && !v.focus && !v.open && v.cut.off && v.start === "Start GT tagging", `Stop tagging gives the whole stack back, no task open, Cut out what is done off: ${JSON.stringify(v)}`);
  if (gl) {
    await page.keyboard.press("Control+z");
    const lit = await brightness();
    await page.keyboard.press("Control+y");
    check(Math.abs((await brightness()) - lit) < 1e-6, "out of tagging nothing is cut out of the stack");
  }
  await page.click("#gt-start");
  t = await tasks();
  check(t.focused && t.area === 1 && t.step === "lines", "Start GT tagging again returns to the walk's next step not done");

  await page.click("#gt-submit");
  check(await page.evaluate(() => $("#gt-dlg").open && !$("#gt-export").disabled), "Submit Ground Truth, the last task, exports once there are verdicts");
  const open = await page.evaluate(() => $("#gt-dlg").textContent);
  check(/Lines: 3 of 4 areas left/.test(open) && /Junctions: 3 of 4 areas left/.test(open), `its checklist says what of each step is open: ${open.replace(/\s+/g, " ").slice(0, 200)}`);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#gt-export")]);
  const out = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
  check(out.status === "corrected" && out.edges.some((e) => e.state === "accepted" && e.proposed === "vessel") && out.edges.some((e) => e.state === "rejected")
    && !!out.checked_junctions?.includes(j1) && out.reviewed_regions.map((g) => g.step).join() === "lines,missed,junctions", "the export carries every verdict: states, junctions found right, each step over the area");
  await page.click("#gt-close");

  await page.keyboard.press("Control+z");
  check((await doc()).reviewed_regions.length === 2 && (await rows())[2] === "0/4 Junctions", "Undo takes the area's last step back");
} catch (e) {
  failed = true; console.error(e);
}
await browser.close(); site.close();
process.exit(failed ? 1 : 0);
