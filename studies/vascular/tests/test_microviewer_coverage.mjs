// The part of the stack a vessel model accounts for, which the MicroViewer's Detected and Missed
// reviews show and hide. Run: node tests/test_microviewer_coverage.mjs
import assert from 'node:assert/strict';
import * as Mo from '../web/model.js';
import { coverage } from '../web/coverage.js';

// a 40 × 40 µm image of 4 slices at 1 µm/px, with one straight vessel along y = 20 in slice 1
const model = (r, state = 'vessel') => Mo.parse({ format: 'vessel-model/2', source: 'acme.tif', slices: 4, size_px: [40, 40], um_per_px: 1,
  nodes: [{ id: 1, x: 5, y: 20.5, z: 1, ...(r != null && { r }) }, { id: 2, x: 35, y: 20.5, z: 1, ...(r != null && { r }) }],
  edges: [{ id: 1, a: 1, b: 2, state, via: [] }] });
const at = (mask, z, y, x) => mask[(z * 40 + y) * 40 + x];
const all = () => true;

const tests = {
  'the tube covers the vessel to its radius plus the reach, a share of its width, and nothing beyond'() {
    const mask = coverage(model(2), [4, 40, 40], { zStepUm: 10, reachOfWidth: .25, which: all });
    for (const y of [18, 20, 22]) assert.equal(at(mask, 1, y, 20), 255, `row ${y} is within 2 + 25% of 4 µm of the centre line`);
    for (const y of [16, 25]) assert.equal(at(mask, 1, y, 20), 0, `row ${y} is beyond it`);
    assert.equal(at(mask, 1, 20, 1), 0, 'nothing past the tip');
    assert.equal(at(mask, 0, 20, 20) + at(mask, 2, 20, 20), 0, 'at 10 µm a slice, the next slices are out of reach');
  },
  'the same share reaches less past a narrow vessel than past a thick one'() {
    const thin = coverage(model(1), [4, 40, 40], { zStepUm: 10, reachOfWidth: 1, which: all });
    const thick = coverage(model(3), [4, 40, 40], { zStepUm: 10, reachOfWidth: 1, which: all });
    const none = coverage(model(1), [4, 40, 40], { zStepUm: 10, reachOfWidth: 0, which: all });
    assert.equal(at(none, 1, 22, 20), 0, 'a 2 µm vessel at 0% stops at its wall, 1 µm out');
    assert.equal(at(thin, 1, 22, 20), 255, 'at 100% it reaches 3 µm out');
    assert.equal(at(thin, 1, 24, 20), 0, 'and no further');
    assert.equal(at(thick, 1, 28, 20), 255, 'while a 6 µm vessel at 100% reaches 9 µm out');
  },
  'the reach in depth follows the slice spacing'() {
    const mask = coverage(model(2.5), [4, 40, 40], { zStepUm: 1, reachOfWidth: 0, which: all });
    for (const z of [0, 1, 2, 3]) assert.equal(at(mask, z, 20, 20), 255, `slice ${z} is within 2.5 µm`);
  },
  'a thin vessel still covers the voxels its centre line passes through'() {
    const mask = coverage(model(.05), [4, 40, 40], { zStepUm: 10, reachOfWidth: 0, which: all });
    assert.equal(at(mask, 1, 20, 20), 255);
  },
  'a vessel the file gives no radius is drawn with the median radius, and one not chosen is not drawn'() {
    assert.equal(coverage(model(null), [4, 40, 40], { zStepUm: 10, reachOfWidth: 0, which: all }).some((v) => v), true);
    assert.equal(coverage(model(2, 'rejected'), [4, 40, 40], { zStepUm: 10, reachOfWidth: 2, which: Mo.live }).some((v) => v), false);
  },
  'a binned volume maps the model the same way'() {
    const mask = coverage(model(2), [4, 20, 20], { zStepUm: 10, reachOfWidth: 0, which: all });
    assert.equal(mask[(1 * 20 + 10) * 20 + 10], 255);
    assert.equal(mask[(1 * 20 + 13) * 20 + 10], 0);
  },
};

let n = 0;
for (const [name, fn] of Object.entries(tests)) { fn(); n++; console.log('ok', name); }
assert.equal(n, 6);
