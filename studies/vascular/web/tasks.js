// The Ground Truth Tasks, in the left bar while the study makes ground truth: the stack's areas, a row each, then
// Submit. An area is open only while the owner tags, from Start GT tagging to Stop tagging; then the main view shows
// it alone (model_view.js), its lines, points and junctions corrected there in one pass, each of its junctions judged
// in the box, and Area is right does it. Back to image shows the whole stack and Back to task the area again; the
// areas float as a map over the view meanwhile. Every verdict is an edit of the model, so it is undone, saved and
// submitted with the rest.
import * as Mo from './model.js';
import * as MV from './model_view.js';
import { build, junctionPicture } from './items.js';

const $ = (id) => document.getElementById(id);
// the areas across the field, each way, that the person may choose; the field cut into GRID × GRID until they do
const GRIDS = [1, 2, 3, 4, 5, 6, 8, 10], GRID = 4;
// an area done is kept with this step; a file from the earlier three steps did it with all of these
const STEP = 'area', STEPS_BEFORE = ['lines', 'missed', 'junctions'];
// an area done: every one of these points across it, each way, lies in a box kept for it
const PROBES = 4;
// a junction's picture, as wide as the box, and no narrower than this
const MIN_PX = 160;

// tools: the open area's cogwheel and Skip, for its row; work: what is done in it, under its row
let V = null, T = null, n = GRID, st = null, items = null, heard = () => {}, tools = null, work = null;
const fresh = () => ({ area: null, submit: false, junction: null, focused: true, dir: 0 });

// ---------- the areas, in the order they are worked through ----------
// rows of areas top to bottom, each the way back from the last, so the next area always borders the one before
const size = (m) => [m.size_px[0] * m.um_per_px, m.size_px[1] * m.um_per_px];
const count = () => n * n;
const place = (a) => { const r = Math.floor(a / n), k = r % 2 ? n - 1 - (a % n) : a % n; return [r, k]; };
const keyOf = (a) => `a${a}`;
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
// an area done, as the model's reviewed_regions keep it: through every slice, with the day and the step
const region = (m, b) => ({ x: [b.x0, b.x1], y: [b.y0, b.y1], z: [0, m.slices - 1], on: new Date().toISOString().slice(0, 10), step: STEP });
// a box kept before the steps had names was an area checked for missed vessels
const stepOf = (g) => g.step || 'missed';
function covered(m, a, step) {
  const b = areaBox(m, a), gs = (m.reviewed_regions || []).filter((g) => g.x?.length === 2 && g.y?.length === 2 && stepOf(g) === step);
  if (!gs.length) return false;
  for (let i = 0; i < PROBES; i++) for (let j = 0; j < PROBES; j++) {
    const x = b.x0 + (b.x1 - b.x0) * (i + .5) / PROBES, y = b.y0 + (b.y1 - b.y0) * (j + .5) / PROBES;
    if (!gs.some((g) => x >= g.x[0] && x <= g.x[1] && y >= g.y[0] && y <= g.y[1])) return false;
  }
  return true;
}
const done = (m, a) => covered(m, a, STEP) || STEPS_BEFORE.every((s) => covered(m, a, s));
const areasDone = (m) => Array.from({ length: count() }, (_, a) => done(m, a)).filter(Boolean).length;
// the first area not done in the walk from area a on, a itself first; null when all are
function nextOpen(m, a) {
  for (let k = 0; k < count(); k++) { const b = (a + k) % count(); if (!done(m, b)) return b; }
  return null;
}

// ---------- the areas' items: their vessels and their junctions, each by where it lies ----------
function itemsOf(m) {
  const { vessels, junctions } = build(m);
  const js = junctions.map((j) => ({ ...j, key: `j${j.id}`, at: { x: j.x, y: j.y, z: j.z }, done: Mo.checkedJunction(m, j.id) }))
    .sort((p, q) => p.y - q.y || p.x - q.x);
  return { vessels: vessels.map((v) => ({ ...v, at: v.path[v.path.length >> 1] })), junctions: js };
}
const junctionsIn = (m, a) => items.junctions.filter((j) => areaOf(m, j) === a);

// ---------- moving through the areas ----------
// to: an area, or null for Submit
function go(to, dir = 1) {
  if (!MV.current()) return;
  st.area = to ?? st.area; st.submit = to == null;
  st.junction = null; st.focused = to != null; st.dir = dir;
  show(true);
}
const moveOn = () => { const m = MV.current(); go(nextOpen(m, (st.area + 1) % count())); };
// an area's row, or its square on the map: that area
function pick(key) { const a = +String(key).slice(1); if (String(key)[0] === 'a' && a >= 0 && a < count()) go(a); }
// Skip: the next area not done, leaving this one for later
function skip() { const m = MV.current(); if (!m || st.area == null) return; const to = nextOpen(m, (st.area + 1) % count()); go(to ?? st.area); }
function setGrid(k) {
  const m = MV.current(); n = k;
  if (!m) return;
  st.area = null;
  go(nextOpen(m, 0), 0);
}

// ---------- the verdicts ----------
// Area is right: the area done, each vessel whose middle lies in it, confident ones accepted, low-confidence ones
// not kept declined
function areaRight() {
  const m = MV.current(); if (!m || st.area == null) return;
  let o = { ...m, reviewed_regions: [...(m.reviewed_regions || []), region(m, areaBox(m, st.area))] };
  for (const v of items.vessels) {
    if (areaOf(m, v.at) !== st.area || !v.proposed) continue;
    const open = v.segments.filter((i) => o.segments[i].state === v.proposed);
    if (open.length) o = Mo.decide(o, open, v.proposed === 'vessel' ? 'accepted' : 'rejected');
  }
  MV.edit(o); moveOn();
}
function verdict(j, v) {
  const m = MV.current();
  MV.edit(v === 'cross' ? Mo.splitJunction(m, j.id, V.S.zs) : Mo.checkJunction(m, j.id, true));
  st.junction = null; st.dir = 1; show(false);
}

// ---------- drawing the box and the map ----------
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
// how far an area has got: its junctions judged, and itself once done
function progress(m, a) {
  const js = junctionsIn(m, a), d = done(m, a);
  return { did: js.filter((j) => j.done).length + (d ? 1 : 0), of: js.length + 1, done: d };
}
// the areas as a map floating over the view while tagging, as the field is laid out: each done, partly judged or not
// started, the current one marked; a click opens it
function map(m, on) {
  const el = $('gt-mini'); el.hidden = !on;
  if (!on) return;
  const body = $('gt-mini-areas'), [W, H] = size(m);
  body.style.gridTemplateColumns = `repeat(${n}, 1fr)`; body.style.aspectRatio = `${W} / ${H}`;
  const cells = [];
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) {
    const a = r * n + (r % 2 ? n - 1 - k : k), p = progress(m, a), b = document.createElement('button');
    b.type = 'button'; b.className = p.done ? 'done' : p.did ? 'part' : '';
    if (a === st.area && !st.submit) b.classList.add('now');
    b.title = `Area ${a + 1}: ${p.done ? 'done' : p.did ? `${p.did} of ${p.of - 1} junctions judged` : 'not started'}`;
    b.setAttribute('aria-label', b.title);
    b.onclick = () => go(a);
    cells.push(b);
  }
  body.replaceChildren(...cells);
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
const rows = () => Array.from({ length: count() }, (_, a) => ({ key: keyOf(a), name: `Area ${a + 1}`, title: 'Every line, point and junction in the area right' }));

// tagging started: the walk's first area not done, from the one it was on; stopped: the whole stack as viewed
function tagged(on) {
  const m = MV.current();
  MV.tagging(on);
  if (!m) return;
  if (on) {
    const to = nextOpen(m, st.area ?? 0);
    st.area = to ?? st.area; st.submit = to == null; st.junction = null; st.focused = to != null;
  }
  show(true);
}
// moved: the main view turns to what the task now shows
function show(moved) {
  const m = MV.current(), on = T.tagging();
  $('vm-tasks').hidden = !m; $('vm-focus').hidden = !m || !on;
  // rows made anew for another grid take what was on the open one with them
  $('vm-tasks').append(tools, work);
  T.list(m ? rows() : null);
  if (!m) { MV.mark(null, null); MV.focusArea(null); map(null, false); return; }
  items = itemsOf(m);
  $('area-grid').value = String(n);
  for (let a = 0; a < count(); a++) { const p = progress(m, a); T.count(keyOf(a), p.did, p.of, p.done, ''); }
  const open = on && !st.submit && st.area != null;
  const li = T.open(open ? keyOf(st.area) : 'submit');
  if (open) { li.querySelector('.task-head').append(tools); li.querySelector('.task-body').append(work); }
  tools.hidden = work.hidden = !open;
  map(m, on);
  // the area's junction to judge, the current one or its first without a verdict
  const js = open ? junctionsIn(m, st.area) : [];
  let j = js.find((x) => x.id === st.junction) || js.find((x) => !x.done) || null;
  st.junction = j?.id ?? null;
  if (open) {
    const left = js.filter((x) => !x.done).length;
    $('junctions-note').textContent = !js.length ? 'No junctions in this area.' : left ? `${js.length - left + 1} of ${js.length} junctions here` : `All ${js.length} junctions here judged.`;
    $('area-ok').disabled = left > 0;
    $('area-ok').title = left ? `${left} junction${left === 1 ? '' : 's'} here still to judge` : 'Every line, point and junction here is right: on to the next area';
  } else j = null;
  options(j);
  const was = $('task-card').firstElementChild, card_ = j ? card(m, j) : null;
  $('task-card').replaceChildren(...(card_ ? [card_] : []));
  if (was && card_ && was.dataset.key !== card_.dataset.key && st.dir) slideIn(was, card_, st.dir);
  st.dir = 0;
  const box = open ? areaBox(m, st.area) : null;
  if (!on) { MV.mark(null, null); if (MV.focusedArea()) MV.focusArea(null); heard(); return; }
  MV.mark(j ? { node: j.id } : null, box);
  // the area alone in the main view, or the whole stack once it is left
  const focus = st.focused && box, f = MV.focusedArea();
  if (focus && (moved || !f || JSON.stringify(f.box) !== JSON.stringify(box))) MV.focusArea(box);
  else if (!focus && f) MV.focusArea(null);
  $('vm-focus').textContent = focus ? 'Back to image' : 'Back to task';
  $('vm-focus').title = focus ? 'The whole stack, as the Show menu sets it' : 'The task again: its area alone';
  $('vm-focus').disabled = !box;
  heard();
}
// the next junction's card slides in over the last one's, which slides out the other way
function slideIn(was, next, dir) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  $('task-stage').querySelectorAll('.leaving').forEach((e) => e.remove());
  const out = document.createElement('div'); out.className = 'leaving'; out.setAttribute('aria-hidden', 'true'); out.inert = true;
  out.append(was); $('task-stage').append(out);
  const t = { duration: 220, easing: 'cubic-bezier(.2,.7,.3,1)' };
  out.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dir * 60}%)`, opacity: 0 }], t).finished.then(() => out.remove(), () => out.remove());
  next.animate([{ transform: `translateX(${dir * 60}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], t);
}

// What is still open, for Submit Ground Truth's checklist and the status bar's step; null with no model.
export function open() {
  const m = MV.current(); if (!m || !items) return null;
  const left = count() - areasDone(m);
  return [{ level: 'warn', grade: true, ok: !left, text: left ? `Areas: ${left} of ${count()} left` : 'Areas: every one done' }];
}

// view: the shell's 3D view; tasks: the shell's list of them; changed() hears every redraw of the tasks; submit() sends them
export function init(view, tasks, changed, submit) {
  V = view; T = tasks; n = GRID; tools = $('task-tools'); work = $('task-now');
  T.list([], { pick, submit, tagging: tagged });
  T.list(null); st = fresh(); items = null; heard = changed || (() => {});
  $('area-grid').replaceChildren(...GRIDS.map((k) => new Option(k === 1 ? 'The whole field' : `${k} × ${k}`, String(k))));
  $('area-grid').onchange = (e) => setGrid(+e.target.value);
  MV.onChange((m) => { if (!m) { st = fresh(); items = null; } show(false); });
  // a junction of the area clicked on the view becomes the one to judge
  MV.onPick((h) => {
    const m = MV.current();
    if (!items || !MV.focusedArea() || st.area == null || h.node == null) return false;
    const j = junctionsIn(m, st.area).find((x) => x.id === h.node);
    if (!j) return false;
    st.junction = j.id; show(false);
    return true;
  });
  $('task-skip').onclick = skip;
  $('area-ok').onclick = areaRight;
  $('vm-focus').onclick = () => { if (st.area == null) return; st.focused = !st.focused; show(true); };
}
// for the study's page tests, which drive it from outside
export const inspect = () => {
  const m = MV.current();
  return { area: st.submit ? null : st.area, grid: n, focused: !!MV.focusedArea(), box: st.area != null && m ? areaBox(m, st.area) : null,
    key: st.junction != null ? `j${st.junction}` : null, junctions: m && items && st.area != null ? junctionsIn(m, st.area).map((j) => ({ key: j.key, done: j.done })) : [] };
};
