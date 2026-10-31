"""The extractor treats a vessel's width as space it occupies, drops stubs, and marks knots of junctions.

Run: python3 tests/test_vessel_model_cleanup.py
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'analysis'))
import vessel_model as vm


def line(a, b):
    n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1]))) + 1
    return np.round(np.linspace(a, b, n)).astype(int)


def test_two_junctions_inside_one_vessels_width_become_one():
    # a wide vessel (radius 5 px) along y = 50, with two branches leaving it 6 px apart: inside its width
    dist = np.full((100, 200), 5.0)
    pos = {1: np.array([50., 97.]), 2: np.array([50., 103.]), 3: np.array([50., 0.]), 4: np.array([50., 199.]),
           5: np.array([0., 97.]), 6: np.array([99., 103.])}
    edges = [[1, 2, line((50, 97), (50, 103))], [3, 1, line((50, 0), (50, 97))], [2, 4, line((50, 103), (50, 199))],
             [1, 5, line((50, 97), (0, 97))], [2, 6, line((50, 103), (99, 103))]]
    out = vm.clean(pos, edges, dist)
    assert len(out) == 4, [(a, b, len(p)) for a, b, p in out]
    deg = np.bincount([n for a, b, _ in out for n in (a, b)])
    assert deg.max() == 4
    # the contrast: the same branches 40 px apart stay two junctions
    pos = {1: np.array([50., 80.]), 2: np.array([50., 120.]), 3: np.array([50., 0.]), 4: np.array([50., 199.]),
           5: np.array([0., 80.]), 6: np.array([99., 120.])}
    edges = [[1, 2, line((50, 80), (50, 120))], [3, 1, line((50, 0), (50, 80))], [2, 4, line((50, 120), (50, 199))],
             [1, 5, line((50, 80), (0, 80))], [2, 6, line((50, 120), (99, 120))]]
    assert len(vm.clean(pos, edges, dist)) == 5


def test_a_dangling_faint_stub_goes_and_a_bridge_stays():
    def e(a, b, L, state='candidate'):
        return {'a': a, 'b': b, 'p': line((0, 0), (0, L)), 'w': 3.0, 'state': state}
    E = [e('v1', 'v2', 100, 'vessel'), e('v2', 'v3', 100, 'vessel'), e('v4', 'v5', 100, 'vessel'),
         e('v2', 'c1', 4), e('v3', 'v4', 4), e('c2', 'c3', 8)]
    vm.prune_candidates(E)
    kept = {(x['a'], x['b']) for x in E}
    assert ('v2', 'c1') not in kept and ('c2', 'c3') not in kept
    assert ('v3', 'v4') in kept and len(E) == 4


def test_a_knot_of_junctions_is_marked_and_an_even_network_is_not():
    rng = np.random.default_rng(1)
    def model(knot):
        P = [(x, y) for x in range(20, 1000, 60) for y in range(20, 1000, 60)]
        P = [(x + rng.uniform(-10, 10), y + rng.uniform(-10, 10)) for x, y in P]
        if knot:
            P += [(500 + 6 * np.cos(t), 500 + 6 * np.sin(t)) for t in np.linspace(0, 2 * np.pi, 6, endpoint=False)]
        nodes = [{'id': i + 1, 'x': x, 'y': y, 'r': 2.0} for i, (x, y) in enumerate(P)]
        edges = [{'a': i + 1, 'b': len(P) + 1, 'state': 'vessel'} for i in range(len(P)) for _ in range(3)]
        return vm.dense_regions(nodes + [{'id': len(P) + 1, 'x': 0, 'y': 0, 'r': 2.0}], edges, 1000 * 1000)
    assert model(False) == []
    marked = model(True)
    assert len(marked) == 1 and marked[0]['x0'] < 500 < marked[0]['x1'] and marked[0]['junctions'] >= 6


if __name__ == '__main__':
    n = 0
    for name, fn in list(globals().items()):
        if name.startswith('test_'):
            fn(); n += 1; print('ok', name)
    assert n == 3
