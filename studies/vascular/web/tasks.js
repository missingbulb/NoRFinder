// The Ground Truth Tasks, in the left bar while the study makes ground truth: the stack's areas, each worked through
// in three steps, its Lines from straight above, its Missed vessels, then its Junctions in 3D, then Submit. While a
// step is open the main view shows its area alone (model_view.js); Back to image shows the whole stack and Back to
// task the area again. Every verdict is an edit of the model, so it is undone, saved and submitted with the rest.
import * as Mo from './model.js';
import * as MV from './model_view.js';
import { build, junctionPicture } from './items.js';

const $ = (id) => document.getElementById(id);
// the areas across the field, each way, that the person may choose; the field cut into GRID × GRID until they do
const GRIDS = [1, 2, 3, 4, 5, 6, 8, 10], GRID = 4;
const STEPS = ['lines', 'missed', 'junctions'];
const ROWS = [
  { key: 'lines', name: 'Lines', title: "From straight above: every vessel line in the area is where the vessel is" },
  { key: 'missed', name: 'Missed vessels', title: 'From straight above: every vessel the algorithm missed in the area drawn' },
  { key: 'junctions', name: 'Junctions', title: 'In 3D: each junction in the area real, or vessels that only cross; artifacts dropped' },
];
// a step done over an area: every one of these points across it, each way, lies in a box kept for that step
const PROBES = 4;
// a junction's picture, as wide as the box, and no narrower than this
const MIN_PX = 160;

let V = null, T = null, n = GRID, st = null, items = null, heard = () => {};
const fresh = () => ({ area: null, step: null, junction: null, focused: true, dir: 0 });

// ---------- the areas, in the order they are worked through ----------
// rows of areas top to bottom, each the way back from the last, so the next area always borders the one before
const size = (m) => [m.size_px[0] * m.um_per_px, m.size_px[1] * m.um_per_px];
const count = () => n * n;
const place = (a) => { const r = Math.floor(a / n), k = r % 2 ? n - 1 - (a % n) : a % n; return [r, k]; };
// an area's box in µm, {x0, y0, x1, y1}
function areaBox(m, a) {
  const [W, H] = size(m), [r, k] = place(a), w = W / n, h = H / n, q = (v) => Math.round(v * 100) / 100;
  return { x0: q(k * w), y0: q(r * h), x1: q((k + 1) * w), y1: q((r + 1) * h) };
}
// the area a point lies in; a curve running past the field's edge is in the area at that edge
function areaOf(m, p) {
  const [W, H] = size(m), cell = (v, L) => Math.min(n - 1, Math.max(0, Math.floor((v / L) * n)));
  const r = cell(p.y, H), k = cell(p.x, W);
  return r * n + (r % 2 ? n - 1 - k : k);
}
// a step done over an area, as the model's reviewed_regions keep it: through every slice, with the day and the step
const region = (m, b, step) => ({ x: [b.x0, b.x1], y: [b.y0, b.y1], z: [0, m.slices - 1], on: new Date().toISOString().slice(0, 10), step });
// a box kept before the steps had names was an area checked for missed vessels
const stepOf = (g) => g.step || 'missed';
function done(m, a, step) {
  const b = areaBox(m, a), gs = (m.reviewed_regions || []).filter((g) => g.x?.length === 2 && g.y?.length === 2 && stepOf(g) === step);
  if (!gs.length) return false;
  for (let i = 0; i < PROBES; i++) for (let j = 0; j < PROBES; j++) {
    const x = b.x0 + (b.x1 - b.x0) * (i + .5) / PROBES, y = b.y0 + (b.y1 - b.y0) * (j + .5) / PROBES;
    if (!gs.some((g) => x >= g.x[0] && x <= g.x[1] && y >= g.y[0] && y <= g.y[1])) return false;
  }
  return true;
}
const areaDone = (m, a) => STEPS.every((s) => done(m, a, s));
const stepsDone = (m, s) => Array.from({ length: count() }, (_, a) => done(m, a, s)).filter(Boolean).length;
// the first step not done in the walk from area a on, the area's own steps first: {area, step}, or null when all are
function nextOpen(m, a, from = 0) {
  for (let k = 0; k < count(); k++) {
    const b = (a + k) % count(), s = STEPS.slice(k ? 0 : from).find((x) => !done(m, b, x));
    if (s) return { area: b, step: s };
  }
  return null;
}

// ---------- the area's items: its vessels and its junctions, each by where it lies ----------
function itemsOf(m) {
  const { vessels, junctions } = build(m);
  const js = junctions.map((j) => ({ ...j, key: `j${j.id}`, at: { x: j.x, y: j.y, z: j.z }, done: Mo.checkedJunction(m, j.id) }))
    .sort((p, q) => p.y - q.y || p.x - q.x);
  return { vessels: vessels.map((v) => ({ ...v, at: v.path[v.path.length >> 1] })), junctions: js };
}
const here = (m) => (st.area == null ? [] : items.junctions.filter((j) => areaOf(m, j) === st.area));

// ---------- moving through the areas ----------
function go(to, dir = 1) {
  const m = MV.current(); if (!m) return;
  if (!to) { st.area = null; st.step = 'submit'; }
  else { st.area = to.area; st.step = to.step; }
  st.junction = null; st.focused = !!to; st.dir = dir;
  show(true);
}
// after a step is done: the area's next step not done, else the next area's
function moveOn() { const m = MV.current(); go(nextOpen(m, st.area, STEPS.indexOf(st.step) + 1) || nextOpen(m, st.area)); }
// a step's row: that step in the walk's next area where it is not done
function pickStep(key) {
  const m = MV.current(); if (!m) return;
  if (!STEPS.includes(key)) return;
  const from = st.area ?? 0;
  for (let k = 0; k < count(); k++) { const a = (from + k) % count(); if (!done(m, a, key)) return go({ area: a, step: key }); }
  go({ area: from, step: key });
}
// Skip: the next area with a step not done, leaving this one for later
function skip() { const m = MV.current(); if (!m || st.area == null) return; go(nextOpen(m, (st.area + 1) % count()) || nextOpen(m, st.area)); }
function setGrid(k) {
  const m = MV.current(); n = k;
  if (!m) return;
  go(nextOpen(m, 0), 0);
}

// ---------- the steps' verdicts ----------
function keep(step) {
  const m = MV.current(); if (!m || st.area == null) return null;
  return { ...m, reviewed_regions: [...(m.reviewed_regions || []), region(m, areaBox(m, st.area), step)] };
}
// Lines are right: each vessel whose middle lies in the area, confident ones accepted, low-confidence ones not kept declined
function linesRight() {
  const m = MV.current();
  let o = keep('lines');
  for (const v of items.vessels) {
    if (areaOf(m, v.at) !== st.area || !v.proposed) continue;
    const open = v.segments.filter((i) => o.segments[i].state === v.proposed);
    if (open.length) o = Mo.decide(o, open, v.proposed === 'vessel' ? 'accepted' : 'rejected');
  }
  MV.edit(o); moveOn();
}
function noneMissed() { MV.edit(keep('missed')); moveOn(); }
function areaDoneHere() { MV.edit(keep('junctions')); moveOn(); }
function verdict(j, v) {
  const m = MV.current();
  MV.edit(v === 'cross' ? Mo.splitJunction(m, j.id, V.S.zs) : Mo.checkJunction(m, j.id, true));
  st.junction = null; st.dir = 1; show(false);
}
// a vessel clicked in 3D, a detection artifact, dropped: declined where the algorithm drew it, deleted where the person did
function dropped(v) {
  let o = MV.current();
  if (v.proposed) return Mo.decide(o, v.segments, 'rejected');
  for (const i of [...v.segments].sort((a, b) => b - a)) o = Mo.deleteSegment(o, i);
  return o;
}

// ---------- drawing the box ----------
const button = (label, fn, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (cls) b.className = cls; b.onclick = fn; return b; };
function card(m, j) {
  const el = document.createElement('div'), cv = document.createElement('canvas'), acts = document.createElement('div');
  el.className = 'task-card'; el.dataset.key = j.key; acts.className = 'verdict';
  const px = Math.max(MIN_PX, Math.round($('gt-tasks').clientWidth || 280));
  cv.style.width = cv.style.height = px + 'px';
  acts.append(button('Junction', () => verdict(j, 'right'), 'yes'), button('They cross', () => verdict(j, 'cross'), 'no'));
  acts.firstChild.title = 'Three or more vessels really meet here'; acts.lastChild.title = 'The vessels only pass each other at different depths: split them';
  requestAnimationFrame(() => junctionPicture(cv, m, j, px));
  el.append(cv, acts);
  return el;
}
// the areas as a map, each a square to pick it by: done, partly done or not started, the current one marked
function map(m) {
  const el = $('area-map');
  el.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
  const cells = [];
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) {
    const a = r * n + (r % 2 ? n - 1 - k : k), d = STEPS.filter((s) => done(m, a, s)).length, b = document.createElement('button');
    b.type = 'button'; b.className = d === STEPS.length ? 'done' : d ? 'part' : '';
    if (a === st.area) b.classList.add('now');
    b.title = `Area ${a + 1}: ${d === STEPS.length ? 'done' : d ? `${d} of ${STEPS.length} steps done` : 'not started'}`;
    b.setAttribute('aria-label', b.title);
    b.onclick = () => { const to = nextOpen(MV.current(), a); go(to?.area === a ? to : { area: a, step: 'lines' }); };
    cells.push(b);
  }
  el.replaceChildren(...cells);
}
// the current junction's options, under the cogwheel
function options(j) {
  const m = MV.current(), out = [];
  const item = (label, fn) => { const b = button(label, () => { $('task-menu').open = false; fn(); }); b.className = 'item'; out.push(b); };
  if (j) {
    item('Look at it from the side', () => MV.lookAt(j.id));
    if (j.done) item('Take back the verdict', () => MV.edit(Mo.checkJunction(m, j.id, false)));
  }
  $('task-opts').replaceChildren(...out);
  $('task-menu').hidden = !out.length;
}

// moved: the main view turns to what the task now shows
function show(moved) {
  const m = MV.current();
  $('vm-tasks').hidden = !m; $('vm-focus').hidden = !m;
  T.list(m ? ROWS : null);
  if (!m) { MV.mark(null, null); MV.focusArea(null); return; }
  items = itemsOf(m);
  if (!st.step) { const to = nextOpen(m, 0); st.area = to?.area ?? null; st.step = to?.step ?? 'submit'; moved = true; }
  for (const r of ROWS) T.count(r.key, stepsDone(m, r.key), count());
  const open = st.step !== 'submit' && st.area != null;
  const li = T.open(open ? st.step : 'submit'), tools = $('task-tools'), now = $('task-now');
  if (open) { li.querySelector('.task-head').append(tools); li.querySelector('.task-body').append(now); }
  tools.hidden = now.hidden = !open;
  if (open) {
    $('area-name').textContent = `Area ${st.area + 1} of ${count()}`;
    $('area-grid').value = String(n);
    map(m);
    for (const s of STEPS) $(`step-${s}`).hidden = s !== st.step;
  }
  // the junctions step: the area's junction to judge, the current one or its first without a verdict
  const js = open && st.step === 'junctions' ? here(m) : [];
  let j = js.find((x) => x.id === st.junction) || js.find((x) => !x.done) || null;
  if (open && st.step === 'junctions') {
    st.junction = j?.id ?? null;
    const left = js.filter((x) => !x.done).length;
    $('junctions-note').textContent = !js.length ? 'No junctions in this area.' : left ? `${js.length - left + 1} of ${js.length} junctions here` : `All ${js.length} junctions here judged.`;
    $('area-done').disabled = left > 0;
    $('area-done').title = left ? `${left} junction${left === 1 ? '' : 's'} here still to judge` : 'Every junction here is judged: on to the next area';
  } else j = null;
  options(j);
  const was = $('task-card').firstElementChild, fresh = j ? card(m, j) : null;
  $('task-card').replaceChildren(...(fresh ? [fresh] : []));
  if (was && fresh && was.dataset.key !== fresh.dataset.key && st.dir) slideIn(was, fresh, st.dir);
  st.dir = 0;
  const box = open ? areaBox(m, st.area) : null;
  MV.mark(j ? { node: j.id } : null, box);
  // the area alone in the main view, or the whole stack once it is left
  const focus = st.focused && box, f = MV.focusedArea();
  if (focus && (moved || !f || f.depth !== (st.step === 'junctions') || JSON.stringify(f.box) !== JSON.stringify(box))) MV.focusArea(box, st.step === 'junctions');
  else if (!focus && f) MV.focusArea(null);
  $('vm-focus').textContent = focus ? 'Back to image' : 'Back to task';
  $('vm-focus').title = focus ? 'The whole stack, as the Show menu sets it' : 'The task again: its area alone';
  $('vm-focus').disabled = !box;
  $('peek-note').hidden = !focus;
  heard();
}
// the next junction's card slides in over the last one's, which slides out the other way
function slideIn(was, fresh, dir) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  $('task-stage').querySelectorAll('.leaving').forEach((e) => e.remove());
  const out = document.createElement('div'); out.className = 'leaving'; out.setAttribute('aria-hidden', 'true'); out.inert = true;
  out.append(was); $('task-stage').append(out);
  const t = { duration: 220, easing: 'cubic-bezier(.2,.7,.3,1)' };
  out.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dir * 60}%)`, opacity: 0 }], t).finished.then(() => out.remove(), () => out.remove());
  fresh.animate([{ transform: `translateX(${dir * 60}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], t);
}

// What of each step is still open, for Submit Ground Truth's checklist and the status bar's step; null with no model.
export function open() {
  const m = MV.current(); if (!m || !items) return null;
  return ROWS.map((r) => {
    const left = count() - stepsDone(m, r.key);
    return { level: 'warn', grade: true, ok: !left, text: left ? `${r.name}: ${left} of ${count()} areas left` : `${r.name}: every area done` };
  });
}

// view: the shell's 3D view; tasks: the shell's list of them; changed() hears every redraw of the tasks; submit() sends them
export function init(view, tasks, changed, submit) {
  V = view; T = tasks; n = GRID;
  T.list(ROWS, { pick: pickStep, submit });
  T.list(null); st = fresh(); items = null; heard = changed || (() => {});
  $('area-grid').replaceChildren(...GRIDS.map((k) => new Option(k === 1 ? 'The whole field' : `${k} × ${k} areas`, String(k))));
  $('area-grid').onchange = (e) => setGrid(+e.target.value);
  MV.onChange((m) => { if (!m) { st = fresh(); items = null; } show(false); });
  // in 3D, a junction clicked becomes the one to judge and a vessel clicked is offered to drop
  MV.onPick((h, e) => {
    const m = MV.current(), f = MV.focusedArea();
    if (!items || !f?.depth || st.step !== 'junctions') return false;
    const j = h.node != null && here(m).find((x) => x.id === h.node);
    if (j) { st.junction = j.id; show(false); return true; }
    const v = items.vessels.find((x) => (h.node != null ? x.ids.includes(h.node) : x.segments.includes(h.segment)) && Mo.live(m.segments[x.segments[0]]));
    if (!v) return false;
    MV.showMenu([['Drop this vessel: a detection artifact', () => dropped(v)]], e.clientX, e.clientY);
    return true;
  });
  $('task-skip').onclick = skip;
  $('lines-ok').onclick = linesRight;
  $('area-ok').onclick = noneMissed;
  $('area-done').onclick = areaDoneHere;
  $('vm-focus').onclick = () => { if (st.area == null) return; st.focused = !st.focused; show(true); };
}
// for the study's page tests, which drive it from outside
export const inspect = () => {
  const m = MV.current();
  return { step: st.step, area: st.area, grid: n, focused: !!MV.focusedArea(), box: st.area != null && m ? areaBox(m, st.area) : null,
    key: st.junction != null ? `j${st.junction}` : null, junctions: m && items ? here(m).map((j) => ({ key: j.key, done: j.done })) : [] };
};
