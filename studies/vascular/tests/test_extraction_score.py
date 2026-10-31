"""The extraction score reads widths, loops and junction shapes the way the biology says they look.

Run: python3 tests/test_extraction_score.py
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'analysis', 'extraction'))
import score as sc

UM = 0.5


def tapered_line(r0, r1, L=200, H=60):
    """A horizontal vessel along y = H/2 whose radius (px) runs from r0 at x = 20 to r1 at x = L - 20."""
    yy, xx = np.mgrid[0:H, 0:L].astype(float)
    r = r0 + (r1 - r0) * np.clip((xx - 20) / (L - 40), 0, 1)
    return np.where(np.abs(yy - H / 2) <= r, 20.0, 0.0)


def model(nodes, edges):
    return {'um_per_px': UM, 'nodes': [{'id': i, 'x': x, 'y': y, 'z': 0, 'r': 1.0} for i, (x, y) in nodes.items()],
            'edges': [{'id': k + 1, 'a': a, 'b': b, 'state': 'vessel', 'via': []} for k, (a, b) in enumerate(edges)]}


def test_taper_reads_the_narrowing_end():
    flat = tapered_line(6, 2)
    m = model({1: (20 * UM, 30 * UM), 2: (180 * UM, 30 * UM)}, [(1, 2)])
    sc.score(m, flat)
    e = m['edges'][0]
    assert e['taper_known'], e
    assert e['r_a'] > 1.5 * e['r_b'], e


def test_uniform_vessel_has_no_known_taper():
    flat = tapered_line(4, 4)
    m = model({1: (20 * UM, 30 * UM), 2: (180 * UM, 30 * UM)}, [(1, 2)])
    sc.score(m, flat)
    assert not m['edges'][0]['taper_known'], m['edges'][0]


def test_a_small_triangle_is_a_short_loop_and_a_large_ring_of_many_is_not():
    tri = model({1: (0, 0), 2: (10, 0), 3: (5, 8)}, [(1, 2), (2, 3), (3, 1)])
    E, adj = sc.graph(tri)
    nodes = {n['id']: n for n in tri['nodes']}
    assert len(sc.short_loops(E, adj, [sc.edge_length_um(e, nodes) for e in E])) == 3
    k = 10   # ten edges around a ring 600 µm round: the size of a real capillary loop
    ring = model({i: (100 * np.cos(2 * np.pi * i / k) + 200, 100 * np.sin(2 * np.pi * i / k) + 200) for i in range(k)},
                 [(i, (i + 1) % k) for i in range(k)])
    E, adj = sc.graph(ring)
    nodes = {n['id']: n for n in ring['nodes']}
    assert sc.short_loops(E, adj, [sc.edge_length_um(e, nodes) for e in E]) == []


def test_off_signal_edge_is_unsupported():
    flat = tapered_line(3, 3)
    m = model({1: (20 * UM, 30 * UM), 2: (180 * UM, 30 * UM), 3: (20 * UM, 5 * UM), 4: (180 * UM, 5 * UM)}, [(1, 2), (3, 4)])
    card = sc.score(m, flat, measure_taper=False)
    assert card['_flags']['unsupported'] == [2], card['_flags']


def test_branch_angles_are_read_in_3d_just_outside_the_junction():
    # a flat Y at the origin (z = 10 slices), and the same Y with one arm climbing steeply in depth
    def y(climb):
        m = model({1: (50, 50), 2: (80, 50), 3: (20, 70), 4: (20, 30)}, [(1, 2), (1, 3), (1, 4)])
        for n in m['nodes']:
            n['z'] = 10.0
        m['nodes'][1]['z'] = 10.0 + climb
        m['z_step_um'] = 1.0
        E, adj = sc.graph(m)
        nodes = {n['id']: n for n in m['nodes']}
        return sc.branch_tangents(E, nodes, 1, adj, UM, m['z_step_um'])
    flat = y(0)
    assert sc.out_of_plane_deg(flat) < 1
    angles = sorted(np.degrees(np.arccos(np.clip(u @ v, -1, 1))) for i, (_, u) in enumerate(flat) for _, v in flat[i + 1:])
    assert 60 < angles[0] < 75 and angles[-1] > 140, angles   # the two left arms are ~67° apart
    assert sc.out_of_plane_deg(y(40)) > 50   # an arm rising 40 µm over 30 µm across leaves the plane by ~53°


if __name__ == '__main__':
    for name, f in list(globals().items()):
        if name.startswith('test_'):
            f(); print('ok', name)
