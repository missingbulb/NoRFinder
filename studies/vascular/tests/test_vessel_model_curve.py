"""The extractor fits the same curve the 3D MicroViewer draws, and fits it with few points.

The curve is written twice, in analysis/vessel_model.py (which fits it) and web/model.js
(which draws and edits it); this runs both on the format sample and on random points and requires
them to agree, so neither can drift from the other. Needs node on the PATH.

Run: python3 tests/test_vessel_model_curve.py
"""
import json
import os
import subprocess
import sys

import numpy as np
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'analysis'))
import vessel_model as vm

pytestmark = pytest.mark.full

MODEL_JS = os.path.join(HERE, '..', 'web', 'model.js')
JS = """
const Mo = await import(process.argv[1]);
const quads = JSON.parse(process.argv[2]), ts = JSON.parse(process.argv[3]);
const at = (p) => ({ x: p[0], y: p[1], z: p[2] });
console.log(JSON.stringify(quads.map((q) => ts.map((t) => { const c = Mo.catmullRom(...q.map(at), t); return [c.x, c.y, c.z]; }))));
"""


def test_python_and_viewer_draw_the_same_curve():
    rng = np.random.default_rng(3)
    sample = json.load(open(os.path.join(HERE, 'fixtures', 'format-v2-sample.vessels.json')))
    N = {n['id']: n for n in sample['nodes']}
    e = sample['edges'][0]
    pts = [[p['x'], p['y'], p['z']] for p in [N[e['a']], *e['via'], N[e['b']]]]
    quads = [[pts[0], pts[0], pts[1], pts[2]]] + [rng.uniform(0, 100, (4, 3)).tolist() for _ in range(20)]
    quads[0][0] = (2 * np.array(pts[0]) - np.array(pts[1])).tolist()
    ts = np.linspace(0, 1, 11).tolist()
    url = 'file://' + os.path.abspath(MODEL_JS)
    out = subprocess.run(['node', '--input-type=module', '-e', JS, url, json.dumps(quads), json.dumps(ts)],
                         capture_output=True, text=True, check=True).stdout
    js = np.array(json.loads(out))
    py = np.array([vm.catmull_rom(*q, ts) for q in quads])
    assert np.allclose(js, py, atol=1e-9), np.abs(js - py).max()


def test_fit_keeps_a_curving_path_within_tolerance_with_few_points():
    # a vessel bending through a quarter turn and back, one point per pixel, depth drifting
    s = np.linspace(0, 1, 400)
    path = np.column_stack([200 * s, 40 * np.sin(np.pi * s), 3 * s])
    keep = vm.fit_curve(path, 1.0)
    assert keep[0] == 0 and keep[-1] == len(path) - 1
    assert len(keep) <= 8, len(keep)
    c = vm.curve(path[keep], 0.25)
    stray = np.min(np.linalg.norm(path[:, None] - c[None], axis=2), axis=1).max()
    assert stray <= 1.0, stray
    # a straight vessel needs no points between its ends
    assert vm.fit_curve(np.column_stack([s * 100, s * 50, s * 0]), 1.0) == [0, 399]


if __name__ == '__main__':
    n = 0
    for name, fn in list(globals().items()):
        if name.startswith('test_'):
            fn(); n += 1; print('ok', name)
    assert n == 2
