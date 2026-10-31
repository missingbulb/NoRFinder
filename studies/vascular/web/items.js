// The Items view: the vessel model taken apart into its units of work, a card for each junction and
// each vessel (an edge from a junction to a junction or a tip), so each can be checked on its own while
// a ground truth is built. A card shows the stack around its item, flattened over the shown slices,
// with the model drawn over it, the item's own numbers and the edits that apply to it. Each card can
// also put its item in the 3D view.
import * as Mo from './model.js';
import * as MV from './model_view.js';

// the shell's 3D view (viewer3d.js `three`)
let V = null;

const $ = (id) => document.getElementById(id);
const CARD_PX = 168;           // a card's picture, CSS pixels square
const MIN_HALF_UM = 12;        // the least the picture shows around its item, each way
const SAMPLES = 8;             // curve samples per segment, for lengths and drawing
const CROWD_UM = 20;           // how near another junction must be to count as crowding
// the model in magenta and the item in white: neither is a colour the depth scale gives the stack
const MODEL = 'rgba(255,79,216,.75)', ITEM = '#fff';
// how much a low-confidence vessel is faded against a confident one
const FADED = .4;
const STATE_TEXT = { vessel: 'Vessel', candidate: 'Low confidence', accepted: 'Approved', rejected: 'Declined' };

let kind = 'junctions', filter = 'all', sort = 'file', items = { junctions: [], vessels: [] }, shown = false, selected = null;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '–');

// ---------- the items and their numbers ----------
function build(m) {
  if (!m) return { junctions: [], vessels: [] };
  const deg = Mo.degrees(m), all = Mo.degrees(m, Mo.live);
  const zum = V.S.zs;   // µm per slice, as the view draws it
  const vessels = Mo.edges(m).map((e, k) => {
    let len = 0, rs = [];
    const path = e.segments.flatMap((i, j) => {
      const s = m.segments[i], pts = Mo.sampleSegment(m, i, SAMPLES);
      // a segment may run against its edge's direction
      return (s.a === e.ids[j] ? pts : pts.reverse()).slice(j ? 1 : 0);
    });
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      len += Math.hypot(b.x - a.x, b.y - a.y, (b.z - a.z) * zum);
    }
    for (const p of path) if (Number.isFinite(p.r)) rs.push(2 * p.r);
    const end = (id) => ((all.get(id) || 0) >= 3 ? 'junction' : (all.get(id) || 0) === 1 ? 'tip' : 'point');
    return { n: k + 1, ids: e.ids, segments: e.segments, state: e.state, confidence: e.confidence, path, length: len,
      width: rs.length ? rs.reduce((a, b) => a + b) / rs.length : null, wmin: rs.length ? Math.min(...rs) : null, wmax: rs.length ? Math.max(...rs) : null,
      ends: [end(e.ids[0]), end(e.ids.at(-1))] };
  });
  const junctions = [...all].filter(([, d]) => d >= 3).map(([id, d]) => {
    const n = m.nodes.get(id), confirmedDeg = deg.get(id) || 0;
    return { id, x: n.x, y: n.y, z: n.z, r: n.r, branches: d, pending: confirmedDeg < 3 || confirmedDeg !== d,
      neighbours: Mo.neighbours(m, id) };
  });
  // how crowded each junction's surroundings are: many junctions close together hints the trace went wrong there
  for (const j of junctions) j.crowd = junctions.filter((o) => o !== j && Math.hypot(o.x - j.x, o.y - j.y) < CROWD_UM).length;
  return { junctions, vessels };
}

function visible() {
  let list = items[kind];
  if (kind === 'vessels') {
    if (filter === 'review') list = list.filter((v) => v.state === 'candidate');
    else if (filter === 'declined') list = list.filter((v) => v.state === 'rejected');
    else list = list.filter((v) => v.state !== 'rejected');
  } else if (filter === 'review') list = list.filter((j) => j.pending || j.branches >= 4 || j.crowd);
  const by = {
    file: null,
    short: kind === 'vessels' ? (a, b) => a.length - b.length : null,
    wide: kind === 'vessels' ? (a, b) => (b.width ?? -1) - (a.width ?? -1) : null,
    branches: kind === 'junctions' ? (a, b) => b.branches - a.branches || b.crowd - a.crowd : null,
    crowd: kind === 'junctions' ? (a, b) => b.crowd - a.crowd : null,
  }[sort];
  return by ? [...list].sort(by) : list;
}

// ---------- a card's picture ----------
// image µm to volume pixels: the model's own size against the volume's, so binning never matters
function scale(m) { const [, Y, X] = V.meta.shape; return [X / (m.size_px[0] * m.um_per_px), Y / (m.size_px[1] * m.um_per_px)]; }

function picture(cv, m, box, mark) {
  const [, Y, X] = V.meta.shape, [sx, sy] = scale(m), vol = V.volume(), n = X * Y;
  const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
  const half = Math.max(box[2] - box[0], box[3] - box[1], 2 * MIN_HALF_UM) / 2 * 1.15;
  const x0 = Math.floor((cx - half) * sx), y0 = Math.floor((cy - half) * sy), w = Math.max(1, Math.ceil(2 * half * sx)), h = Math.max(1, Math.ceil(2 * half * sy));
  const src = document.createElement('canvas'); src.width = w; src.height = h;
  const c0 = src.getContext('2d'), img = c0.createImageData(w, h), d = img.data, { z0, z1 } = V.S;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X0 = x0 + x, Y0 = y0 + y, o = 4 * (y * w + x);
    d[o + 3] = 255;
    if (X0 < 0 || Y0 < 0 || X0 >= X || Y0 >= Y) continue;
    let mv = -1, mz = 0;
    for (let z = z0; z <= z1; z++) { const v = vol[z * n + Y0 * X + X0]; if (v > mv) { mv = v; mz = z; } }
    const [r, g, b] = V.lut2d(mv, (mz - z0) / Math.max(z1 - z0, 1));
    d[o] = r; d[o + 1] = g; d[o + 2] = b;
  }
  c0.putImageData(img, 0, 0);
  const dpr = window.devicePixelRatio || 1;
  cv.width = CARD_PX * dpr; cv.height = CARD_PX * dpr;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.drawImage(src, 0, 0, cv.width, cv.height);
  // µm to card pixels
  const k = cv.width / (w / sx), at = (p) => [(p.x - x0 / sx) * k, (p.y - y0 / sy) * k];
  c.lineCap = 'round'; c.lineJoin = 'round';
  // the rest of the model, thin, so the item's neighbours are in view too
  c.strokeStyle = MODEL; c.lineWidth = dpr;
  m.segments.forEach((s, i) => {
    if (!Mo.live(s)) return;
    const a = m.nodes.get(s.a), b = m.nodes.get(s.b);
    if (Math.max(a.x, b.x) < cx - half || Math.min(a.x, b.x) > cx + half || Math.max(a.y, b.y) < cy - half || Math.min(a.y, b.y) > cy + half) return;
    // a low-confidence vessel fainter
    c.globalAlpha = s.state === 'candidate' ? FADED : 1;
    const pts = Mo.sampleSegment(m, i, SAMPLES).map(at);
    c.beginPath(); c.moveTo(...pts[0]); for (const p of pts) c.lineTo(...p); c.stroke();
  });
  c.globalAlpha = 1;
  mark(c, at, k, dpr);
}

function vesselPicture(cv, m, v) {
  const xs = v.path.map((p) => p.x), ys = v.path.map((p) => p.y);
  picture(cv, m, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], (c, at, k, dpr) => {
    // the vessel's own width, where the model gives one, as a translucent band under its centre line;
    // drawn opaque apart and laid on once, so the band's pieces never stack into beads
    if (v.width != null) {
      const band = document.createElement('canvas'); band.width = c.canvas.width; band.height = c.canvas.height;
      const b = band.getContext('2d'); b.lineCap = 'round'; b.strokeStyle = '#fff';
      for (let i = 1; i < v.path.length; i++) {
        const p = v.path[i - 1], q = v.path[i], r = ((p.r ?? q.r ?? 0) + (q.r ?? p.r ?? 0)) / 2;
        b.lineWidth = Math.max(2 * r * k, dpr);
        b.beginPath(); b.moveTo(...at(p)); b.lineTo(...at(q)); b.stroke();
      }
      c.globalAlpha = .18; c.drawImage(band, 0, 0); c.globalAlpha = 1;
    }
    c.strokeStyle = ITEM; c.globalAlpha = .85 * (v.state === 'candidate' ? FADED : 1); c.lineWidth = dpr;
    c.beginPath(); c.moveTo(...at(v.path[0])); for (const p of v.path) c.lineTo(...at(p)); c.stroke(); c.globalAlpha = 1;
    for (const [p, e] of [[v.path[0], v.ends[0]], [v.path.at(-1), v.ends[1]]]) {
      const [x, y] = at(p); c.beginPath();
      if (e === 'junction') { c.arc(x, y, 4 * dpr, 0, 2 * Math.PI); c.strokeStyle = ITEM; c.lineWidth = 1.5 * dpr; c.stroke(); }
      else { c.arc(x, y, 2.5 * dpr, 0, 2 * Math.PI); c.fillStyle = ITEM; c.fill(); }
    }
  });
}

function junctionPicture(cv, m, j) {
  const r = Math.max(MIN_HALF_UM, 3 * (j.r || 0));
  picture(cv, m, [j.x - r, j.y - r, j.x + r, j.y + r], (c, at, k, dpr) => {
    // its branches as far as their next point, in white
    c.strokeStyle = ITEM; c.lineWidth = 1.5 * dpr;
    m.segments.forEach((s, i) => {
      if (!Mo.live(s) || (s.a !== j.id && s.b !== j.id)) return;
      c.globalAlpha = s.state === 'candidate' ? FADED : 1;
      const pts = Mo.sampleSegment(m, i, SAMPLES).map(at);
      c.beginPath(); c.moveTo(...pts[0]); for (const p of pts) c.lineTo(...p); c.stroke();
    });
    c.globalAlpha = 1;
    const [x, y] = at(j);
    c.beginPath(); c.arc(x, y, Math.max((j.r || 0) * k, 5 * dpr), 0, 2 * Math.PI); c.lineWidth = 1.5 * dpr; c.stroke();
  });
}

// ---------- the cards ----------
const button = (label, fn, cls = '') => {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (cls) b.className = cls;
  b.onclick = (e) => { e.stopPropagation(); fn(); }; return b;
};

function card(m, it) {
  const el = document.createElement('article'), cv = document.createElement('canvas'), body = document.createElement('div');
  el.className = 'card'; el.tabIndex = 0; body.className = 'card-body';
  const key = kind === 'vessels' ? `v${it.n}` : `j${it.id}`;
  el.dataset.key = key; el.classList.toggle('on', selected === key);
  const actions = document.createElement('div'); actions.className = 'card-actions';
  if (kind === 'vessels') {
    el.classList.add(`state-${it.state}`);
    const z = it.path.map((p) => p.z);
    body.innerHTML = `<div class="card-head"><b>#${it.n}</b> <span class="chip ${it.state}">${STATE_TEXT[it.state]}${it.confidence != null && it.state === 'candidate' ? ` ${it.confidence.toFixed(2)}` : ''}</span></div>` +
      `<div class="dim">${esc(it.ends[0])} → ${esc(it.ends[1])}</div>` +
      `<dl><dt>Length</dt><dd>${fmt(it.length)} µm</dd>` +
      `<dt>Width</dt><dd>${it.width == null ? 'not in the model' : `${fmt(it.width)} µm <span class="dim">(${fmt(it.wmin)}–${fmt(it.wmax)})</span>`}</dd>` +
      `<dt>Depth</dt><dd>slices ${fmt(Math.min(...z) + 1, 0)}–${fmt(Math.max(...z) + 1, 0)}</dd></dl>`;
    if (it.state === 'candidate') {
      actions.append(button('Approve', () => MV.edit(Mo.review(MV.current(), it.segments[0], 'accepted')), 'yes'),
        button('Decline', () => MV.edit(Mo.review(MV.current(), it.segments[0], 'rejected')), 'no'));
    }
    actions.append(button('Show in 3D', () => { select(key); MV.frame(it.ids); show3d(); }));
    if (it.state !== 'rejected') actions.append(button('Delete', () => {
      let o = MV.current();
      // later segments first, so the earlier indices stay valid
      for (const i of [...it.segments].sort((a, b) => b - a)) o = Mo.deleteSegment(o, i);
      MV.edit(o);
    }));
    requestAnimationFrame(() => vesselPicture(cv, m, it));
  } else {
    body.innerHTML = `<div class="card-head"><b>Junction ${it.id}</b>${it.pending ? ' <span class="chip candidate">Waits on review</span>' : ''}</div>` +
      `<div class="dim">${it.branches} branches</div>` +
      `<dl><dt>Depth</dt><dd>slice ${fmt(it.z + 1)}</dd><dt>Width</dt><dd>${Number.isFinite(it.r) ? `${fmt(2 * it.r)} µm` : 'not in the model'}</dd>` +
      `<dt>Nearby</dt><dd class="${it.crowd ? 'warn' : ''}">${it.crowd ? `${it.crowd} other junction${it.crowd === 1 ? '' : 's'} within ${CROWD_UM} µm` : `no other junction within ${CROWD_UM} µm`}</dd></dl>`;
    actions.append(button('Side view', () => { select(key); MV.lookAt(it.id); show3d(); }),
      button('They cross: split', () => MV.edit(Mo.splitJunction(MV.current(), it.id, V.S.zs))));
    requestAnimationFrame(() => junctionPicture(cv, m, it));
  }
  body.append(actions);
  el.onclick = () => select(key);
  el.append(cv, body);
  return el;
}
function select(key) {
  selected = key;
  for (const c of $('item-list').children) c.classList.toggle('on', c.dataset.key === key);
}
let show3d = () => {};

function render() {
  const m = MV.current(), list = $('item-list');
  const counts = { junctions: items.junctions.length, vessels: items.vessels.filter((v) => v.state !== 'rejected').length };
  for (const b of document.querySelectorAll('#item-kind button')) {
    b.setAttribute('aria-pressed', String(b.dataset.v === kind));
    b.querySelector('.count').textContent = counts[b.dataset.v];
  }
  $('items-count').textContent = m ? String(counts.junctions + counts.vessels) : '';
  $('item-switch').disabled = !m;
  for (const o of $('item-sort').options) o.hidden = !o.dataset.for.includes(kind);
  if (!$('item-sort').selectedOptions[0] || $('item-sort').selectedOptions[0].hidden) { sort = 'file'; $('item-sort').value = 'file'; }
  for (const o of $('item-filter').options) o.hidden = !o.dataset.for.includes(kind);
  if ($('item-filter').selectedOptions[0]?.hidden) { filter = 'all'; $('item-filter').value = 'all'; }
  if (!shown) return;
  const top = list.parentElement.scrollTop;
  if (!m) { list.replaceChildren(); $('items-empty').hidden = false; return; }
  $('items-empty').hidden = true;
  const vis = visible();
  // cards draw their picture only once scrolled near, so a model of hundreds opens at once
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return; io.unobserve(e.target);
    e.target.replaceWith(card(m, vis[+e.target.dataset.i]));
  }), { root: list.parentElement, rootMargin: '400px' });
  list.replaceChildren(...vis.map((it, i) => {
    const ph = document.createElement('div'); ph.className = 'card placeholder'; ph.dataset.i = i;
    ph.dataset.key = kind === 'vessels' ? `v${it.n}` : `j${it.id}`;
    io.observe(ph); return ph;
  }));
  $('items-note').textContent = vis.length === items[kind].length ? '' : `${vis.length} of ${items[kind].length} shown`;
  list.parentElement.scrollTop = top;
}

export function init(view, toThreeD) {
  V = view; show3d = toThreeD; items = { junctions: [], vessels: [] }; shown = false; selected = null;
  MV.onChange((m) => { items = build(m); render(); });
  $('item-kind').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { kind = b.dataset.v; render(); } });
  $('item-filter').onchange = (e) => { filter = e.target.value; render(); };
  $('item-sort').onchange = (e) => { sort = e.target.value; render(); };
}
// the Items tab came into view or left it; cards are built only while it shows
export function visibleNow(on) { shown = on; if (on) { items = build(MV.current()); render(); } }
