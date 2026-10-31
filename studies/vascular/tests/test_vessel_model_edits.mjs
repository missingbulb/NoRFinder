// The vessel-model edits the 3D MicroViewer offers, on small drawn models.
// Run: node tests/test_vessel_model_edits.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Mo from '../web/model.js';

const base = (nodes, segments) => ({ format: 'vessel-model/1', source: 'acme.tif', slices: 4, size_px: [100, 100], um_per_px: 1,
  nodes: nodes.map(([id, x, y, z]) => ({ id, x, y, z })),
  segments: segments.map(([a, b, state, confidence]) => ({ a, b, ...(state && { state }), ...(confidence != null && { confidence }) })) });
// a confirmed vessel 1-2-3 along y = 0, and a two-segment candidate 2-4-5 branching off its middle
const branching = () => Mo.parse(base([[1, 0, 0, 0], [2, 10, 0, 0], [3, 20, 0, 0], [4, 10, 10, 0], [5, 10, 20, 0]],
  [[1, 2, 'vessel', .9], [2, 3, 'vessel', .9], [2, 4, 'candidate', .4], [4, 5, 'candidate', .4]]));
const states = (m) => m.segments.map((s) => `${Math.min(s.a, s.b)}-${Math.max(s.a, s.b)}:${s.state}`).sort();
const SAMPLE = JSON.parse(readFileSync(new URL('./fixtures/format-v2-sample.vessels.json', import.meta.url)));
const round = (v) => Math.round(v * 1e9) / 1e9;
const pairs = (m) => m.segments.map(({ a, b }) => [Math.min(a, b), Math.max(a, b)].join('-')).sort();

const tests = {
  'parse refuses a file that is not a model, and one naming a missing point'() {
    assert.throws(() => Mo.parse({ format: 'x' }), Mo.ModelError);
    assert.throws(() => Mo.parse({ ...base([], []), slices: 0 }), Mo.ModelError);
    assert.throws(() => Mo.parse({ ...base([], []), size_px: [1] }), Mo.ModelError);
    assert.throws(() => Mo.parse(base([[1, 0, 0, null]], [])), Mo.ModelError);
    assert.throws(() => Mo.parse(base([[1, 0, 0, 0]], [[1, 9]])), Mo.ModelError);
  },
  'parse drops repeated and self segments and unconnected points'() {
    const m = Mo.parse(base([[1, 0, 0, 0], [2, 1, 0, 0], [3, 5, 5, 0]], [[1, 2], [2, 1], [1, 1]]));
    assert.deepEqual(pairs(m), ['1-2']);
    assert.equal(m.nodes.has(3), false);
  },
  'edits leave the model they were given unchanged'() {
    const m = Mo.parse(base([[1, 0, 0, 0], [2, 10, 0, 0]], [[1, 2]]));
    const o = Mo.moveNode(m, 2, { x: 3, y: 4, z: 1 });
    assert.deepEqual(m.nodes.get(2), { id: 2, x: 10, y: 0, z: 0 });
    assert.deepEqual(o.nodes.get(2), { id: 2, x: 3, y: 4, z: 1 });
  },
  'deleting a segment drops the points it leaves alone'() {
    const m = Mo.parse(base([[1, 0, 0, 0], [2, 10, 0, 0], [3, 20, 0, 0]], [[1, 2], [2, 3]]));
    const o = Mo.deleteSegment(m, 1);
    assert.deepEqual(pairs(o), ['1-2']);
    assert.deepEqual([...o.nodes.keys()].sort(), [1, 2]);
  },
  'deleting a junction point removes all its segments'() {
    const m = Mo.parse(base([[1, 50, 50, 0], [2, 40, 50, 0], [3, 60, 50, 0], [4, 50, 40, 0]], [[1, 2], [1, 3], [1, 4]]));
    const o = Mo.deleteNode(m, 1);
    assert.equal(o.segments.length, 0); assert.equal(o.nodes.size, 0);
  },
  'removing a bend joins its neighbours'() {
    const m = Mo.parse(base([[1, 0, 0, 0], [2, 10, 5, 0], [3, 20, 0, 0]], [[1, 2], [2, 3]]));
    assert.deepEqual(pairs(Mo.removeBend(m, 2)), ['1-3']);
  },
  'a crossing junction splits into two vessels passing through, each at its own depth'() {
    // an X: 2-1-3 runs left to right at depth 0, 4-1-5 top to bottom at depth 3
    const m = Mo.parse(base([[1, 50, 50, 1], [2, 40, 50, 0], [3, 60, 50, 0], [4, 50, 40, 3], [5, 50, 60, 3]],
      [[1, 2], [1, 4], [1, 3], [1, 5]]));
    const o = Mo.splitJunction(m, 1), deg = Mo.degrees(o);
    assert.equal(o.nodes.has(1), false);
    const mids = [...o.nodes.values()].filter((n) => deg.get(n.id) === 2);
    assert.equal(mids.length, 2);
    assert.deepEqual(mids.map((n) => Mo.neighbours(o, n.id).sort((a, b) => a - b).join(',')).sort(), ['2,3', '4,5']);
    assert.deepEqual(mids.map((n) => n.z).sort(), [0, 3]);
  },
  'a split Y keeps the straight pair and detaches the third branch as a tip'() {
    const m = Mo.parse(base([[1, 50, 50, 0], [2, 40, 50, 0], [3, 60, 50, 0], [4, 55, 40, 0]], [[1, 2], [1, 3], [1, 4]]));
    const o = Mo.splitJunction(m, 1), s = Mo.stats(o);
    assert.equal(s.junctions, 0); assert.equal(s.tips, 4); assert.equal(o.segments.length, 3);
    const tip = [...o.nodes.values()].find((n) => Mo.neighbours(o, n.id)[0] === 4 && Mo.degrees(o).get(n.id) === 1);
    assert.ok(tip.y < 50 && tip.y > 40, 'the detached tip sits back from the crossing');
  },
  'connecting two points adds one segment, and never a repeated one'() {
    const m = Mo.parse(base([[1, 0, 0, 0], [2, 10, 0, 0], [3, 30, 0, 0], [4, 40, 0, 0]], [[1, 2], [3, 4]]));
    const o = Mo.connect(m, { node: 2 }, { node: 3 });
    assert.deepEqual(pairs(o), ['1-2', '2-3', '3-4']);
    assert.equal(Mo.connect(o, { node: 2 }, { node: 3 }), o);
  },
  'connecting onto the middle of segments places a point on each'() {
    const m = Mo.parse(base([[1, 0, 0, 0], [2, 10, 0, 2], [3, 0, 20, 0], [4, 10, 20, 0]], [[1, 2], [3, 4]]));
    const o = Mo.connect(m, { segment: 0, t: .5 }, { segment: 1, t: .25 });
    assert.equal(o.segments.length, 5);
    const added = [...o.nodes.values()].filter((n) => n.id > 4).sort((a, b) => a.y - b.y);
    assert.deepEqual(added.map(({ x, y, z }) => [x, y, z].map(round)), [[5, 0, 1], [2.5, 20, 0]]);
    assert.equal(Mo.stats(o).junctions, 2);
  },
  'toJSON round-trips through parse'() {
    const m = Mo.parse(base([[1, 0, 0, 0], [2, 10, 0, 1]], [[1, 2]]));
    const back = Mo.parse(Mo.toJSON(m));
    assert.deepEqual(pairs(back), ['1-2']); assert.deepEqual(back.nodes.get(2), m.nodes.get(2));
  },
  'a file without states reads as confirmed vessels, and an unknown state is refused'() {
    const m = Mo.parse(base([[1, 0, 0, 0], [2, 10, 0, 0]], [[1, 2]]));
    assert.equal(m.segments[0].state, 'vessel');
    assert.equal('confidence' in m.segments[0], false, 'a segment nobody scored stays unscored');
    assert.throws(() => Mo.parse(base([[1, 0, 0, 0], [2, 10, 0, 0]], [[1, 2, 'maybe']])), Mo.ModelError);
  },
  'junctions and tips count confirmed vessels only; a candidate branch makes a pending junction'() {
    const s = Mo.stats(branching());
    assert.deepEqual([s.junctions, s.tips, s.pendingJunctions, s.segments], [0, 2, 1, 2]);
  },
  'approving a candidate accepts its whole vessel, and its branch point becomes a junction'() {
    const m = branching(), o = Mo.review(m, 3, 'accepted');
    assert.deepEqual(states(o), ['1-2:vessel', '2-3:vessel', '2-4:accepted', '4-5:accepted']);
    assert.deepEqual(states(m), ['1-2:vessel', '2-3:vessel', '2-4:candidate', '4-5:candidate'], 'the model given stays unchanged');
    const s = Mo.stats(o);
    assert.deepEqual([s.junctions, s.tips, s.pendingJunctions], [1, 3, 0]);
  },
  'a review covers one vessel: it stops at a junction and leaves a neighbouring candidate alone'() {
    // two candidates meeting a confirmed vessel at the same point: 2-4 and 2-6
    const m = Mo.parse(base([[1, 0, 0, 0], [2, 10, 0, 0], [3, 20, 0, 0], [4, 10, 10, 0], [6, 10, -10, 0]],
      [[1, 2, 'vessel'], [2, 3, 'vessel'], [2, 4, 'candidate'], [2, 6, 'candidate']]));
    assert.deepEqual(states(Mo.review(m, 2, 'rejected')), ['1-2:vessel', '2-3:vessel', '2-4:rejected', '2-6:candidate']);
    assert.equal(Mo.review(m, 0, 'rejected'), m, 'only a candidate is reviewed');
  },
  'a declined candidate stays in the file but is no part of the network'() {
    const o = Mo.review(branching(), 2, 'rejected');
    assert.deepEqual(states(o), ['1-2:vessel', '2-3:vessel', '2-4:rejected', '4-5:rejected']);
    assert.deepEqual(Mo.neighbours(o, 2).sort(), [1, 3]);
    assert.deepEqual(Mo.pieceCounts(o), { vessel: 1, candidate: 0, accepted: 0, rejected: 1, excluded: 0 });
    // with the rejected branch ignored, point 2 is a plain bend and can be straightened
    const straight = Mo.removeBend(o, 2);
    assert.deepEqual(states(straight), ['1-3:vessel', '2-4:rejected', '4-5:rejected']);
    const back = Mo.parse(Mo.toJSON(o));
    assert.deepEqual(Mo.pieceCounts(back), Mo.pieceCounts(o));
    assert.deepEqual(back.segments.filter((s) => s.state === 'rejected').map((s) => s.confidence), [.4, .4]);
  },
  'edits keep a segment\'s state: a bend point splits a candidate into two candidates'() {
    const [o] = Mo.splitSegment(branching(), 3, .5);
    assert.deepEqual(o.segments.filter((s) => s.state === 'candidate').length, 3);
    assert.equal(Mo.piece(o, 2).length, 3, 'the split candidate is still one vessel');
    const c = Mo.connect(branching(), { node: 1 }, { node: 5 });
    assert.equal(c.segments.at(-1).state, 'vessel', 'a segment the owner draws is a vessel');
    assert.equal('confidence' in c.segments.at(-1), false);
  },
  'a v2 file reads as points along curves and writes back as the same edges'() {
    const m = Mo.parse(SAMPLE);
    assert.equal(m.nodes.size, 6, 'four junctions and tips, and two curve points');
    assert.equal(m.segments.length, 5);
    assert.deepEqual([Mo.stats(m).junctions, Mo.stats(m).tips], [1, 3]);
    const out = Mo.toJSON(m);
    assert.equal(out.format, 'vessel-model/2'); assert.equal('segments' in out, false);
    assert.deepEqual(out.nodes, SAMPLE.nodes);
    assert.deepEqual(out.edges.map(({ a, b, vessel, via }) => ({ a, b, vessel, via })), SAMPLE.edges.map(({ a, b, vessel, via }) => ({ a, b, vessel, via })));
    assert.deepEqual(out.reviewed_regions, SAMPLE.reviewed_regions);
  },
  'the curve passes through every point, and smoothly through a curve point'() {
    const m = Mo.parse(SAMPLE), via = [...m.nodes.values()].find((n) => n.x === 126.1);
    const [i, j] = m.segments.map((s, k) => k).filter((k) => [m.segments[k].a, m.segments[k].b].includes(via.id));
    const end = (k, n) => Mo.curvePoint(m, k, m.segments[k].a === n ? 0 : 1);
    for (const k of [i, j]) assert.deepEqual(['x', 'y', 'z'].map((c) => round(end(k, via.id)[c])), [via.x, via.y, via.z]);
    // the direction leaving the curve point is the direction arriving at it
    const near = (k, n, d) => Mo.curvePoint(m, k, m.segments[k].a === n ? d : 1 - d);
    const a = near(i, via.id, 1e-4), b = near(j, via.id, 1e-4);
    const va = [a.x - via.x, a.y - via.y], vb = [b.x - via.x, b.y - via.y];
    const cos = (va[0] * vb[0] + va[1] * vb[1]) / Math.hypot(...va) / Math.hypot(...vb);
    assert.ok(cos < -0.999, `the curve bends sharply at its curve point (cos ${cos})`);
    assert.ok(Math.abs(Mo.curvePoint(m, i, .5).r - 3.05) < 1e-9, 'the radius runs between the points carrying it');
  },
  'a curve point added or removed keeps one edge, with one more or one fewer point'() {
    const m = Mo.parse(SAMPLE), i = m.segments.findIndex((s) => s.a === 2 && s.b === 3);
    const [o, id] = Mo.splitSegment(m, i, .5);
    const e = Mo.toJSON(o).edges.find((x) => x.a === 2 && x.b === 3);
    assert.equal(e.via.length, 1); assert.equal(e.vessel, 1);
    assert.equal(Mo.toJSON(Mo.removeBend(o, id)).edges.find((x) => x.a === 2 && x.b === 3).via.length, 0);
  },
  'an edge ends where the state or the vessel changes, even where only two segments meet'() {
    const m = Mo.parse(base([[1, 0, 0, 0], [2, 10, 0, 0], [3, 20, 0, 0], [4, 30, 0, 0], [5, 40, 0, 0]],
      [[1, 2, 'vessel'], [2, 3, 'vessel'], [3, 4, 'candidate', .3], [4, 5, 'candidate', .3]]));
    const out = Mo.toJSON(m);
    assert.deepEqual(out.edges.map(({ a, b, state, via }) => [a, b, state, via.length]), [[1, 3, 'vessel', 1], [3, 5, 'candidate', 1]]);
    assert.deepEqual(out.nodes.map((n) => n.id), [1, 3, 5]);
  },
  'splitting a crossing keeps each vessel running through as one vessel'() {
    const m = Mo.parse({ ...SAMPLE, nodes: [{ id: 1, x: 50, y: 50, z: 1 }, { id: 2, x: 40, y: 50, z: 0 }, { id: 3, x: 60, y: 50, z: 0 }, { id: 4, x: 50, y: 40, z: 3 }, { id: 5, x: 50, y: 60, z: 3 }],
      edges: [[1, 2, 7], [1, 3, 8], [1, 4, 9], [1, 5, 9]].map(([a, b, vessel], k) => ({ id: k + 1, a, b, vessel, via: [] })) });
    const out = Mo.toJSON(Mo.splitJunction(m, 1));
    assert.equal(out.edges.length, 2, 'two vessels, each one edge through its own crossing point');
    assert.deepEqual(out.edges.map((e) => e.via.length), [1, 1]);
  },
  'a vessel tapers from its start width to its end width, whatever the junctions it meets carry'() {
    // edge 2-4 narrows from 2 µm at the junction to 1 µm at the tip, through its one via point
    const j = { ...SAMPLE, edges: SAMPLE.edges.map((e) => (e.id === 3 ? { ...e, r_a: 2, r_b: 1, flow: 'ab' } : e)) };
    const m = Mo.parse(j), radius = (i, t) => Mo.curvePoint(m, i, t).r;
    const tip = m.segments.findIndex((s) => s.b === 4), root = m.segments.findIndex((s) => s.a === 2 && s.b === m.segments[tip].a);
    assert.ok(tip >= 0 && root >= 0);
    assert.equal(radius(root, 0), 2, 'the start width, not the 2.9 µm junction');
    assert.equal(radius(tip, 1), 1, 'the end width, not the 1.4 µm tip');
    const mid = radius(root, 1);
    assert.ok(mid < 2 && mid > 1 && Math.abs(radius(tip, 0) - mid) < 1e-9, 'it narrows steadily through the via point');
    const e = Mo.toJSON(m).edges.find((x) => x.b === 4);
    assert.deepEqual([e.r_a, e.r_b, e.flow], [2, 1, 'ab'], 'the taper and flow are written back');
    assert.equal(Mo.toJSON(m).edges.find((x) => x.b === 3).r_a, undefined, 'an edge without a taper is written without one');
  },
  'edits keep a vessel’s taper and flow'() {
    const m = Mo.parse({ ...SAMPLE, edges: [{ id: 1, a: 1, b: 2, vessel: 1, r_a: 3, r_b: 1, flow: 'ba', via: [] }, { id: 2, a: 2, b: 3, vessel: 2, via: [] }] });
    const [o, id] = Mo.splitSegment(m, 0, .5);
    assert.ok(Math.abs(Mo.curvePoint(o, 0, 1).r - Mo.curvePoint(m, 0, .5).r) < 1e-9, 'the new curve point sits at the width it was placed at');
    let e = Mo.toJSON(o).edges.find((x) => x.a === 1);
    assert.deepEqual([e.via.length, e.r_a, e.r_b, e.flow], [1, 3, 1, 'ba']);
    e = Mo.toJSON(Mo.removeBend(o, id)).edges.find((x) => x.a === 1);
    assert.deepEqual([e.via.length, e.r_a, e.r_b, e.flow], [0, 3, 1, 'ba'], 'and taking the point out again restores the edge');
  },
  'an edge keeps the fields the viewer does not know through edits and the download'() {
    const m = Mo.parse({ ...SAMPLE, edges: [{ id: 1, a: 1, b: 2, vessel: 1, taper_known: true, bridged: true, via: [] }, { id: 2, a: 2, b: 3, vessel: 2, via: [] }] });
    const [o] = Mo.splitSegment(m, 0, .5);
    const out = Mo.toJSON(o).edges;
    assert.deepEqual([out[0].taper_known, out[0].bridged, out[0].via.length], [true, true, 1]);
    assert.equal(out[1].bridged, undefined);
  },
  'a missed vessel is drawn point by point, as one edge that joins the network where it ends'() {
    const m = Mo.parse(base([[1, 0, 0, 0], [2, 20, 0, 0]], [[1, 2, 'vessel', .9]]));
    let [o, id] = Mo.drawSegment(m, { point: { x: 10, y: 30, z: 1 } }, { point: { x: 10, y: 20, z: 1 } });
    assert.equal(m.segments.length, 1, 'the model drawn on is unchanged');
    [o, id] = Mo.drawSegment(o, { node: id }, { point: { x: 10, y: 10, z: 0 } });
    [o] = Mo.drawSegment(o, { node: id }, { segment: 0, t: .5 });
    const out = Mo.toJSON(o);
    assert.equal(Mo.stats(o).junctions, 1, 'the drawn vessel meets the old one in a junction');
    const drawn = out.edges.find((e) => e.via.length === 2);
    assert.ok(drawn, 'the three drawn segments are one edge through two curve points');
    assert.equal(drawn.state, 'vessel'); assert.equal(drawn.confidence, undefined);
    assert.deepEqual(Mo.drawSegment(o, { node: 1 }, { node: 1 }), [o, null]);
  },
  'an area marked as damaged leaves the vessels inside it out of the counts'() {
    // a vessel 1-2-3 along y = 0 with a branch 2-4-5 down to y = 50, and a damaged area around the branch
    const m = Mo.parse(base([[1, 0, 0, 0], [2, 20, 0, 0], [3, 40, 0, 0], [4, 20, 30, 0], [5, 20, 50, 0]], [[1, 2], [2, 3], [2, 4], [4, 5]]));
    const square = [[10, 10], [30, 10], [30, 60], [10, 60]];
    const o = Mo.markExcluded(m, square, 'fold');
    assert.equal(m.excluded_regions, undefined, 'the model marked on is unchanged');
    assert.deepEqual(o.excluded_regions, [{ polygon: square, reason: 'fold' }]);
    assert.ok(Mo.excluded(o, { x: 20, y: 40 })); assert.ok(!Mo.excluded(o, { x: 20, y: 5 }));
    assert.deepEqual(Mo.stats(m).segments, 4);
    const s = Mo.stats(o);
    assert.equal(s.segments, 2, 'the segments inside the area are left out'); assert.equal(s.excludedSegments, 2);
    assert.equal(s.tips, 2, 'and so is the tip inside it');
    assert.equal(Mo.excludedFraction(o), 20 * 50 / (100 * 100));
    assert.deepEqual([Mo.pieceCounts(m).vessel, Mo.pieceCounts(m).excluded], [3, 0]);
    assert.deepEqual([Mo.pieceCounts(o).vessel, Mo.pieceCounts(o).excluded], [2, 1], 'the branch 2-4-5 lies mostly in the area');
    assert.deepEqual(Mo.unmarkExcluded(o, 0).excluded_regions, []);
  },
  'an outline with no area is not an area, and the areas go into the file unchanged'() {
    const m = Mo.parse(base([[1, 0, 0, 0], [2, 20, 0, 0]], [[1, 2]]));
    assert.equal(Mo.markExcluded(m, [[0, 0], [10, 10]]), m);
    assert.equal(Mo.markExcluded(m, [[0, 0], [10, 10], [20, 20]]), m);
    const o = Mo.markExcluded(m, [[0, 0], [10, 0], [10, 10]]);
    assert.deepEqual(Mo.parse(Mo.toJSON(o)).excluded_regions, o.excluded_regions);
    assert.throws(() => Mo.parse({ ...Mo.toJSON(o), excluded_regions: [{ polygon: [[0, 0], [1, 1]] }] }), Mo.ModelError);
    assert.throws(() => Mo.parse({ ...Mo.toJSON(o), excluded_regions: [{ polygon: [[0, 0], [1, 'x'], [2, 0]] }] }), Mo.ModelError);
  },
};

let n = 0;
for (const [name, fn] of Object.entries(tests)) { fn(); n++; console.log('ok', name); }
assert.equal(n, 28);
