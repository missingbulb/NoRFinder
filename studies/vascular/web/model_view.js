// The vessel model beside or over the stack, in the stack's own camera, and the owner's corrections to
// it: drag a point to move it, right-click a segment or a point to delete it or split a junction,
// right-drag from one piece to another to connect them, click a faded low-confidence vessel to
// approve or decline it, lasso an area of damaged sample to leave it out of the analysis. The corrected
// model goes to the shell's Submit Ground Truth as JSON.
//
// The review narrows the stack to what the model accounts for: Detected keeps only the signal around
// the model's vessels, to check and measure them; Missed keeps only the signal away from them, to find
// vessels the extractor did not draw, which can then be drawn in a click at a time.
import * as Mo from './model.js';
import { coverage } from './coverage.js';

const $ = (id) => document.getElementById(id);
// the shell's 3D view (viewer3d.js `three`): its camera, the stack's place in it and its hooks
let V = null;
const MODELS = new URL('models/index.json', import.meta.url);
const SAVED = 'mv-model:';
const PICK_POINT_PX = 9, PICK_SEGMENT_PX = 6, DRAG_PX = 5;
// The overlay draws the model in magenta: neither the depth colours nor the hot scale of the stack
// carry it, so a line never vanishes into the signal it is laid over.
const OVERLAY = '#ff4fd8';
// knots of junctions the extractor marked as probably traced wrong, in amber: none of the other colours
const DENSE = '#ffb020';
// areas left out of the analysis are hatched in grey: damage has no colour of its own to compete with
const EXCLUDED = '#b8b8b8';
// Beside the stack, depth is the stack's to show: the model is white, a low-confidence vessel a
// paler blue and fainter, and the vessel under the pointer cyan.
const SURE = '#ffffff', SURE_ALPHA = .8, UNSURE = '#9db8ff', UNSURE_ALPHA = .4, LIT = '#4fd1d9';
// a tube's shading from its wall to its core, and the narrowest it is drawn, in screen pixels
const TUBE_SHADES = [.5, .7, .85, 1], TUBE_MIN_PX = 1;
// The points are handles to drag, shown only once the view is zoomed this far in from the whole stack,
// so the opening picture is the vessels alone.
const HANDLES_ZOOM = 2;
// While a point is dragged the rest of the picture fades: what lies within reach of it (the farthest of
// its neighbours, times SPOT_REACH, and at least SPOT_MIN_PX) stays clear, the rest drops to FADED.
const SPOT_REACH = 1.25, SPOT_MIN_PX = 60, FADED = .15;

let model = null, loaded = null, history = [], future = [], edits = 0, savedKey = null;
let mode = 'side', hover = null, rubber = null, drafts = [], stackName = null, showCandidates = true, showWidths = true;
let review = 'all', reach = .5, maskKey = null, maskTimer = null, drawing = null, moving = null, lasso = null;
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* no storage: edits live until the page closes */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* no storage */ } },
};

// ---------- the model's place in the stack's camera ----------
const slices = () => V.meta.shape[0];
function toWorld(n) {
  const [W, H] = model.size_px, um = model.um_per_px, [hx, hy, hz] = V.half;
  return [hx * (2 * n.x / (W * um) - 1), hy * (1 - 2 * n.y / (H * um)), hz * (1 - 2 * (n.z + .5) / slices())];
}
function fromWorld(p) {
  const [W, H] = model.size_px, um = model.um_per_px, [hx, hy, hz] = V.half, Z = slices();
  const cl = (v, a, b) => Math.min(Math.max(v, a), b);
  return { x: cl((p[0] / hx + 1) / 2 * W * um, 0, W * um), y: cl((1 - p[1] / hy) / 2 * H * um, 0, H * um),
           z: cl((1 - p[2] / hz) / 2 * Z - .5, -.5, Z - .5) };
}

let cv = null, view = null;   // the canvas the model is drawn on, and its last projection
function project() {
  const W = cv.clientWidth, H = cv.clientHeight, vp = V.camera(W / H), pts = new Map();
  const at = (p) => { const v = V.M.xf(vp, toWorld(p)); return v[3] > 0 ? [(v[0] / v[3] + 1) / 2 * W, (1 - v[1] / v[3]) / 2 * H, v[3], v[2] / v[3]] : null; };
  for (const n of model.nodes.values()) { const q = at(n); if (q) pts.set(n.id, q); }
  // each segment's stretch of its edge's curve, on screen
  const curves = new Map(), widths = new Map();
  model.segments.forEach((s, i) => {
    if (!pts.has(s.a) || !pts.has(s.b)) return;
    const q = samples(i), c = q.map(at);
    if (!c.every(Boolean)) return;
    curves.set(i, c);
    // a vessel's radius on screen: µm to pixels where the segment is, the larger of the two in-plane
    // directions, since a tilt foreshortens only one of them
    const mid = q[q.length >> 1], o = at(mid), dx = at({ ...mid, x: mid.x + 1 }), dy = at({ ...mid, y: mid.y + 1 });
    if (o && dx && dy && q.every((p) => Number.isFinite(p.r))) {
      const ppu = Math.max(Math.hypot(dx[0] - o[0], dx[1] - o[1]), Math.hypot(dy[0] - o[0], dy[1] - o[1]));
      widths.set(i, q.map((p) => p.r * ppu));
    }
  });
  const boxes = (model.dense_regions || []).map((b) => [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]]
    .map(([x, y]) => at({ x, y, z: (model.slices - 1) / 2 }))).filter((c) => c.every(Boolean));
  const areas = (model.excluded_regions || []).map((r) => r.polygon.map(([x, y]) => at({ x, y, z: (model.slices - 1) / 2 }))).filter((c) => c.every(Boolean));
  return { vp, W, H, pts, curves, widths, boxes, areas };
}
const SAMPLES = 8, sampled = new WeakMap();
function samples(i) {
  let c = sampled.get(model);
  if (!c) sampled.set(model, (c = []));
  return (c[i] ??= Mo.sampleSegment(model, i, SAMPLES));
}
const inSlab = (n) => n.z >= V.S.z0 - .5 && n.z <= V.S.z1 + .5 && V.inClip(toWorld(n));
// declined candidates are never drawn; the rest are, unless the owner has hidden the low-confidence ones
const visible = (s) => Mo.live(s) && (showCandidates || s.state !== 'candidate');
const shown = (s) => visible(s) && (inSlab(model.nodes.get(s.a)) || inSlab(model.nodes.get(s.b)));
const isCandidate = (h) => h?.segment != null && model.segments[h.segment]?.state === 'candidate';
// a vessel lying mostly in a damaged area is out of the analysis, and fades
const damageFade = (segs) => (2 * segs.filter((i) => Mo.excluded(model, samples(i)[SAMPLES >> 1])).length > segs.length ? .3 : 1);
let hatch = null;
function hatching(c) {
  if (hatch) return c.createPattern(hatch, 'repeat');
  hatch = document.createElement('canvas'); hatch.width = hatch.height = 8;
  const h = hatch.getContext('2d'); h.strokeStyle = EXCLUDED; h.globalAlpha = .55; h.lineWidth = 1;
  h.beginPath(); h.moveTo(0, 8); h.lineTo(8, 0); h.stroke();
  return c.createPattern(hatch, 'repeat');
}
const handles = () => V.S.dist <= V.FIT_DIST / HANDLES_ZOOM;
// how clearly a line is drawn while a point is dragged: whole near the point, faded away from it
function nearness(line) {
  const sp = V.S.spot;
  if (!sp) return 1;
  const x = sp.x * view.W, y = sp.y * view.H, r = sp.r * view.H;
  const d = Math.min(...line.map((q) => Math.hypot(q[0] - x, q[1] - y)));
  return d <= r ? 1 : Math.max(FADED, 1 - (1 - FADED) * (d - r) / (r / 2));
}

// One side of a line `r` pixels out from it, at each of its points.
function rim(line, r, side) {
  return line.map((q, k) => {
    const a = line[Math.max(k - 1, 0)], b = line[Math.min(k + 1, line.length - 1)], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [q[0] - side * (b[1] - a[1]) / len * r[k], q[1] + side * (b[0] - a[0]) / len * r[k]];
  });
}

// The drawn segments as unbroken runs along the model's edges, each a line on screen with its
// widths where every piece of it has them, far runs first. A run is drawn whole, so a tube's shading
// carries on through its curve points without a seam.
const edgesOf = new WeakMap();
function runs(drawn) {
  let es = edgesOf.get(model);
  if (!es) edgesOf.set(model, (es = Mo.edges(model)));
  const out = [];
  for (const e of es) {
    let run = null;
    e.segments.forEach((i, k) => {
      if (!drawn.has(i)) { run = null; return; }
      if (!run) out.push((run = { segs: [], line: [], r: [], depth: 0 }));
      const fwd = model.segments[i].a === e.ids[k], line = view.curves.get(i), r = view.widths.get(i);
      const o = fwd ? line : [...line].reverse(), w = r && (fwd ? r : [...r].reverse()), skip = run.segs.length ? 1 : 0;
      run.segs.push(i); run.line.push(...o.slice(skip));
      if (run.r && w) run.r.push(...w.slice(skip)); else run.r = null;
    });
  }
  for (const run of out) run.depth = run.line.reduce((t, q) => t + q[2], 0) / run.line.length;
  return out.sort((p, q) => q.depth - p.depth);
}

// A run, opaque: a shaded tube as wide as the vessel where the model gives its width, so it
// narrows as the vessel does, and a plain line where it does not or widths are hidden.
function vessel(c, { line, r }, tint) {
  r = showWidths && r;
  if (!r) {
    c.strokeStyle = tint; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(line[0][0], line[0][1]); for (const q of line) c.lineTo(q[0], q[1]); c.stroke();
    return;
  }
  // rings of the tube from its wall inwards, each brighter, so it reads round rather than flat
  for (let k = 0; k < TUBE_SHADES.length; k++) {
    const f = 1 - k / TUBE_SHADES.length, rr = r.map((v) => Math.max(v, TUBE_MIN_PX) * f);
    c.fillStyle = shade(tint, TUBE_SHADES[k]);
    const left = rim(line, rr, 1), right = rim(line, rr, -1).reverse();
    c.beginPath(); [...left, ...right].forEach(([x, y], j) => (j ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill();
    for (const j of [0, line.length - 1]) { c.beginPath(); c.arc(line[j][0], line[j][1], rr[j], 0, 2 * Math.PI); c.fill(); }
  }
}
const shade = (hex, f) => `rgb(${[1, 3, 5].map((k) => Math.round(parseInt(hex.slice(k, k + 2), 16) * f)).join(',')})`;

function draw() {
  if (!V || !model || mode === 'off' || !V.meta || !cv.clientWidth) return;
  const dpr = window.devicePixelRatio || 1;
  cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  if (mode === 'side') { c.fillStyle = '#000'; c.fillRect(0, 0, cv.clientWidth, cv.clientHeight); }
  view = project();
  const { pts } = view, Z = slices(), deg = Mo.degrees(model), seen = Mo.degrees(model, visible);
  const all = Mo.degrees(model, Mo.live), cand = Mo.degrees(model, (s) => s.state === 'candidate');
  const hot = new Set(isCandidate(hover) ? Mo.piece(model, hover.segment) : hover?.segment != null ? [hover.segment] : []);
  const colour = () => (mode === 'overlay' ? OVERLAY : SURE);
  // a tube runs smoothly through its curve points, so only its ends are marked
  const tubes = mode === 'side' && showWidths;
  // far segments first, so nearer vessels draw over the ones they pass in front of
  const order = model.segments.map((s, i) => i).filter((i) => view.curves.has(i) && shown(model.segments[i]));
  order.sort((i, j) => (pts.get(model.segments[j].a)[2] + pts.get(model.segments[j].b)[2]) - (pts.get(model.segments[i].a)[2] + pts.get(model.segments[i].b)[2]));
  c.lineCap = 'round'; c.lineJoin = 'round';
  const unsure = (i) => model.segments[i].state === 'candidate';
  if (mode === 'side') {
    // Beside the stack the model is a picture of its own: confident vessels white and nearly opaque,
    // low-confidence ones faded. Each kind is drawn opaque on a layer of its own and laid on once,
    // so the pieces of a vessel never stack into beads.
    const rs = runs(new Set(order)), lit = (run) => run.segs.some((i) => hot.has(i));
    for (const [which, tint, alpha] of [[true, UNSURE, UNSURE_ALPHA], [false, SURE, SURE_ALPHA]]) {
      const layer = document.createElement('canvas'); layer.width = cv.width; layer.height = cv.height;
      const l = layer.getContext('2d'); l.scale(dpr, dpr); l.lineCap = 'round'; l.lineJoin = 'round';
      for (const run of rs) if (unsure(run.segs[0]) === which && !lit(run)) { l.globalAlpha = nearness(run.line) * damageFade(run.segs); vessel(l, run, tint); }
      c.globalAlpha = alpha; c.drawImage(layer, 0, 0, cv.clientWidth, cv.clientHeight);
    }
    c.globalAlpha = 1;
    for (const run of rs) if (lit(run)) { c.globalAlpha = nearness(run.line); vessel(c, run, LIT); }
    c.globalAlpha = 1;
  } else {
    for (const i of order) {
      const line = view.curves.get(i), lit = hot.has(i);
      c.strokeStyle = lit ? '#fff' : OVERLAY;
      // over the stack the lines stay thin and let the signal under them show through, a low-confidence
      // one fainter still
      c.globalAlpha = (lit ? 1 : (unsure(i) ? .35 : .7) * damageFade([i])) * nearness(line);
      c.lineWidth = lit ? 3 : 1.1;
      c.beginPath(); c.moveTo(line[0][0], line[0][1]); for (const q of line) c.lineTo(q[0], q[1]); c.stroke();
      const r = showWidths && view.widths.get(i);
      if (r) {
        // the vessel's width as two slim edges either side of its centerline, never a fill over the signal
        c.globalAlpha *= .5; c.lineWidth = 1;
        for (const side of [1, -1]) {
          c.beginPath();
          rim(line, r, side).forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
          c.stroke();
        }
      }
    }
  }
  c.globalAlpha = V.S.spot ? FADED : 1; c.setLineDash([6, 4]); c.strokeStyle = DENSE; c.lineWidth = 1.5;
  for (const b of view.boxes) { c.beginPath(); b.forEach((q, k) => (k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.stroke(); }
  c.setLineDash([]);
  const outline = (q) => { c.beginPath(); q.forEach((p, k) => (k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); };
  for (const a of view.areas) { outline(a); c.fillStyle = hatching(c); c.fill(); c.strokeStyle = EXCLUDED; c.lineWidth = 1.2; c.stroke(); }
  if (lasso?.pts.length > 1) { c.setLineDash([5, 4]); c.strokeStyle = '#fff'; c.lineWidth = 1.5; outline(lasso.pts); c.stroke(); c.setLineDash([]); }
  c.globalAlpha = 1;
  // the handles: none in the opening view, and only the one being dragged while it moves
  for (const n of model.nodes.values()) {
    if (moving != null ? n.id !== moving : !handles()) continue;
    const p = pts.get(n.id), v = seen.get(n.id) || 0; if (!p || !v || !inSlab(n)) continue;
    const d = deg.get(n.id) || 0, hot = hover?.node === n.id;
    c.beginPath();
    // a junction is where three confirmed vessels meet; one that waits on a candidate's review is faded
    if (v >= 3) {
      c.globalAlpha = d >= 3 || hot ? 1 : UNSURE_ALPHA;
      c.arc(p[0], p[1], hot ? 6 : 4, 0, 2 * Math.PI); c.strokeStyle = hot ? '#fff' : mode === 'overlay' ? OVERLAY : 'rgba(255,255,255,.85)'; c.lineWidth = hot ? 2 : 1.2; c.stroke();
      c.globalAlpha = 1;
    } else if (hot || (all.get(n.id) !== cand.get(n.id) && !(v === 2 && tubes))) {
      // a candidate's own points are left undrawn, so it reads as one faded line and not as a row of dots
      c.arc(p[0], p[1], hot ? 4.5 : (v === 1 ? 2.2 : 1.6) * (mode === 'overlay' ? .7 : 1), 0, 2 * Math.PI); c.fillStyle = hot ? '#fff' : colour(); c.fill();
    }
  }
  const w = hover && (hover.node == null || pts.has(hover.node)) && hoverRadius(hover);
  if (w) {
    const [x, y] = screenOf(hover), t = `⌀ ${(2 * w).toFixed(1)} µm`;
    c.font = '11px "IBM Plex Mono", monospace'; c.fillStyle = 'rgba(0,0,0,.6)';
    c.fillRect(x + 8, y - 22, c.measureText(t).width + 8, 16); c.fillStyle = '#fff'; c.fillText(t, x + 12, y - 10);
  }
  if (drawing?.from && drawing.to) {
    c.setLineDash([5, 4]); c.strokeStyle = '#fff'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(...screenOf(drawing.from)); c.lineTo(...drawing.to); c.stroke(); c.setLineDash([]);
    if (drawing.from.point) { const [x, y] = screenOf(drawing.from); c.beginPath(); c.arc(x, y, 3, 0, 2 * Math.PI); c.fillStyle = '#fff'; c.fill(); }
  }
  if (rubber) {
    c.setLineDash([5, 4]); c.strokeStyle = '#fff'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(...rubber.from); c.lineTo(...rubber.to); c.stroke(); c.setLineDash([]);
  }
  if (mode === 'side') V.axes(c, view.vp, view.W, view.H);
  if (Z !== model.slices) {
    c.font = '12px "IBM Plex Mono", monospace'; c.fillStyle = '#e8b04a';
    c.fillText(`model has ${model.slices} slices, stack has ${Z}`, 10, 26);
  }
}

// what is under the pointer: {node: id} or {segment: i, t} (t along the segment, from its first point)
function pick(e, segmentsOnly = false) {
  if (!view) return null;
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  let best = null, bd = PICK_POINT_PX;
  const on = Mo.degrees(model, visible);
  if (!segmentsOnly && handles()) for (const [id, p] of view.pts) {
    if (!on.get(id) || !inSlab(model.nodes.get(id))) continue;
    const d = Math.hypot(p[0] - x, p[1] - y);
    if (d < bd) { bd = d; best = { node: id }; }
  }
  if (best) return best;
  bd = PICK_SEGMENT_PX;
  for (const [i, line] of view.curves) {
    if (!shown(model.segments[i])) continue;
    for (let k = 0; k < line.length - 1; k++) {
      const a = line[k], b = line[k + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
      const u = Math.min(Math.max(((x - a[0]) * dx + (y - a[1]) * dy) / L, 0), 1);
      const d = Math.hypot(a[0] + u * dx - x, a[1] + u * dy - y);
      if (d < bd) { bd = d; best = { segment: i, t: Math.min(Math.max((k + u) / (line.length - 1), .02), .98) }; }
    }
  }
  return best;
}
// the vessel's radius in µm under a picked point or segment, when the model gives it
const hoverRadius = (h) => (h.node != null ? model.nodes.get(h.node)?.r : model.segments[h.segment] ? Mo.curvePoint(model, h.segment, h.t).r : null);
const screenOf = (h) => {
  if (h.point) { const v = V.M.xf(view.vp, toWorld(h.point)); return [(v[0] / v[3] + 1) / 2 * view.W, (1 - v[1] / v[3]) / 2 * view.H]; }
  if (h.node != null) return view.pts.get(h.node).slice(0, 2);
  const line = view.curves.get(h.segment), f = h.t * (line.length - 1), k = Math.min(Math.floor(f), line.length - 2), u = f - k;
  return [line[k][0] + (line[k + 1][0] - line[k][0]) * u, line[k][1] + (line[k + 1][1] - line[k][1]) * u];
};

// ---------- edits ----------
function apply(next, keepFuture) {
  if (next === model) return;
  history.push(model); if (!keepFuture) future = [];
  model = next; edits++; changed();
}
const listeners = [];
// Other views of the model (the item cards) hear every change to it, a new model included.
export const onChange = (fn) => listeners.push(fn);
// the study left: nothing hears the model any more, and its canvas leaves the 3D view
export function leave() { listeners.length = 0; V?.place(null); V = null; }
const tell = () => listeners.forEach((fn) => fn(model));
export const current = () => model;
// an edit made from another view, undoable like any other
export function edit(next) { closeMenu(); apply(next); }
function changed() {
  tell();
  if (savedKey) {
    if (edits) store.set(savedKey, { edits, model: Mo.toJSON(model) }); else store.del(savedKey);
  }
  facts(); refreshMask(); V.redraw();
}
function undo() { if (!history.length) return; future.push(model); model = history.pop(); edits--; changed(); }
function redo() { if (!future.length) return; history.push(model); model = future.pop(); edits++; changed(); }

function grab(e) {
  if (!model || mode === 'off') return null;
  closeMenu();
  if (lasso && e.button === 0) {
    const r = cv.getBoundingClientRect(), add = (ev) => { lasso.pts.push([ev.clientX - r.left, ev.clientY - r.top]); V.redraw(); };
    lasso.pts = []; add(e);
    return {
      move: add,
      up(ev) {
        const poly = lasso.pts.map((q) => ground(q)).filter(Boolean).map((p) => [round(p.x), round(p.y)]);
        lasso.pts = [];
        const next = Mo.markExcluded(model, poly);
        if (next === model) { V.redraw(); return msg('That outline encloses no area: draw around the damage, ending where you began.'); }
        setLasso(false); apply(next); askReason(model.excluded_regions.length - 1, ev.clientX, ev.clientY);
      },
      cancel() { lasso.pts = []; V.redraw(); },
    };
  }
  const h = pick(e);
  if (e.button === 0 && !e.shiftKey && h?.node != null && !drawing) {
    const base = model, id = h.node, ndcZ = view.pts.get(id)[3];
    let moved = false;
    const done = () => { moving = null; V.S.spot = null; };
    return {
      move(ev) {
        const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
        const nx = x / view.W * 2 - 1, ny = 1 - y / view.H * 2;
        const far = Math.max(0, ...Mo.neighbours(base, id).map((k) => view.pts.get(k)).filter(Boolean).map((q) => Math.hypot(q[0] - x, q[1] - y)));
        moving = id; V.S.spot = { x: x / view.W, y: y / view.H, r: Math.max(SPOT_MIN_PX, SPOT_REACH * far) / view.H };
        const w = V.M.xf(V.M.inv(view.vp), [nx, ny, ndcZ]);
        const next = Mo.moveNode(base, id, fromWorld([w[0] / w[3], w[1] / w[3], w[2] / w[3]]));
        if (!moved) { moved = true; history.push(base); future = []; edits++; }
        model = next; V.redraw();
      },
      up(ev) { done(); if (moved) changed(); else clicked(ev); V.redraw(); },
      cancel() { done(); if (moved) changed(); V.redraw(); },
    };
  }
  if (e.button === 2) {
    const x0 = e.clientX, y0 = e.clientY;
    return {
      move(ev) {
        if (!h) return;
        if (!rubber && Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_PX) return;
        const r = cv.getBoundingClientRect(), target = pick(ev);
        hover = target;
        rubber = { from: screenOf(h), to: target ? screenOf(target) : [ev.clientX - r.left, ev.clientY - r.top] };
        cv.classList.add('connecting'); V.redraw();
      },
      up(ev) {
        cv.classList.remove('connecting');
        if (rubber) {
          rubber = null;
          const to = pick(ev);
          if (to && !(to.segment != null && to.segment === h.segment)) apply(Mo.connect(model, h, to));
          V.redraw();
        } else if (h) openMenu(h, ev.clientX, ev.clientY);
      },
      cancel() { rubber = null; cv.classList.remove('connecting'); V.redraw(); },
    };
  }
  return null;
}

// A left click on a faded vessel asks for its verdict.
function clicked(e) {
  if (!model || mode === 'off') return;
  if (drawing) return drawClick(e);
  const h = pick(e, true);
  if (isCandidate(h)) return openMenu(h, e.clientX, e.clientY);
  const r = cv.getBoundingClientRect(), p = ground([e.clientX - r.left, e.clientY - r.top]);
  const k = p ? (model.excluded_regions || []).findIndex((a) => Mo.excluded({ excluded_regions: [a] }, p)) : -1;
  if (k >= 0) askReason(k, e.clientX, e.clientY);
}

// A menu of buttons at the pointer: items are [label, fn returning the next model] or [note, null].
function showMenu(items, x, y) {
  const m = $('ctx');
  m.replaceChildren(...items.map(([label, fn]) => {
    if (!fn) { const p = document.createElement('div'); p.className = 'note'; p.textContent = label; return p; }
    const b = document.createElement('button'); b.type = 'button'; b.className = 'item'; b.textContent = label;
    b.onclick = () => { closeMenu(); apply(fn()); V.redraw(); };
    return b;
  }));
  m.hidden = false;
  m.style.left = `${Math.min(x, innerWidth - m.offsetWidth - 8)}px`; m.style.top = `${Math.min(y, innerHeight - m.offsetHeight - 8)}px`;
}

function openMenu(h, x, y) {
  const items = [];
  const zScale = V.S.zs;   // µm per slice, as the view draws it
  if (isCandidate(h)) {
    const c = model.segments[h.segment].confidence;
    items.push(['Approve this vessel (A)', () => Mo.review(model, h.segment, 'accepted')]);
    items.push(['Decline this vessel (D)', () => Mo.review(model, h.segment, 'rejected')]);
    if (c != null) items.push([`low confidence: ${c.toFixed(2)}`, null]);
  }
  if (h.segment != null) {
    items.push(['Delete this segment', () => Mo.deleteSegment(model, h.segment)]);
    items.push(['Add a curve point here', () => Mo.splitSegment(model, h.segment, h.t)[0]]);
  } else {
    const d = Mo.degrees(model).get(h.node) || 0;
    if (d >= 3) {
      items.push(['Look at it from the side: crossing or split?', () => { lookAt(h.node); return model; }]);
      items.push(['Wrong junction: these vessels cross, split them', () => Mo.splitJunction(model, h.node, zScale)]);
    }
    if (d === 2) items.push(['Remove this curve point (smoother curve)', () => Mo.removeBend(model, h.node)]);
    items.push([d === 1 ? 'Delete this tip and its segment' : 'Delete this point and its segments', () => Mo.deleteNode(model, h.node)]);
  }
  showMenu(items, x, y);
  hover = h; V.redraw();
}

// ---------- damaged areas ----------
// The point on the stack's middle depth under a screen point, in µm; null when the view looks along
// that plane. From straight above this is exactly the spot under the pointer.
function ground([x, y]) {
  const iv = V.M.inv(view.vp), nx = x / view.W * 2 - 1, ny = 1 - y / view.H * 2;
  const [a, b] = [-1, 1].map((d) => { const w = V.M.xf(iv, [nx, ny, d]); return w.slice(0, 3).map((v) => v / w[3]); });
  const zc = toWorld({ x: 0, y: 0, z: (model.slices - 1) / 2 })[2], t = (zc - a[2]) / (b[2] - a[2]);
  return Number.isFinite(t) && Math.abs(b[2] - a[2]) > 1e-9 ? fromWorld(a.map((v, k) => v + t * (b[k] - v))) : null;
}
const round = (v) => Math.round(v * 10) / 10;
function setLasso(on) {
  lasso = on ? { pts: [] } : null;
  $('m-lasso').textContent = on ? 'Cancel marking' : 'Mark a damaged area';
  $('m-lasso').setAttribute('aria-pressed', String(!!on));
  cv.classList.toggle('connecting', !!on);
  if (on) { if (drawing) setDrawing(false); if (mode !== 'overlay') setMode('overlay'); }
  $('lasso-note').textContent = on ? 'Drag around the damaged area. It is left out of the analysis through every slice.' : '';
  V.redraw();
}
// What the damage is, for an area just drawn or clicked, or taking the area back out.
function askReason(k, x, y) {
  const now = model.excluded_regions[k].reason;
  const set = (reason) => () => ({ ...model, excluded_regions: model.excluded_regions.map((a, i) => (i === k ? { ...a, reason } : a)) });
  showMenu([[now ? `Damaged area: ${now}` : 'What is wrong here?', null],
    ...Mo.REASONS.filter((r) => r !== now).map((r) => [r[0].toUpperCase() + r.slice(1), set(r)]),
    ['Unmark: analyse this area again', () => Mo.unmarkExcluded(model, k)]], x, y);
}
// The junction from the side, cut out of the stack: two vessels that only cross sit apart in depth.
// The view looks across the straightest pair of branches through it, the vessel running on.
const LOOK_RADII = 8, LOOK_MIN_UM = 10;
export function lookAt(id) {
  const N = model.nodes.get(id), w = toWorld(N), nb = Mo.neighbours(model, id).map((k) => toWorld(model.nodes.get(k)));
  const dir = nb.map((q) => { const v = [q[0] - w[0], q[1] - w[1]], l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l]; });
  let best = [0, 1, 2];
  for (let i = 0; i < dir.length; i++) for (let j = i + 1; j < dir.length; j++) {
    const c = dir[i][0] * dir[j][0] + dir[i][1] * dir[j][1];
    if (c < best[2]) best = [i, j, c];
  }
  const along = Math.atan2(dir[best[0]][1] - dir[best[1]][1], dir[best[0]][0] - dir[best[1]][0]);
  const um = Math.max(LOOK_RADII * (N.r || 0), LOOK_MIN_UM);
  V.focus(w, um / (model.size_px[0] * model.um_per_px) * 2 * V.half[0], along);
  if (mode === 'side') setMode('overlay');
  msg('Showing this junction from the side. Top, Tilted, Side or Front shows the whole stack again.');
}
// Points of the model from straight above, the stack cut down to the box around them, so a vessel
// is seen on its own.
export function frame(ids, marginUm = 10) {
  const ps = ids.map((k) => model.nodes.get(k)), um = marginUm;
  const lo = toWorld({ x: Math.min(...ps.map((p) => p.x)) - um, y: Math.max(...ps.map((p) => p.y)) + um, z: 0 });
  const hi = toWorld({ x: Math.max(...ps.map((p) => p.x)) + um, y: Math.min(...ps.map((p) => p.y)) - um, z: 0 });
  const h = Math.max(hi[0] - lo[0], hi[1] - lo[1]) / 2;
  Object.assign(V.S, { yaw: 0, pitch: 0, clip: [lo[0], lo[1], hi[0], hi[1]], pivot: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, 0], dist: Math.max(.15, h * 5) });
  if (mode === 'side') setMode('overlay');
  V.redraw();
}
function closeMenu() { if (!$('ctx').hidden) { $('ctx').hidden = true; hover = null; V.redraw(); } }

// ---------- the review: detected or missed ----------
function setReview(r) {
  review = r;
  for (const b of $('review-mode').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === r));
  $('review-note').textContent = {
    all: 'The whole stack.',
    detected: 'Only the signal within reach of the model’s vessels: check them and measure their widths (hover a vessel).',
    missed: 'Only the signal away from the model’s vessels: whatever bright line is left is a vessel the model does not have.',
  }[r];
  $('reach-row').hidden = r === 'all';
  refreshMask(true);
}
// Detected keeps the stack inside the model's tubes, Missed outside them
const SIDES = { detected: 'inside', missed: 'outside' };
// The mask follows the model, the vessels shown, the reach and the slice spacing, recomputed a moment
// after the last change so a run of edits paints it once.
function refreshMask(now) {
  clearTimeout(maskTimer);
  if (!V?.meta) return;
  if (!model || review === 'all') { maskKey = null; return V.setMask(null); }
  const key = [model, showCandidates, reach, V.S.zs];
  if (maskKey && key.every((v, k) => v === maskKey.key[k])) return V.setMask(maskKey.mask, SIDES[review]);
  maskTimer = setTimeout(() => {
    const mask = coverage(model, V.meta.shape, { zStepUm: V.S.zs, reachOfWidth: reach, which: visible });
    maskKey = { key, mask }; V.setMask(mask, SIDES[review]);
  }, now ? 0 : 150);
}

// Drawing a missed vessel: each click places its next point, on an existing point or vessel when the
// click lands on one, else at the brightest shown voxel under the pointer. Joining the network, Enter,
// Escape or the button again ends it.
function setDrawing(on) {
  drawing = on ? { from: null, to: null } : null;
  $('m-draw').textContent = on ? 'Finish drawing' : 'Draw a missed vessel';
  $('m-draw').setAttribute('aria-pressed', String(!!on));
  cv.classList.toggle('connecting', !!on);
  if (on && mode !== 'overlay') setMode('overlay');
  if (on && lasso) setLasso(false);
  $('draw-note').textContent = on ? 'Click along the vessel, a point at a time; each point goes to the brightest spot under the pointer. Click an existing vessel, press Enter or Escape to end. Ctrl-Z takes back a point.' : '';
  V.redraw();
}
function drawClick(e) {
  const h = pick(e), r = cv.getBoundingClientRect();
  let to = h;
  if (!to) {
    const w = V.brightestOnRay((e.clientX - r.left) / view.W * 2 - 1, 1 - (e.clientY - r.top) / view.H * 2, view.W / view.H);
    if (!w) return;
    to = { point: fromWorld(w) };
  }
  // an undo can take away the point the line was drawing from
  if (drawing.from?.node != null && !model.nodes.has(drawing.from.node)) drawing.from = null;
  if (!drawing.from) { drawing.from = to; return V.redraw(); }
  const [next, id] = Mo.drawSegment(model, drawing.from, to);
  if (id == null) return;
  apply(next);
  if (h) return setDrawing(false);
  drawing.from = { node: id };
}

// ---------- loading, modes, saving ----------
function setMode(m) {
  mode = m;
  for (const b of $('model-mode').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === m));
  V.place(m === 'off' || !model ? null : cv, m === 'side');
  V.redraw();
}

function facts() {
  if (!model) return;
  const s = Mo.stats(model), v = Mo.pieceCounts(model);
  $('model-facts').textContent = `${model.status === 'corrected' ? 'Corrected' : 'Draft'} model of ${model.source}: ` +
    `${v.vessel + v.accepted} vessel edges, ${s.junctions} junctions, ${s.tips} tips, ${model.slices} slices. ` +
    (v.candidate || v.accepted || v.rejected ? `${v.candidate} low-confidence vessel${v.candidate === 1 ? '' : 's'} to review` +
      `${s.pendingJunctions ? ` (they would add up to ${s.pendingJunctions} junctions)` : ''}, ${v.accepted} approved, ${v.rejected} declined. ` : '') +
    (model.dense_regions?.length ? `${model.dense_regions.length} area${model.dense_regions.length === 1 ? '' : 's'} with far more junctions ` +
      'than the rest of the stack, likely traced wrong, outlined in amber. ' : '') +
    (model.excluded_regions?.length ? `${model.excluded_regions.length} damaged area${model.excluded_regions.length === 1 ? '' : 's'} ` +
      `(${(100 * Mo.excludedFraction(model)).toFixed(1)}% of the field, hatched) left out of the analysis, with the ${v.excluded} ` +
      `vessel edge${v.excluded === 1 ? '' : 's'} in ${model.excluded_regions.length === 1 ? 'it' : 'them'}. ` : '') +
    (edits ? `${edits} edit${edits === 1 ? '' : 's'} so far, kept in this browser until you submit them as ground truth.` : 'No edits yet.');
  $('m-undo').disabled = !history.length; $('m-redo').disabled = !future.length; $('m-reset').disabled = !edits;
}
const msg = (t, err) => { $('model-msg').textContent = t; $('model-msg').classList.toggle('err', !!err); };

// a short fingerprint of the file as loaded, so saved edits never attach to a different model
function fingerprint(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return (h >>> 0).toString(36); }

function open(text, name) {
  let m;
  try { m = Mo.parse(JSON.parse(text)); } catch (err) {
    return msg(`Could not read ${name}: ${err instanceof Mo.ModelError ? err.message : 'it is not valid JSON'}.`, true);
  }
  loaded = m; model = m; history = []; future = []; edits = 0;
  savedKey = SAVED + fingerprint(text);
  const saved = store.get(savedKey);
  msg('');
  if (saved?.edits) {
    try { model = Mo.parse(saved.model); history = [loaded]; edits = saved.edits; msg(`Picked up ${edits} edits you made earlier in this browser. Discard edits starts over from the file.`); }
    catch { store.del(savedKey); }
  }
  if (V.meta && m.slices !== slices()) msg(`This model has ${m.slices} slices and the stack has ${slices()}: they are probably not the same stack.`, true);
  $('model-on').hidden = false; $('review-box').hidden = false;
  maskKey = null; refreshMask(true);
  $('m-candidates-row').hidden = !model.segments.some((s) => s.state !== 'vessel');
  setMode(mode === 'off' ? 'side' : mode);
  facts(); tell();
}

// The corrected model, as ground truth: the document, its file name, how many edits it carries and what is
// still open in it, for the shell's Submit Ground Truth.
export function truth() {
  if (!model) return null;
  const doc = Mo.toJSON(model, { status: edits || model.status === 'corrected' ? 'corrected' : model.status,
    corrected_at: new Date().toISOString(), corrections: (model.corrections || 0) + edits });
  const stem = String(model.source || 'vessels').replace(/\.tiff?$/i, ''), v = Mo.pieceCounts(model);
  return { doc, file: `${stem}.vessels.corrected.json`, edits: edits + (model.corrections || 0), stem,
    items: [{ level: 'warn', ok: !v.candidate, text: v.candidate ? `${v.candidate} low-confidence vessel${v.candidate === 1 ? '' : 's'} still to approve or decline` : 'Every low-confidence vessel has your verdict' }] };
}

export function openFile(f) {
  if (!V?.meta) return msg('Open the stack first, then its model.', true);
  f.text().then((t) => open(t, f.name), () => msg(`Could not read ${f.name}.`, true));
}

// A stack's name as a download or a Drive copy may spell it: case, spaces and punctuation aside.
const same = (a, b) => { const k = (s) => String(s).toLowerCase().replace(/\.tiff?$/, '').replace(/[^a-z0-9]/g, ''); return k(a) === k(b); };
const draftFor = (name) => drafts.find((x) => same(x.source, name));

// Called whenever a stack opens: brings in the draft model drawn for it, if the site carries one.
export function stackOpened(name) {
  stackName = name;
  model = null; loaded = null; history = []; future = []; edits = 0; savedKey = null;
  $('model-on').hidden = true; $('review-box').hidden = true; msg(''); setMode(mode);
  if (drawing) setDrawing(false);
  if (lasso) setLasso(false);
  maskKey = null; refreshMask(true);
  tell();
  $('model-draft').hidden = !draftFor(name);
  if (draftFor(name)) loadDraft();
}
async function loadDraft() {
  const d = draftFor(stackName); if (!d) return;
  msg('Loading the draft…');
  try { const r = await fetch(new URL(d.file, MODELS)); if (!r.ok) throw new Error(r.status); open(await r.text(), d.file); }
  catch (err) { msg(`Could not load the draft (${err.message}).`, true); }
}

// The model as it stands and where each of its points was last drawn, for scripts driving the page.
export const inspect = () => ({ model: model && Mo.toJSON(model), points: view && Object.fromEntries(view.pts), edits });

// view: the shell's 3D view; signal ends the listeners outside the study's own panels when the study leaves
export function init(view, signal) {
  V = view;
  model = null; loaded = null; history = []; future = []; edits = 0; savedKey = null; stackName = null; mode = 'side';
  cv = document.createElement('canvas'); cv.id = 'mcv';
  V.onDraw(draw, signal);
  V.controls(cv, grab, clicked);
  cv.addEventListener('pointermove', (e) => {
    if (!model || e.buttons || rubber) return;
    if (drawing) { const r = cv.getBoundingClientRect(); drawing.to = [e.clientX - r.left, e.clientY - r.top]; }
    const h = pick(e), same = JSON.stringify(h) === JSON.stringify(hover);
    cv.classList.toggle('over-point', !!h);
    if ((!same || drawing) && $('ctx').hidden) { hover = h; V.redraw(); }
  });
  cv.addEventListener('pointerleave', () => { if (hover && $('ctx').hidden) { hover = null; V.redraw(); } });
  $('model-mode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.v); });
  $('model-load').onclick = () => $('model-file').click();
  $('model-file').onchange = (e) => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ''; };
  $('model-draft').onclick = loadDraft;
  $('m-candidates').onchange = (e) => { showCandidates = e.target.checked; if (!showCandidates && isCandidate(hover)) closeMenu(); hover = null; refreshMask(); V.redraw(); };
  $('review-mode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setReview(b.dataset.v); });
  const reachOut = () => { $('reach-o').value = `${Math.round(reach * 100)}% of its width`; };
  $('reach').addEventListener('input', (e) => { reach = e.target.value / 100; reachOut(); refreshMask(); });
  reachOut();
  V.onSpacing(() => refreshMask(), signal);
  $('m-draw').onclick = () => setDrawing(!drawing);
  $('m-lasso').onclick = () => setLasso(!lasso);
  $('m-widths').onchange = (e) => { showWidths = e.target.checked; V.redraw(); };
  $('m-undo').onclick = undo; $('m-redo').onclick = redo;
  $('m-reset').onclick = () => { if (!edits || !confirm(`Discard all ${edits} edits and go back to the model as loaded?`)) return;
    store.del(savedKey); model = loaded; history = []; future = []; edits = 0; msg(''); changed(); };
  document.addEventListener('keydown', (e) => {
    if (!model || e.target.closest('input, textarea')) return;
    if (e.key === 'Escape') { closeMenu(); if (lasso) setLasso(false); }
    if (drawing && (e.key === 'Escape' || e.key === 'Enter')) { setDrawing(false); return; }
    const k0 = e.key.toLowerCase();
    if (!(e.ctrlKey || e.metaKey || e.altKey) && (k0 === 'a' || k0 === 'd') && isCandidate(hover)) {
      const h = hover; closeMenu(); hover = null; apply(Mo.review(model, h.segment, k0 === 'a' ? 'accepted' : 'rejected')); return;
    }
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
  }, { signal });
  document.addEventListener('pointerdown', (e) => { if (!$('ctx').contains(e.target) && e.target !== cv) closeMenu(); }, { signal });
  fetch(MODELS).then((r) => (r.ok ? r.json() : [])).then((list) => {
    drafts = Array.isArray(list) ? list : [];
    if (stackName && !model) { $('model-draft').hidden = !draftFor(stackName); loadDraft(); }
  }).catch(() => { /* no drafts shipped with this copy of the site */ });
}
