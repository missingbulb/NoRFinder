// A vessel model: junctions and tips joined by smooth curves, the format analysis/vessel_model.py
// writes (vessel-model/2). Each edge is a centripetal Catmull-Rom curve from node a to node b through
// its "via" points, which sit on the vessel. x, y and r (radius) are µm from the image's top-left
// corner, z is in slices. Everything here is plain data in, data out, so the edits can be tested
// without a browser.
//
// In memory the model is points joined by segments: an edge's via points are points where only that
// edge passes, so moving a point drags the curve, adding one adds a bend, and removing one lets the
// curve run smoother. Writing the model back collapses each run of such points into one edge again.
//
// Each edge has a state. "vessel" is drawn by the extractor with confidence, or by the owner;
// "candidate" is a low-confidence vessel the extractor kept for the owner to review, which becomes
// "accepted" or "rejected". A rejected edge stays in the file as a recorded "no", but is no part
// of the network: junctions, tips and every edit see only the others. Junctions and tips are counted
// over confirmed vessels only, so a candidate turns a point into a junction once it is accepted.

export const FORMAT = 'vessel-model/2';
const FORMATS = ['vessel-model/1', FORMAT];

export const STATES = ['vessel', 'candidate', 'accepted', 'rejected'];
const CONFIRMED = new Set(['vessel', 'accepted']);
export const confirmed = (s) => CONFIRMED.has(s.state);
export const live = (s) => s.state !== 'rejected';

export class ModelError extends Error {}

// Checks a parsed JSON file and returns the model with ids made consistent: every segment names two
// existing, different points, no segment is listed twice, and no point is left unconnected. Reads
// the straight-segment vessel-model/1 files too.
export function parse(j) {
  if (!j || !FORMATS.includes(j.format)) throw new ModelError(`it is not a vessel model (expected format "${FORMAT}")`);
  for (const k of ['slices', 'um_per_px']) if (!(j[k] > 0)) throw new ModelError(`it has no "${k}"`);
  if (!Array.isArray(j.size_px) || j.size_px.length !== 2) throw new ModelError('it has no "size_px"');
  const v2 = j.format === FORMAT, list = v2 ? j.edges : j.segments;
  if (!Array.isArray(j.nodes) || !Array.isArray(list)) throw new ModelError(`it has no "nodes" or "${v2 ? 'edges' : 'segments'}"`);
  const { nodes: _n, segments: _s, edges: _e, ...rest } = j;
  const m = { ...rest, format: FORMAT, nodes: new Map(), segments: [] };
  for (const n of j.nodes) {
    if (![n.x, n.y, n.z].every(Number.isFinite)) throw new ModelError(`point ${n.id} has no position`);
    m.nodes.set(n.id, pt(n.id, n));
  }
  let next = newId(m);
  const seen = new Set();
  for (const s of list) {
    if (!m.nodes.has(s.a) || !m.nodes.has(s.b)) throw new ModelError(`${v2 ? 'an edge' : 'a segment'} names a point that does not exist (${s.a}–${s.b})`);
    // a file written before segments had a state holds only the extractor's confident vessels
    const state = s.state ?? 'vessel';
    if (!STATES.includes(state)) throw new ModelError(`${v2 ? 'an edge' : 'a segment'} has the unknown state "${state}" (${s.a}–${s.b})`);
    const ids = [s.a], flow = FLOWS.includes(s.flow) ? s.flow : null;
    const { id: _i, a: _a, b: _b, via: _v, state: _st, confidence: _c, vessel: _ve, r_a: _ra, r_b: _rb, flow: _f, ...rest } = s;
    const extra = Object.keys(rest).length ? rest : null;
    for (const p of (v2 && s.via) || []) {
      if (![p.x, p.y, p.z].every(Number.isFinite)) throw new ModelError(`a curve point on edge ${s.a}–${s.b} has no position`);
      m.nodes.set(next, pt(next, p)); ids.push(next++);
    }
    ids.push(s.b);
    const r = taperAlong(m, ids, s.r_a, s.r_b);
    for (let i = 1; i < ids.length; i++) {
      const k = key(ids[i - 1], ids[i]);
      if (ids[i - 1] !== ids[i] && !seen.has(k)) {
        seen.add(k);
        m.segments.push(seg(ids[i - 1], ids[i], { state, confidence: s.confidence, vessel: s.vessel, ...(r && { ra: r[i - 1], rb: r[i] }), flow, extra }));
      }
    }
  }
  if (j.excluded_regions != null) {
    if (!Array.isArray(j.excluded_regions)) throw new ModelError('its "excluded_regions" is not a list');
    for (const r of j.excluded_regions) if (!Array.isArray(r?.polygon) || r.polygon.length < 3 || !r.polygon.every((q) => q?.length === 2 && q.every(Number.isFinite)))
      throw new ModelError('an excluded area has no outline of at least three points');
  }
  prune(m);
  return m;
}

// An edge narrows from its start width r_a to its end width r_b, steadily along its points. Blood flows
// along it as "ab" (from a to b) or "ba"; with no flow the direction is unknown.
const FLOWS = ['ab', 'ba'];
function taperAlong(m, ids, ra, rb) {
  if (!Number.isFinite(ra) || !Number.isFinite(rb)) return null;
  const P = ids.map((id) => m.nodes.get(id)), d = [0];
  for (let i = 1; i < P.length; i++) d.push(d[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y, P[i].z - P[i - 1].z));
  const L = d.at(-1) || 1;
  return d.map((v) => ra + (rb - ra) * v / L);
}
// A segment carries its own radius at each end (ra at a, rb at b) when its edge tapers, and its flow
// as "ab" or "ba" between its own ends. Seen from its end p: the radius there, at the far end, and
// whether blood flows away from p.
function from(s, p) {
  const fwd = p === s.a;
  return { r0: fwd ? s.ra : s.rb, r1: fwd ? s.rb : s.ra, out: s.flow == null ? null : (s.flow === 'ab') === fwd };
}
// the fields of a segment running from p, given what `from` reports for it there
const taper = ({ r0, r1, out }) => ({ ...(Number.isFinite(r0) && Number.isFinite(r1) && { ra: r0, rb: r1 }), ...(out != null && { flow: out ? 'ab' : 'ba' }) });
const bare = ({ ra: _a, rb: _b, flow: _f, ...rest }) => rest;

const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
// a radius the file does not give stays unknown rather than zero
const pt = (id, p) => (Number.isFinite(p.r) ? { id, x: p.x, y: p.y, z: p.z, r: p.r } : { id, x: p.x, y: p.y, z: p.z });
// confidence is the extractor's score and vessel its guess at which branch continues a trunk; a
// segment the owner drew has neither, and stays without them
// extra holds the edge's fields this viewer has no use for, written back as they came
const seg = (a, b, { state, confidence, vessel, ra, rb, flow, extra }) => ({ a, b, state, ...(confidence != null && { confidence }), ...(vessel != null && { vessel }),
  ...(Number.isFinite(ra) && Number.isFinite(rb) && { ra, rb }), ...(flow != null && { flow }), ...(extra && { extra }) });
const sameEdge = (p, q) => p.state === q.state && p.confidence === q.confidence && p.vessel === q.vessel && p.extra === q.extra;

// The segments at each point, rejected ones included, since a recorded "no" keeps its own ends.
function incidence(m) {
  const inc = new Map();
  m.segments.forEach((s, i) => { for (const n of [s.a, s.b]) { if (!inc.has(n)) inc.set(n, []); inc.get(n).push(i); } });
  return inc;
}
// A point inside one edge: exactly two segments meet there, and they belong to the same edge.
function throughPoint(m, inc, id) {
  const l = inc.get(id);
  return l?.length === 2 && l[0] !== l[1] && sameEdge(m.segments[l[0]], m.segments[l[1]]) ? l : null;
}

// The model's edges: each a run of segments between points that are not inside one edge, as the
// ordered point ids from a to b.
export function edges(m) {
  const inc = incidence(m), used = new Set(), out = [];
  const other = (s, n) => (s.a === n ? s.b : s.a);
  m.segments.forEach((s, i) => {
    if (used.has(i)) return;
    used.add(i);
    const ids = [s.a, s.b], segs = [i];
    for (const forward of [true, false]) {
      for (;;) {
        const end = forward ? ids.at(-1) : ids[0], l = throughPoint(m, inc, end);
        const j = l && l.find((k) => !used.has(k));
        if (j == null) break;
        used.add(j);
        if (forward) { ids.push(other(m.segments[j], end)); segs.push(j); } else { ids.unshift(other(m.segments[j], end)); segs.unshift(j); }
      }
    }
    out.push({ ids, segments: segs, ...m.segments[i] });
  });
  return out;
}

export function toJSON(m, extra = {}) {
  const { nodes, segments, ...rest } = m;
  const es = edges(m), ends = new Set(es.flatMap((e) => [e.ids[0], e.ids.at(-1)]));
  const at = (id) => { const { id: _, ...p } = nodes.get(id); return p; };
  return { ...rest, ...extra, format: FORMAT,
    nodes: [...nodes.values()].filter((n) => ends.has(n.id)),
    edges: es.map((e, k) => {
      const start = from(m.segments[e.segments[0]], e.ids[0]), end = from(m.segments[e.segments.at(-1)], e.ids.at(-1));
      const out = start.out ?? (end.out == null ? null : !end.out);
      return { ...e.extra, id: k + 1, a: e.ids[0], b: e.ids.at(-1), ...(e.vessel != null && { vessel: e.vessel }), state: e.state,
        ...(e.confidence != null && { confidence: e.confidence }),
        ...(Number.isFinite(start.r0) && Number.isFinite(end.r0) && { r_a: start.r0, r_b: end.r0 }), ...(out != null && { flow: out ? 'ab' : 'ba' }),
        via: e.ids.slice(1, -1).map(at) };
    }) };
}

// ---------- the curve ----------
// For each segment, the points either side of it along its edge (null at an edge's end), cached
// per model since a model is never changed in place.
const around = new WeakMap();
function neighbourhood(m) {
  if (around.has(m)) return around.get(m);
  const inc = incidence(m), out = m.segments.map((s, i) => {
    const beyond = (n) => { const l = throughPoint(m, inc, n); if (!l) return null; const t = m.segments[l[0] === i ? l[1] : l[0]]; return t.a === n ? t.b : t.a; };
    return [beyond(s.a), beyond(s.b)];
  });
  around.set(m, out);
  return out;
}

// The point at t (0..1) along segment i's stretch of its curve: centripetal Catmull-Rom through the
// segment's ends and the points either side, with an edge's end continued straight past itself.
export function curvePoint(m, i, t) {
  const s = m.segments[i], [pa, pb] = neighbourhood(m)[i];
  const P1 = m.nodes.get(s.a), P2 = m.nodes.get(s.b);
  const mirror = (p, q) => ({ x: 2 * p.x - q.x, y: 2 * p.y - q.y, z: 2 * p.z - q.z });
  const P0 = pa != null ? m.nodes.get(pa) : mirror(P1, P2), P3 = pb != null ? m.nodes.get(pb) : mirror(P2, P1);
  const out = catmullRom(P0, P1, P2, P3, t);
  const r1 = s.ra ?? P1.r, r2 = s.rb ?? P2.r;
  if (Number.isFinite(r1) && Number.isFinite(r2)) out.r = r1 + (r2 - r1) * t;
  return out;
}

// Centripetal Catmull-Rom between P1 and P2 (Barry and Goldman's form), over x, y and z as stored.
export function catmullRom(P0, P1, P2, P3, t) {
  const P = [P0, P1, P2, P3].map((p) => [p.x, p.y, p.z]);
  const d = (a, b) => Math.max(Math.sqrt(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])), 1e-6);
  const t0 = 0, t1 = d(P[0], P[1]), t2 = t1 + d(P[1], P[2]), t3 = t2 + d(P[2], P[3]);
  const u = t1 + (t2 - t1) * t;
  const lerp = (a, b, ta, tb) => a.map((v, k) => ((tb - u) * v + (u - ta) * b[k]) / (tb - ta));
  const A1 = lerp(P[0], P[1], t0, t1), A2 = lerp(P[1], P[2], t1, t2), A3 = lerp(P[2], P[3], t2, t3);
  const B1 = lerp(A1, A2, t0, t2), B2 = lerp(A2, A3, t1, t3), C = lerp(B1, B2, t1, t2);
  return { x: C[0], y: C[1], z: C[2] };
}

// n + 1 points along segment i's stretch of curve, ends included.
export const sampleSegment = (m, i, n) => Array.from({ length: n + 1 }, (_, k) => curvePoint(m, i, k / n));

export const clone = (m) => ({ ...m, nodes: new Map([...m.nodes].map(([k, n]) => [k, { ...n }])), segments: m.segments.map((s) => ({ ...s })) });

// How many segments meet at each point: confirmed vessels by default, or those `which` picks.
export function degrees(m, which = confirmed) {
  const d = new Map();
  for (const s of m.segments) if (which(s)) { d.set(s.a, (d.get(s.a) || 0) + 1); d.set(s.b, (d.get(s.b) || 0) + 1); }
  return d;
}
export const neighbours = (m, id) => m.segments.filter((s) => live(s) && (s.a === id || s.b === id)).map((s) => (s.a === id ? s.b : s.a));
const between = (m, a, b) => m.segments.find((s) => live(s) && key(s.a, s.b) === key(a, b));

function prune(m) {
  const d = degrees(m, () => true);
  for (const id of [...m.nodes.keys()]) if (!d.get(id)) m.nodes.delete(id);
}
function newId(m) { let k = 0; for (const id of m.nodes.keys()) if (id > k) k = id; return k + 1; }
function addNode(m, p) { const id = newId(m); m.nodes.set(id, pt(id, p)); return id; }
const DRAWN = { state: 'vessel' };
function link(m, a, b, like = DRAWN) {
  if (a === b) return false;
  const old = m.segments.findIndex((s) => key(s.a, s.b) === key(a, b));
  if (old >= 0 && live(m.segments[old])) return false;
  if (old >= 0) m.segments.splice(old, 1);   // drawn again where a rejected candidate lay: the owner has changed their mind
  m.segments.push(seg(a, b, like)); return true;
}
// the less certain of two segments' states, for a segment that replaces both
const merged = (p, q) => (p.state === 'candidate' ? p : q.state === 'candidate' ? q : confirmed(p) ? p : q);

// Each edit returns a new model and leaves the one it was given unchanged, so undo is a list of models.

export function moveNode(m, id, p) {
  const o = clone(m); Object.assign(o.nodes.get(id), { x: p.x, y: p.y, z: p.z }); return o;
}

export function deleteSegment(m, i) {
  const o = clone(m); o.segments.splice(i, 1); prune(o); return o;
}

export function deleteNode(m, id) {
  const o = clone(m); o.segments = o.segments.filter((s) => !live(s) || (s.a !== id && s.b !== id)); prune(o); return o;
}

// A curve point taken out: the curve runs on from one neighbour to the other.
export function removeBend(m, id) {
  const nb = neighbours(m, id);
  if (nb.length !== 2) return m;
  const p = between(m, id, nb[0]), q = between(m, id, nb[1]), here = from(p, nb[0]), there = from(q, nb[1]);
  const o = deleteNode(m, id);
  for (const n of nb) if (!o.nodes.has(n)) o.nodes.set(n, { ...m.nodes.get(n) });
  link(o, nb[0], nb[1], { ...bare(merged(p, q)), ...taper({ r0: here.r0, r1: there.r0, out: here.out ?? (there.out == null ? null : !there.out) }) });
  return o;
}

// A point placed on the curve of segment i at fraction t from its first end, so the curve keeps its
// shape until the point is moved; returns [model, new point id].
export function splitSegment(m, i, t) {
  const o = clone(m), s = o.segments[i], p = curvePoint(m, i, t);
  const id = addNode(o, p);
  o.segments.splice(i, 1, seg(s.a, id, { ...s, rb: p.r }), seg(id, s.b, { ...s, ra: p.r }));
  return [o, id];
}

// The junction is wrong: its vessels pass each other instead of meeting. The branches are paired off
// most-opposite first (a vessel runs straight through a crossing), each pair keeps its own point at
// the depth between its two neighbours, and a branch left over becomes a tip set a little back from
// the crossing so it reads as detached. zScale converts slices to µm for the angles.
export function splitJunction(m, id, zScale = 1) {
  const nb = neighbours(m, id);
  if (nb.length < 3) return m;
  const N = m.nodes.get(id);
  const dir = nb.map((k) => { const P = m.nodes.get(k), v = [P.x - N.x, P.y - N.y, (P.z - N.z) * zScale], l = Math.hypot(...v) || 1; return v.map((x) => x / l); });
  const left = new Set(nb.map((_, i) => i)), groups = [];
  while (left.size >= 2) {
    let best = null;
    for (const i of left) for (const j of left) if (i < j) {
      const c = dir[i][0] * dir[j][0] + dir[i][1] * dir[j][1] + dir[i][2] * dir[j][2];
      if (!best || c < best[2]) best = [i, j, c];
    }
    groups.push([best[0], best[1]]); left.delete(best[0]); left.delete(best[1]);
  }
  for (const i of left) groups.push([i]);
  const like = nb.map((k) => between(m, id, k));
  const o = clone(m);
  o.segments = o.segments.filter((s) => !live(s) || (s.a !== id && s.b !== id));
  if (!o.segments.some((s) => s.a === id || s.b === id)) o.nodes.delete(id);
  for (const g of groups) {
    const ps = g.map((i) => m.nodes.get(nb[i]));
    const p = g.length === 2
      ? { x: N.x, y: N.y, z: (ps[0].z + ps[1].z) / 2 }
      : { x: N.x + (ps[0].x - N.x) * .25, y: N.y + (ps[0].y - N.y) * .25, z: N.z + (ps[0].z - N.z) * .25 };
    if (Number.isFinite(N.r)) p.r = N.r;
    const nid = addNode(o, p);
    // the pair is one vessel running through
    for (const i of g) { if (!o.nodes.has(nb[i])) o.nodes.set(nb[i], { ...m.nodes.get(nb[i]) }); link(o, nid, nb[i], { ...bare(like[i]), vessel: like[g[0]].vessel, ...taper(from(like[i], id)) }); }
  }
  return o;
}

// Two parts of one vessel joined. Each end is {node: id} or {segment: i, t}, a point on a segment.
export const connect = (m, from, to) => join(m, from, to)[0];

// A vessel the extractor missed, drawn a segment at a time: from one end to the next, where an end
// may also be {point: {x, y, z}}, a new point in the open. Returns [model, id of the point drawn to],
// or the model unchanged and null when the two ends are one point or already joined.
export const drawSegment = (m, from, to) => { const [o, ids] = join(m, from, to); return o === m ? [m, null] : [o, ids[1]]; };

function join(m, from, to) {
  let o = m;
  const ids = [];
  // split the later-listed segment first so the earlier index stays valid
  const ends = [from, to].map((e, k) => ({ ...e, k })).sort((p, q) => (q.segment ?? -1) - (p.segment ?? -1));
  for (const e of ends) {
    if (e.node != null) { ids[e.k] = e.node; continue; }
    if (e.point) { if (o === m) o = clone(m); ids[e.k] = addNode(o, e.point); continue; }
    [o, ids[e.k]] = splitSegment(o, e.segment, e.t);
  }
  if (ids[0] === ids[1]) return [m, ids];
  if (o === m) o = clone(m);
  return link(o, ids[0], ids[1]) ? [o, ids] : [m, ids];
}

// The segments of the one vessel segment i belongs to, as far as its state runs: it continues
// through points where only it and one other segment meet, and stops at a junction, a tip, or where
// a segment in another state takes over.
export function piece(m, i) {
  const state = m.segments[i].state, d = degrees(m, (t) => live(t) || t.state === state), out = new Set([i]), todo = [i];
  while (todo.length) {
    const s = m.segments[todo.pop()];
    for (const n of [s.a, s.b]) {
      if (d.get(n) !== 2) continue;
      const j = m.segments.findIndex((t, k) => !out.has(k) && t.state === state && (t.a === n || t.b === n));
      if (j >= 0) { out.add(j); todo.push(j); }
    }
  }
  return [...out].sort((a, b) => a - b);
}

// The owner's verdict on a candidate: the whole vessel it belongs to is accepted or rejected.
export function review(m, i, verdict) {
  if (m.segments[i]?.state !== 'candidate' || !['accepted', 'rejected'].includes(verdict)) return m;
  const o = clone(m);
  for (const k of piece(m, i)) o.segments[k].state = verdict;
  return o;
}

// How many vessels (junction to junction, not segments between curve points) are in each state, and
// how many of the live ones lie mostly in an area marked as damaged, counted there instead.
export function pieceCounts(m) {
  const n = { ...Object.fromEntries(STATES.map((s) => [s, 0])), excluded: 0 }, seen = new Set();
  m.segments.forEach((s, i) => {
    if (seen.has(i)) return;
    const p = piece(m, i);
    for (const k of p) seen.add(k);
    n[live(s) && 2 * p.filter((k) => excluded(m, curvePoint(m, k, .5))).length > p.length ? 'excluded' : s.state]++;
  });
  return n;
}

// Counts over the confirmed vessels, leaving out whatever lies in an area marked as damaged.
export function stats(m) {
  const d = degrees(m), all = degrees(m, live), out = (id) => excluded(m, m.nodes.get(id));
  let junctions = 0, tips = 0, pending = 0, segments = 0, excludedSegments = 0;
  for (const [id, v] of d) { if (out(id)) continue; if (v >= 3) junctions++; else if (v === 1) tips++; }
  for (const [id, v] of all) if (v >= 3 && !((d.get(id) || 0) >= 3) && !out(id)) pending++;
  m.segments.forEach((s, i) => { if (confirmed(s)) { if (excluded(m, curvePoint(m, i, .5))) excludedSegments++; else segments++; } });
  return { points: m.nodes.size, segments, excludedSegments, junctions, tips, pendingJunctions: pending };
}

// ---------- areas excluded from analysis ----------
// Areas the owner marked as damaged sample (a fold, a tear, a bubble, debris, out of focus), each an
// outline of x, y points in µm drawn from above. An area runs through every slice: the stacks are thin
// and damage cuts through them. Analysis leaves out what lies inside, and measures density over the
// rest of the field.
export const REASONS = ['fold', 'tear', 'bubble', 'debris', 'out of focus', 'other'];

function inPolygon(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export const excluded = (m, p) => (m.excluded_regions || []).some((r) => inPolygon(r.polygon, p.x, p.y));
const area = (poly) => Math.abs(poly.reduce((a, [x, y], i) => { const [u, v] = poly[(i + 1) % poly.length]; return a + x * v - u * y; }, 0)) / 2;

// A new area from an outline; an outline enclosing nothing leaves the model as it was.
export function markExcluded(m, polygon, reason) {
  if (polygon.length < 3 || !(area(polygon) > 0)) return m;
  return { ...m, excluded_regions: [...(m.excluded_regions || []), { polygon: polygon.map(([x, y]) => [x, y]), ...(reason && { reason }) }] };
}
export const unmarkExcluded = (m, k) => ({ ...m, excluded_regions: (m.excluded_regions || []).filter((_, i) => i !== k) });

// The share of the field the areas cover, overlaps counted once, sampled on a fine grid.
export function excludedFraction(m, n = 500) {
  const rs = m.excluded_regions || [];
  if (!rs.length) return 0;
  const W = m.size_px[0] * m.um_per_px, H = m.size_px[1] * m.um_per_px;
  let hit = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (excluded(m, { x: (i + .5) * W / n, y: (j + .5) * H / n })) hit++;
  return hit / (n * n);
}
