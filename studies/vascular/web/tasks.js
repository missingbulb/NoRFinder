// The Ground Truth Tasks, in the left bar while the study makes ground truth: the vessels the extractor drew with
// confidence, the low-confidence ones, the junctions, the stack's areas checked one by one for vessels it missed,
// then Submit. The open task shows one item at a time; a verdict moves on to the next with none. Every verdict is
// an edit of the model (model_view.js), so it is undone, saved and submitted with the rest.
import * as Mo from './model.js';
import * as MV from './model_view.js';
import { build, vesselPicture, junctionPicture } from './items.js';

const $ = (id) => document.getElementById(id);
// the stack's field cut into GRID × GRID areas, a fraction of it whatever its size; each task's items come area by area
const GRID = 10, AREAS = GRID * GRID;
const TASKS = ['vessels', 'candidates', 'junctions', 'missed', 'submit'];
// a task's picture, as wide as the box, and no narrower than this
const MIN_PX = 160;

let V = null, st = { task: null, key: null, area: null, dir: 0 }, lists = null, heard = () => {};

// ---------- the areas, in the order they are reviewed ----------
// rows of areas top to bottom, each the way back from the last, so the next area always borders the one before
const size = (m) => [m.size_px[0] * m.um_per_px, m.size_px[1] * m.um_per_px];
function areaOf(m, x, y) {
  const [W, H] = size(m), r = Math.min(GRID - 1, Math.max(0, Math.floor((y / H) * GRID))), k = Math.min(GRID - 1, Math.max(0, Math.floor((x / W) * GRID)));
  return r * GRID + (r % 2 ? GRID - 1 - k : k);
}
// an area's box in µm, {x0, y0, x1, y1}
function areaBox(m, a) {
  const [W, H] = size(m), r = Math.floor(a / GRID), k = r % 2 ? GRID - 1 - (a % GRID) : a % GRID, w = W / GRID, h = H / GRID;
  const q = (v) => Math.round(v * 100) / 100;
  return { x0: q(k * w), y0: q(r * h), x1: q((k + 1) * w), y1: q((r + 1) * h) };
}
// an area checked, as the model's reviewed_regions keep it: through every slice, with the day it was checked
const region = (m, b) => ({ x: [b.x0, b.x1], y: [b.y0, b.y1], z: [0, m.slices - 1], on: new Date().toISOString().slice(0, 10) });
// the areas checked so far: the model's reviewed regions, each the area its middle lies in
const checked = (m) => new Set((m.reviewed_regions || []).filter((g) => g.x?.length === 2 && g.y?.length === 2).map((g) => areaOf(m, (g.x[0] + g.x[1]) / 2, (g.y[0] + g.y[1]) / 2)));

// ---------- the tasks' items ----------
// every task's items, area by area and top to bottom inside an area: {key, at: {x, y, z}, done, ...the item}
function itemsOf(m) {
  const { vessels, junctions } = build(m), order = (xs) => xs.map((it) => [areaOf(m, it.at.x, it.at.y), it])
    .sort((a, b) => a[0] - b[0] || a[1].at.y - b[1].at.y || a[1].at.x - b[1].at.x).map(([, it]) => it);
  const vessel = (v) => ({ ...v, kind: 'vessel', key: `v${v.ids[0]}-${v.ids.at(-1)}`, at: v.path[v.path.length >> 1], done: v.segments.every((i) => Mo.decided(m.segments[i])) });
  return {
    vessels: order(vessels.filter((v) => v.proposed === 'vessel').map(vessel)),
    candidates: order(vessels.filter((v) => v.proposed === 'candidate').map(vessel)),
    junctions: order(junctions.map((j) => ({ ...j, kind: 'junction', key: `j${j.id}`, at: { x: j.x, y: j.y, z: j.z }, done: Mo.checkedJunction(m, j.id) }))),
  };
}
const areasDone = (m) => checked(m).size;
const taskDone = (t, m) => t !== 'submit' && (t === 'missed' ? areasDone(m) === AREAS : lists[t].every((it) => it.done));
const firstOpen = (m) => TASKS.find((t) => !taskDone(t, m));
function nextArea(m, a) { const done = checked(m); for (let k = 0; k < AREAS; k++) { const b = (a + k) % AREAS; if (!done.has(b)) return b; } return null; }

// ---------- moving through the tasks ----------
function current() { const m = MV.current(); return m && st.task in (lists || {}) ? lists[st.task].find((it) => it.key === st.key) || null : null; }
function goTask(t) {
  const m = MV.current(); if (!m) return;
  st.task = t; st.key = null; st.area = null;
  if (t === 'missed') st.area = nextArea(m, 0) ?? 0;
  else if (t !== 'submit') { const xs = lists[t], it = xs.find((x) => !x.done) || xs[0]; st.key = it ? it.key : null; }
  show(true);
}
function goTo(t, it) { st.task = t; st.key = it.key; st.area = null; show(true); }
// after a verdict on the item with key k in task t: the task's next item with none, else the first task not done
function moveOn(t, k) {
  const m = MV.current(); st.dir = 1;
  const xs = lists[t], at = Math.max(0, xs.findIndex((x) => x.key === k));
  const next = [...xs.slice(at + 1), ...xs.slice(0, at)].find((x) => !x.done && x.key !== k);
  if (next) return goTo(t, next);
  goTask(firstOpen(m));
}
// Skip: the next item, or the next area, leaving this one for later
function skip() {
  const m = MV.current(); if (!m) return;
  st.dir = 1;
  if (st.task === 'missed') { st.area = ((st.area ?? -1) + 1) % AREAS; return show(true); }
  const xs = lists[st.task] || []; if (!xs.length) return;
  const k = xs.findIndex((x) => x.key === st.key);
  goTo(st.task, xs[(k + 1) % xs.length]);
}

// ---------- verdicts ----------
function verdict(it, v) {
  const m = MV.current(), t = st.task;
  if (it.kind === 'vessel') MV.edit(Mo.decide(m, it.segments, v));
  else if (v === 'cross') MV.edit(Mo.splitJunction(m, it.id, V.S.zs));
  else MV.edit(Mo.checkJunction(m, it.id, true));
  moveOn(t, it.key);
}
function areaChecked() {
  const m = MV.current(); if (!m || st.area == null) return;
  const box = areaBox(m, st.area), a = st.area;
  MV.edit({ ...m, reviewed_regions: [...(m.reviewed_regions || []), region(m, box)] });
  st.dir = 1;
  const next = nextArea(MV.current(), a);
  next == null ? goTask(firstOpen(MV.current())) : (st.area = next, show(true));
}

// ---------- drawing the box ----------
const button = (label, fn, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (cls) b.className = cls; b.onclick = fn; return b; };
function card(m, it) {
  const el = document.createElement('div'), cv = document.createElement('canvas'), acts = document.createElement('div');
  el.className = 'task-card'; el.dataset.key = it.key; acts.className = 'verdict';
  const px = Math.max(MIN_PX, Math.round($('gt-tasks').clientWidth || 280));
  cv.style.width = cv.style.height = px + 'px';
  if (it.kind === 'vessel') {
    acts.append(button('Approve', () => verdict(it, 'accepted'), 'yes'), button('Decline', () => verdict(it, 'rejected'), 'no'));
    requestAnimationFrame(() => vesselPicture(cv, m, it, px));
  } else {
    acts.append(button('Junction', () => verdict(it, 'right'), 'yes'), button('They cross', () => verdict(it, 'cross'), 'no'));
    acts.firstChild.title = 'Three or more vessels really meet here'; acts.lastChild.title = 'The vessels only pass each other: split them';
    requestAnimationFrame(() => junctionPicture(cv, m, it, px));
  }
  el.append(cv, acts);
  return el;
}
// the item's options, under the cogwheel
function options(it) {
  const m = MV.current(), out = [];
  const item = (label, fn) => { const b = button(label, () => { $('task-menu').open = false; fn(); }); b.className = 'item'; out.push(b); };
  if (it?.kind === 'vessel') {
    item('Show it alone, from above', () => MV.frame(it.ids));
    if (it.done) item('Take back the verdict', () => MV.edit(Mo.decide(m, it.segments, null)));
    item('Delete it', () => { let o = MV.current(); for (const i of [...it.segments].sort((a, b) => b - a)) o = Mo.deleteSegment(o, i); MV.edit(o); });
  } else if (it?.kind === 'junction') {
    item('Look at it from the side', () => MV.lookAt(it.id));
    if (it.done) item('Take back the verdict', () => MV.edit(Mo.checkJunction(m, it.id, false)));
  }
  $('task-opts').replaceChildren(...out);
  $('task-menu').hidden = !out.length;
}

// go: the main view turns to what the task now shows
function show(go) {
  const m = MV.current();
  $('vm-tasks').hidden = !m;
  if (!m) { MV.mark(null, null); return; }
  lists = itemsOf(m);
  if (!st.task) { st.task = firstOpen(m); if (st.task === 'missed') st.area = nextArea(m, 0); else if (st.task !== 'submit') st.key = (lists[st.task].find((x) => !x.done) || lists[st.task][0])?.key ?? null; go = true; }
  // an item a verdict or an edit took away: the task's first one still open
  if (st.task in lists && !current()) st.key = (lists[st.task].find((x) => !x.done) || lists[st.task][0])?.key ?? null;
  const count = { vessels: lists.vessels.length, candidates: lists.candidates.length, junctions: lists.junctions.length, missed: AREAS };
  const did = { vessels: lists.vessels.filter((x) => x.done).length, candidates: lists.candidates.filter((x) => x.done).length,
    junctions: lists.junctions.filter((x) => x.done).length, missed: areasDone(m) };
  for (const li of $('gt-tasks').children) {
    const t = li.dataset.task;
    li.classList.toggle('done', taskDone(t, m)); li.classList.toggle('now', t === st.task);
    const n = li.querySelector('.n'); if (n) n.textContent = `${did[t]}/${count[t]}`;
  }
  for (const b of $('gt-bar').children) {
    const t = b.dataset.task;
    b.style.flexGrow = Math.max(count[t], 1); b.style.setProperty('--done', count[t] ? did[t] / count[t] : 0);
    b.title = $('gt-tasks').querySelector(`li[data-task="${t}"] .t`).textContent.trim();
  }
  // the open task: its tools on its row, its item under it
  const li = $('gt-tasks').querySelector(`li[data-task="${st.task}"]`), it = current(), tools = $('task-tools'), now = $('task-now');
  if (li && st.task !== 'submit') { li.querySelector('.task-head').append(tools); if (st.task !== 'missed') li.querySelector('.task-body').append(now); }
  tools.hidden = !li || st.task === 'submit';
  $('task-skip').disabled = st.task !== 'missed' && (lists[st.task]?.length || 0) < 2;
  options(it);
  now.hidden = !it;
  const was = $('task-card').firstElementChild, fresh = it ? card(m, it) : null;
  $('task-card').replaceChildren(...(fresh ? [fresh] : []));
  if (was && fresh && was.dataset.key !== fresh.dataset.key && st.dir) slideIn(was, fresh, st.dir);
  st.dir = 0;
  const box = st.task === 'missed' && st.area != null ? areaBox(m, st.area) : null;
  $('area-ok').disabled = !box;
  MV.mark(it ? (it.kind === 'vessel' ? { segments: it.segments } : { node: it.id }) : null, box);
  if (go && box) MV.frameArea(box);
  else if (go && it) MV.reveal(it.at);
  heard();
}
// the next item's card slides in over the last one's, which slides out the other way
function slideIn(was, fresh, dir) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  $('task-stage').querySelectorAll('.leaving').forEach((e) => e.remove());
  const out = document.createElement('div'); out.className = 'leaving'; out.setAttribute('aria-hidden', 'true'); out.inert = true;
  out.append(was); $('task-stage').append(out);
  const t = { duration: 220, easing: 'cubic-bezier(.2,.7,.3,1)' };
  out.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dir * 60}%)`, opacity: 0 }], t).finished.then(() => out.remove(), () => out.remove());
  fresh.animate([{ transform: `translateX(${dir * 60}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], t);
}

// What of each task is still open, for Submit Ground Truth's checklist and the status bar's step; null with no model.
export function open() {
  const m = MV.current(); if (!m || !lists) return null;
  const left = (t) => lists[t].filter((x) => !x.done).length, areas = AREAS - areasDone(m);
  const say = (n, one, many, done) => ({ level: 'warn', grade: true, ok: !n, text: n ? `${n} ${n === 1 ? one : many} still to decide` : done });
  return [say(left('vessels'), 'vessel', 'vessels', 'Every vessel has your verdict'),
    say(left('candidates'), 'low-confidence vessel', 'low-confidence vessels', 'Every low-confidence vessel has your verdict'),
    say(left('junctions'), 'junction', 'junctions', 'Every junction has your verdict'),
    { level: 'warn', grade: true, ok: !areas, text: areas ? `Check every area for missed vessels: ${areas} of ${AREAS} left` : 'Every area is checked for missed vessels' }];
}

// view: the shell's 3D view; changed() hears every redraw of the tasks
export function init(view, changed) {
  V = view; st = { task: null, key: null, area: null, dir: 0 }; lists = null; heard = changed || (() => {});
  MV.onChange((m) => { if (!m) { st = { task: null, key: null, area: null, dir: 0 }; lists = null; } show(false); });
  // an item picked on the view becomes the current one, in its task
  MV.onPick((h) => {
    if (!lists) return false;
    for (const t of ['vessels', 'candidates', 'junctions']) {
      const it = lists[t].find((x) => (h.node != null ? x.id === h.node : x.segments?.includes(h.segment)));
      if (it) { goTo(t, it); return true; }
    }
    return false;
  });
  for (const li of $('gt-tasks').children) li.querySelector('button.t')?.addEventListener('click', () => goTask(li.dataset.task));
  $('task-skip').onclick = skip;
  $('area-ok').onclick = areaChecked;
}
// for the study's page tests, which drive it from outside
export const inspect = () => ({ task: st.task, key: st.key, area: st.area, box: st.area != null && MV.current() ? areaBox(MV.current(), st.area) : null,
  lists: lists && Object.fromEntries(Object.entries(lists).map(([t, xs]) => [t, xs.map((x) => ({ key: x.key, done: x.done, at: x.at }))])) });
