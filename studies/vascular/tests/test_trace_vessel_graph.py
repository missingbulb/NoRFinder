"""The draft tracer turns tubes into the graph a researcher would draw: one junction where three
vessels meet, one edge per vessel with its 3D length and width, and no edge for a bump on a wall.

A drawn volume stands in for a raw stack: this checks the graph bookkeeping on a known answer, not
how well the tracer finds real vessels, which only the owner's marks can judge.

Run: python3 tests/test_trace_vessel_graph.py
"""
import os
import sys

import numpy as np
from scipy import ndimage as ndi

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'analysis'))
import trace_vessel_graph as tvg

UM, Z_STEP = 0.5, 1.0
Z, Y, X = 12, 120, 120
RADIUS_UM = 2.0
AXIAL_BLUR = (1.0, 0.5, 0.5)   # px sigma: the lens spreads each vessel over neighbouring slices


def tube(vol, a, b, r_um):
    """Brighten every voxel within r_um of segment a-b; points are (z, y, x) in µm."""
    zz, yy, xx = np.meshgrid(np.arange(Z) * Z_STEP, np.arange(Y) * UM, np.arange(X) * UM, indexing='ij')
    p = np.stack([zz, yy, xx], -1)
    a, b = np.array(a, float), np.array(b, float)
    t = np.clip(((p - a) @ (b - a)) / ((b - a) @ (b - a)), 0, 1)
    vol[np.linalg.norm(p - (a + t[..., None] * (b - a)), axis=-1) <= r_um] = 1000


def main():
    rng = np.random.default_rng(0)
    vol = np.zeros((Z, Y, X), np.float32)
    hub = (5.0, 30.0, 30.0)
    arms = [(5.0, 30.0, 55.0), (5.0, 5.0, 30.0), (9.0, 50.0, 12.0)]   # the last one climbs through z
    for end in arms:
        tube(vol, hub, end, RADIUS_UM)
    tube(vol, (5.0, 30.0, 42.0), (5.0, 35.0, 42.0), 1.0)                # a bump on the first arm's wall
    vol = ndi.gaussian_filter(vol, AXIAL_BLUR) + rng.normal(100, 10, vol.shape).astype(np.float32)

    g = tvg.trace(vol, UM, Z_STEP, {})
    junctions = [n for n in g['nodes'] if n['kind'] == 'junction']
    assert len(junctions) == 1 and junctions[0]['degree'] == 3, g['nodes']
    assert len(g['edges']) == 3, f"one edge per arm, the bump dropped: {[e['length_um'] for e in g['edges']]}"

    want = sorted(float(np.linalg.norm(np.subtract(e, hub))) for e in arms)
    got = sorted(e['length_um'] for e in g['edges'])
    for w, x in zip(want, got):
        assert abs(x - w) < 0.2 * w, f'3D length {x} vs drawn {w}'

    for e in g['edges']:
        assert abs(e['width_um_mean'] - 2 * RADIUS_UM) < 1.5, f"width {e['width_um_mean']} vs drawn {2 * RADIUS_UM}"

    flat = tvg.trace_flat(vol, UM, {})
    assert flat['flat'] and flat['z_step_um'] is None
    assert len(flat['edges']) == 3, f"flattened: one edge per arm, the bump dropped: {[e['length_um'] for e in flat['edges']]}"
    want = sorted(float(np.linalg.norm(np.subtract(e, hub)[1:])) for e in arms)    # depth ignored
    for w, x in zip(want, sorted(e['length_um'] for e in flat['edges'])):
        assert abs(x - w) < 0.2 * w, f'in-plane length {x} vs drawn {w}'
    assert all(n['zyx_um'][0] == 0 for n in flat['nodes'])
    assert not flat['crossings'], f"a branch that climbs through depth is still a branch: {flat['crossings']}"

    cross = np.zeros_like(vol)   # two vessels passing at different depths
    tube(cross, (1.0, 30.0, 5.0), (1.0, 30.0, 55.0), RADIUS_UM)
    tube(cross, (10.0, 5.0, 30.0), (10.0, 55.0, 30.0), RADIUS_UM)
    over = tvg.trace_flat(ndi.gaussian_filter(cross, AXIAL_BLUR) + rng.normal(100, 10, vol.shape).astype(np.float32), UM, {})
    assert [c['decided_by'] for c in over['crossings']] == ['slices'], over['crossings']
    assert not [n for n in over['nodes'] if n['kind'] == 'junction'], over['nodes']
    lengths = [e['length_um'] for e in over['edges']]
    assert len(lengths) == 2 and all(abs(x - 50) < 5 for x in lengths), f'each vessel one whole edge: {lengths}'
    print('ok')


if __name__ == '__main__':
    main()
