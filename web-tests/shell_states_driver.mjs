// Walks the shell's states (req/checks/shell-states) in a browser on the fixture study, against the stand-in Google of
// stand_in_drive.mjs serving ROOT: each path of EXPECT (shell-states.GENERATED.json) opens its root, takes its
// actions one after another, and at every state reads each element as shown, disabled, folded or gone, against what
// the rules expect. Every difference is reported, then the run fails. Optional RENDERS: a directory for a picture of
// every state, arrows pointing at the elements that changed there, and an index.html of them all (req/checks/shell-states/renders).
// Exits 1 on a difference, 2 when it cannot run.
//   node web-tests/shell_states_driver.mjs ANSWERS STUDIES ROOT IMAGE EXPECT [RENDERS]
import fs from "node:fs";
import path from "node:path";
import { standIn } from "./stand_in_drive.mjs";

const [answers, studies, rootDir, image, expectFile, renders] = process.argv.slice(2);
const { FILES, open, role, check, done } = await standIn({ answers, studies, rootDir });
const { elements, paths } = JSON.parse(fs.readFileSync(expectFile, "utf8"));
const OTHER = "someone@example.com";
const ROLE = { viewer: "viewer", tagger: "tagger", data: "data" };

const ready = (page) => page.waitForFunction(() => /^(Ready|Image loaded|Counted)/.test(document.querySelector("#status").textContent));
// done: the page settled, its drawers and fades over (a spinner going round never ends, so it is left out)
const settled = async (page) => {
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-drawers")
    && document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));
  await page.waitForTimeout(150);
};
const ACTIONS = {
  async load(page) {
    await page.setInputFiles("#file", image);
    await page.waitForFunction(() => document.querySelector("#fx-count")?.disabled === false);
  },
  async count(page) {
    await page.click("#fx-count");
    await page.waitForFunction(() => /pixels/.test(document.querySelector("#fx-result").textContent));
  },
  async items(page) {
    await page.click("#switch");
    await page.waitForFunction(() => document.querySelector("#view").dataset.view === "items");
  },
  async image(page) {
    await page.click("#switch");
    await page.waitForFunction(() => document.querySelector("#view").dataset.view === "image");
  },
  async tagger(page) {
    await page.evaluate(() => { window.panelsBefore = document.querySelector("#fx-box"); });
    await role(page, "Ground Truth Tagger");
    await page.waitForFunction(() => document.querySelector("#fx-box") !== window.panelsBefore && document.querySelector("#fx-count")?.disabled === false);
  },
  async folder(page) {
    await page.click("#data-tree .tree-folder .name");
    await page.waitForFunction(() => document.querySelectorAll("#folder-items .cell").length > 0);
  },
  async preview(page) {
    // the stand-in Drive is shared by every path: an earlier one may have made the previews already
    if (!(await page.isDisabled("#update-previews"))) {
      await page.click("#update-previews");
      await page.waitForFunction(() => /previews? made/.test(document.querySelector("#folder-msg").textContent), null, { timeout: 30000 });
    }
    await page.click("#data-tree .tree-folder .count");
    await page.waitForFunction(() => document.querySelectorAll("#data-tree .tree-image .pic img").length > 0);
    await page.click("#data-tree .tree-image");
    await page.waitForFunction(() => shellForTests.page.get("image")?.source.kind === "preview" && !document.querySelector("#load-original").hidden);
  },
  async edit(page) {
    await page.click("#edit-open");
    await page.waitForFunction(() => !document.querySelector("#edit-box").hidden && document.querySelector("#edit-open").disabled);
  },
  async done(page) {
    await page.click("#edit-done");
    await page.waitForFunction(() => document.querySelector("#edit-box").hidden);
  },
  async offline(page) {
    await page.context().setOffline(true);
    await page.waitForFunction(() => document.documentElement.classList.contains("offline"));
  },
  async online(page) {
    await page.context().setOffline(false);
    await page.waitForFunction(() => !document.documentElement.classList.contains("offline"));
  },
  async original(page) {
    await page.click("#load-original");
    await page.waitForFunction(() => shellForTests.page.get("image")?.source.kind === "drive");
  },
};

// each element as the page shows it, and where it is
const read = (page) => page.evaluate((els) => Object.fromEntries(els.map((e) => {
  const el = document.querySelector(e.select);
  if (!el) return [e.name, { seen: "gone", box: null }];
  const shown = el.getClientRects().length > 0 && el.checkVisibility({ visibilityProperty: true });
  // held: what the page marks as needing the internet while offline (req/shell/offline/default)
  const held = el.getAttribute("aria-disabled") === "true" && el.dataset.onlineTitle !== undefined;
  const off = el.matches(":disabled") || (!held && el.getAttribute("aria-disabled") === "true");
  const seen = !shown ? "gone" : e.box && el.classList.contains("folded") ? "folded" : held ? "held" : e.control && off ? "off" : "on";
  const r = el.getBoundingClientRect();
  return [e.name, { seen, box: shown ? { x: r.x, y: r.y, w: r.width, h: r.height } : null }];
})), elements);

// arrows over the page, each from a little above and left of its element to its edge; a dashed one where an element
// was before it went; red where the page is not what the rules say
const ARROW = "#ff7a00", WRONG = "#e00000";
const arrows = (page, marks) => page.evaluate(([marks, ARROW, WRONG]) => {
  const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
  svg.id = "state-arrows";
  Object.assign(svg.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 2147483647 });
  svg.innerHTML = `<defs>${[ARROW, WRONG].map((c, i) => `<marker id="tip${i}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join("")}</defs>`;
  const W = innerWidth, H = innerHeight;
  for (const { box, wrong, was } of marks) {
    const tx = box.x + Math.min(box.w / 2, 24), ty = box.y + Math.min(box.h / 2, 12);
    const sx = Math.max(8, Math.min(W - 8, tx + (tx > W / 2 ? -70 : 70))), sy = Math.max(8, Math.min(H - 8, ty + (ty > 60 ? -45 : 45)));
    const c = wrong ? WRONG : ARROW, line = document.createElementNS(ns, "line");
    Object.entries({ x1: sx, y1: sy, x2: tx, y2: ty, stroke: c, "stroke-width": 3, "marker-end": `url(#tip${wrong ? 1 : 0})`,
      ...(was ? { "stroke-dasharray": "6 4" } : {}) }).forEach(([k, v]) => line.setAttribute(k, v));
    const halo = line.cloneNode(); halo.setAttribute("stroke", "white"); halo.setAttribute("stroke-width", 6); halo.removeAttribute("marker-end");
    svg.append(halo, line);
  }
  document.body.append(svg);
}, [marks, ARROW, WRONG]);
const unarrow = (page) => page.evaluate(() => document.querySelector("#state-arrows")?.remove());

const differences = [];
const index = [];
if (renders) fs.mkdirSync(renders, { recursive: true });
for (const [k, p] of paths.entries()) {
  // each path finds the folder as it started: no previews made by an earlier one
  const made = FILES.findIndex((f) => f.name === "rauntruth-previews.tiff");
  if (made >= 0) FILES.splice(made, 1);
  const page = await open(p.signedIn, {
    study: p.study, ...(p.role === "data" ? {} : { email: OTHER }), seed: { "nor-role": ROLE[p.role] },
  });
  await page.waitForFunction((s) => document.documentElement.dataset.stage === s, p.study.stage);
  await ready(page);
  let before = null;
  const shots = [];
  for (const [i, s] of p.states.entries()) {
    if (i > 0) await ACTIONS[p.actions[i - 1]](page).catch(async (e) => {
      console.error(`${p.root}: ${p.actions[i - 1]} did not finish: ${e.message.split("\n")[0]}; status: ${await page.textContent("#status")}`);
      await done(1);
    });
    await settled(page);
    const now = await read(page);
    const wrong = new Set();
    for (const e of elements) {
      const want = s.expect[e.name];
      if (want !== null && now[e.name].seen !== want) { wrong.add(e.name); differences.push(`${p.root} → ${s.label}: ${e.name} is ${now[e.name].seen}, the rules say ${want}`); }
    }
    if (renders) {
      // what changed here; on the first state, with nothing before it, what shows folded or disabled
      const marks = [];
      for (const e of elements) {
        const changed = before ? before[e.name].seen !== now[e.name].seen : ["off", "folded"].includes(now[e.name].seen);
        if (!changed && !wrong.has(e.name)) continue;
        // only the outermost of what changed together: a box going takes what is in it with it
        const up = e.parent && elements.find((x) => x.name === e.parent);
        if (up && !wrong.has(e.name) && before && before[up.name].seen !== now[up.name].seen) continue;
        if (now[e.name].box) marks.push({ box: now[e.name].box, wrong: wrong.has(e.name) });
        else if (before?.[e.name].box) marks.push({ box: before[e.name].box, wrong: wrong.has(e.name), was: true });
      }
      await arrows(page, marks);
      const file = `${String(k + 1).padStart(2, "0")}-${i}-${s.label.replace(/[^A-Za-z]+/g, "-").toLowerCase().replace(/^-|-$/g, "")}.png`;
      await page.screenshot({ path: path.join(renders, file) });
      await unarrow(page);
      shots.push({ file, label: s.label, wrong: [...wrong] });
    }
    before = now;
  }
  index.push({ root: p.root, shots });
  await page.context().close();
}

if (renders) {
  const esc = (t) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  fs.writeFileSync(path.join(renders, "index.html"), `<!doctype html><meta charset="utf-8"><title>Shell states</title>
<style>body{font:14px system-ui;margin:16px;background:#fff;color:#111}h2{margin:24px 0 8px}.row{display:flex;gap:12px;overflow-x:auto}
figure{margin:0;flex:0 0 auto}img{width:560px;border:1px solid #ccc}figcaption{margin:4px 0}.wrong{color:#c00}</style>
<h1>Shell states</h1><p>Each row is one path, one picture per state: the arrows point at what changed there, dashed where something went; red, where the page is not what the rules say.</p>
${index.map((r) => `<h2>${esc(r.root)}</h2><div class="row">${r.shots.map((s) => `<figure><a href="${s.file}"><img src="${s.file}" alt="${esc(r.root + ", " + s.label)}"></a><figcaption>${esc(s.label)}${s.wrong.length ? ` <span class="wrong">${esc(s.wrong.join(", "))}</span>` : ""}</figcaption></figure>`).join("")}</div>`).join("\n")}`);
}
for (const d of differences) console.error("DIFFERENT: " + d);
await check(!differences.length, `every element in every state is what the rules say (${paths.reduce((n, p) => n + p.states.length, 0)} states on ${paths.length} paths)`, differences.length);
await done(0);
