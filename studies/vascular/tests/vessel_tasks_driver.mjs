// Drives the vascular study's page in a GT stage (web/) in headless Chromium against a stand-in worker
// (stand_in.mjs) whose Execute answers with a model fixture. Checks req/vascular/model/run: Processing lists the
// algorithms with their icons, precision and recall, the default first, says how the chosen one works and how well, and Execute runs it with the spacing shown, opening
// its model; req/vascular/truth/tasks and req/vascular/truth/order: the tasks under Processing, one row each, the
// items area by area, a verdict moving on, Skip, a junction found right or split, the areas checked one by one;
// req/vascular/truth/marks: a checked area blacked out of the stack; req/vascular/model/ground-truth: Submit
// last, its export carrying every verdict. Exits 1 on a failed check, 2 when it cannot run.
//   node studies/vascular/tests/vessel_tasks_driver.mjs STUDIES
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { offSite } from "../../../web-tests/off_site.mjs";
import { ENGINE } from "../../../web-tests/engine.mjs";
import { asTagger } from "../../../web-tests/tagger.mjs";
import { serve, ALGORITHMS } from "./stand_in.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, "..", "..", "..");
const [studies] = process.argv.slice(2);
const model = JSON.parse(fs.readFileSync(path.join(here, "fixtures", "cd31_frontal_x20_r_1_slices1-12.vessels.json"), "utf8"));
const site = await serve(repo, studies, model, "GT");

const browser = await pw[ENGINE].launch();
let failed = false;
const check = (ok, what) => { if (!ok) { failed = true; console.error("FAILED: " + what); } else console.log("ok: " + what); };
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
await asTagger(ctx);
await ctx.route(offSite(site.origin), (r) => r.abort());
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
const page = await ctx.newPage();
page.on("pageerror", (e) => { failed = true; console.error("page error: " + e.message); });
page.setDefaultTimeout(10000);

// the 3D view's brightness, the whole stack in view from above: its mean over every pixel of red, green and blue
const brightness = () => page.evaluate(async () => {
  const v = window.shellForTests.viewer.three;
  Object.assign(v.S, { rot: v.facing(0, 0), dist: v.FIT_DIST, pivot: [0, 0, 0], clip: null }); v.redraw();
  await new Promise((r) => setTimeout(r, 400));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const gl = document.querySelector("#v3-gl"), c = document.createElement("canvas"); c.width = gl.width; c.height = gl.height;
  const g = c.getContext("2d"); g.drawImage(gl, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data; let s = 0;
  for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
  return s / (d.length / 4);
});
const tasks = () => page.evaluate(() => window.vascular.tasks());
const doc = () => page.evaluate(() => window.vascular.model().model);
const rows = () => page.evaluate(() => [...document.querySelectorAll("#gt-tasks > li")].map((li) => li.querySelector(".task-head .t, .task-head #vm-truth").textContent.trim()));
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

  await page.setInputFiles("#file", { name: model.source, mimeType: "image/tiff", buffer: Buffer.from([0x49, 0x49, 42, 0]) });
  await page.waitForFunction(() => !$("#vm-run").disabled);
  await page.evaluate(() => { $("#notice").hidden = true; });
  const before = await page.evaluate(() => ({ model: !$("#model-on").hidden, tasks: !$("#tasks-box").hidden,
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
  check(await page.evaluate(() => !!($("#model-set").compareDocumentPosition($("#tasks-box")) & Node.DOCUMENT_POSITION_FOLLOWING) && !$("#tasks-box").hidden),
    "Ground Truth Tasks sits under Processing once a model is open");

  const r0 = await rows();
  check(/^0\/\d+ Vessels$/.test(r0[0]) && /^0\/\d+ Low-confidence$/.test(r0[1]) && /^0\/\d+ Junctions$/.test(r0[2]) && r0[3] === "0/100 Areas" && /Submit Ground Truth/.test(r0[4]),
    `a row per task, done over all: ${r0.join(" | ")}`);
  check(await page.evaluate(() => $("#gt-bar").children.length === 4), "the bar has a part per task");
  let t = await tasks();
  const sizes = ["vessels", "candidates", "junctions"].map((k) => t.lists[k].length);
  check(sizes.every((n) => n > 5), `each task has items to order: ${sizes}`);
  const ordered = (xs) => xs.map((x) => areaOf(x.at)).every((a, i, all) => !i || all[i - 1] <= a);
  const unordered = ["vessels", "candidates", "junctions"].filter((k) => !ordered(t.lists[k]));
  check(!unordered.length, `each task's items come area by area: ${unordered.map((k) => `${k} ${t.lists[k].map((x) => areaOf(x.at)).join(",")}`)}`);
  check(t.task === "vessels" && t.key === t.lists.vessels[0].key, `the open task is the first not done, at its first item: ${t.task} ${t.key}`);
  check(await page.evaluate(() => { const c = $("#task-card canvas"); return !!c && c.getBoundingClientRect().width >= $("#gt-tasks").clientWidth - 2 && $("#task-card .verdict").children.length === 2; }),
    "the item's picture takes the box's width, its two verdicts under it");
  check(await page.evaluate(() => !!$("#gt-tasks li.now #task-tools") && !$("#task-tools").hidden), "the open task's row holds its cogwheel and Skip");

  const first = t.key;
  await page.click("#task-card .verdict .yes");
  t = await tasks();
  check(t.task === "vessels" && t.key === t.lists.vessels[1].key && t.lists.vessels[0].done, `Approve moves on to the next vessel: ${first} → ${t.key}`);
  check((await rows())[0].startsWith("1/"), "the row counts it done");
  const second = t.key;
  await page.click("#task-card .verdict .no");
  let m = await doc();
  const edgesOf = (key) => { const [a, b] = key.slice(1).split("-").map(Number); return m.edges.filter((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a)); };
  check(edgesOf(first).length && edgesOf(first).every((e) => e.state === "accepted" && e.proposed === "vessel") && edgesOf(second).length && edgesOf(second).every((e) => e.state === "rejected" && e.proposed === "vessel"),
    "the verdicts are the vessels' states, beside the state the extractor proposed");
  const third = (await tasks()).key;
  await page.click("#task-skip");
  t = await tasks();
  check(t.key !== third && !t.lists.vessels.find((x) => x.key === third).done, "Skip moves on, leaving the vessel for later");

  await page.click('#gt-tasks li[data-task="junctions"] button.t');
  t = await tasks();
  check(t.task === "junctions" && t.key === t.lists.junctions[0].key, "a task's row opens it at its first item not done");
  const j1 = Number(t.key.slice(1));
  await page.click("#task-card .verdict .yes");
  m = await doc();
  check(!!m.checked_junctions?.includes(j1) && (await tasks()).lists.junctions.find((x) => x.key === "j" + j1).done, `Junction marks it found right: ${m.checked_junctions}`);
  const j2 = (await tasks()).key, n2 = (await tasks()).lists.junctions.length;
  await page.click("#task-card .verdict .no");
  t = await tasks();
  check(!t.lists.junctions.some((x) => x.key === j2) && t.lists.junctions.length < n2 && t.task === "junctions", `They cross splits the junction into vessels that cross: ${n2} → ${t.lists.junctions.length} junctions`);

  await page.click('#gt-tasks li[data-task="missed"] button.t');
  t = await tasks();
  check(t.task === "missed" && t.area === 0 && t.box.x0 === 0 && t.box.y0 === 0 && Math.abs(t.box.x1 - W / 10) < 0.01, `the Areas task frames the first area: ${JSON.stringify(t.box)}`);
  check(await page.evaluate(() => window.shellForTests.viewer.three.S.rot[2][2] > 0.99), "the area is seen from straight above");
  const gl = await page.evaluate(() => !!document.createElement("canvas").getContext("webgl2"));
  const lit = gl ? await brightness() : 0;
  await page.click("#area-ok");
  t = await tasks(); m = await doc();
  const g = m.reviewed_regions?.[0];
  check(t.area === 1 && m.reviewed_regions?.length === 1 && g.x[0] === 0 && g.y[0] === 0 && g.z.join() === `0,${model.slices - 1}`,
    `No missed vessels here checks the area, through every slice, and moves to the next: area ${t.area}, ${JSON.stringify(g)}`);
  check((await rows())[3] === "1/100 Areas", "the row counts the area");
  if (gl) {
    const cut = await brightness();
    check(cut < lit, `a checked area is cut out of the stack: brightness ${lit.toFixed(2)} → ${cut.toFixed(2)}`);
  } else console.log(`not checked in this ${ENGINE}: the area cut out of the 3D view, which needs the WebGL2 it lacks`);

  await page.click("#vm-truth");
  check(await page.evaluate(() => $("#gt-dlg").open && !$("#gt-export").disabled), "Submit Ground Truth, the last task, exports once there are verdicts");
  const open = await page.evaluate(() => $("#gt-dlg").textContent);
  check(/vessels still to decide/.test(open) && /99 of 100 left/.test(open), `its checklist says what of each task is open: ${open.replace(/\s+/g, " ").slice(0, 200)}`);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#gt-export")]);
  const out = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
  check(out.status === "corrected" && out.edges.some((e) => e.state === "accepted" && e.proposed === "vessel") && out.edges.some((e) => e.state === "rejected" && e.proposed === "vessel")
    && !!out.checked_junctions?.includes(j1) && out.reviewed_regions?.length === 1, "the export carries every verdict: states, junctions found right, areas checked");
  await page.click("#gt-close");

  await page.keyboard.press("Control+z");
  t = await tasks();
  check((await doc()).reviewed_regions.length === 0 && (await rows())[3] === "0/100 Areas", "Undo takes the area's check back");
} catch (e) {
  failed = true; console.error(e);
}
await browser.close(); site.close();
process.exit(failed ? 1 : 0);
