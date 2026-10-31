"""v3, geodesic bridges: v2, then every open end follows the ridge it was running on to wherever it leads.

Found with the algorithm-ideation skill (lenses "borrow from a neighbouring field": neuron and road
tracing join fragments by minimal paths; and "change the evidence": a ridge filter at the vessels' own
widths sees a faint vessel as a line where the intensity threshold sees speckle). v2 joins an open end
only across a short straight gap. Here each open end that is not cut off by the frame looks further
ahead, along the cheapest path through a ridge-strength map, for a vessel or another end to land on.
The path is kept when the ridge carries it the whole way: its dimmest stretch keeps a share of the
two vessels' own contrast, it arrives at about the same depth, and it closes no short loop.
"""
import os, sys

import numpy as np
from skimage.filters import sato
from skimage.graph import MCP_Geometric

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..'))
import score as sc
import v2_scored_repair as v2
import vessel_model as vm

NAME = 'v3-geodesic-bridges'

REACH_WIDTHS = 12.0        # an open end looks this many vessel widths ahead (median capillary segment ~45 µm is ~11 widths)
AHEAD_DEG = 60.0           # ... for a landing point within this angle of the way it was running
PATH_SIGNAL = v2.BRIDGE_SIGNAL   # the path's dimmest fifth keeps this share of the two vessels' contrast
WANDER = v2.WANDER         # and wanders no more than a capillary does
RIDGE_UM = (1.0, 1.5, 2.0, 3.0)   # ridge filter scales: capillary radii ~1-3 µm (Ji 2021; references/BIOLOGY-INVARIANTS.md)


def extract(vol, um, source, z_step):
    m = v2.extract(vol, um, source, z_step)
    z, keep = vm.noise_units(vol, um)
    _, _, depth, flat = vm.segment(z, keep, um)
    ridge = sato(np.clip(flat, 0, None), sigmas=[s / um for s in RIDGE_UM], black_ridges=False)
    m['repairs']['geodesic_bridges'] = geodesic_bridges(m, flat, ridge, depth)
    v2.renumber(m)
    m['algorithm'] = NAME
    return m


def geodesic_bridges(m, flat, ridge, depth):
    um = m['um_per_px']
    H, W = flat.shape
    hi = float(np.percentile(ridge, 99))
    cost = 1.0 / (0.02 + np.clip(ridge / max(hi, 1e-9), 0, 1))
    made = 0
    E, adj = sc.graph(m)
    nodes = v2.nodes_of(m)
    deg = v2.degrees(m)
    contrast = {i: v2.strength(flat, m, e) for i, e in enumerate(E)}
    # every confirmed edge's pixels, labelled by edge, as landing places
    owner = np.full((H, W), -1, int)
    for i, e in enumerate(E):
        xy, _ = sc.sample_edge(e, nodes, um)
        ij = np.clip(np.round(xy[:, :2]).astype(int), 0, [W - 1, H - 1])
        owner[ij[:, 1], ij[:, 0]] = i
    tips = [n for n, d in deg.items() if d == 1]
    used = set()
    plans = []
    for n in tips:
        p = nodes[n]
        P0 = np.array([p['x'], p['y']]) / um - .5
        w = max(2 * p.get('r', um) / um, 2.0)
        if min(P0[0], P0[1], W - 1 - P0[0], H - 1 - P0[1]) < 2 * w:
            continue
        (j, u), = sc.leave_dirs(E, nodes, n, adj)
        ahead = -u
        R = int(REACH_WIDTHS * w)
        x0, y0 = max(int(P0[0]) - R, 0), max(int(P0[1]) - R, 0)
        x1, y1 = min(int(P0[0]) + R + 1, W), min(int(P0[1]) + R + 1, H)
        sub = cost[y0:y1, x0:x1]
        start = (int(round(P0[1])) - y0, int(round(P0[0])) - x0)
        mcp = MCP_Geometric(sub)
        acc, _ = mcp.find_costs([start])
        own = owner[y0:y1, x0:x1]
        yy, xx = np.mgrid[y0:y1, x0:x1]
        v = np.stack([xx - P0[0], yy - P0[1]], -1)
        dist = np.linalg.norm(v, axis=-1)
        ang = np.degrees(np.arccos(np.clip((v @ ahead) / np.maximum(dist, 1e-9), -1, 1)))
        land = (own >= 0) & (own != j) & (dist >= 1) & (dist <= R) & (ang <= AHEAD_DEG)
        if not land.any():
            continue
        k = np.argmin(np.where(land, acc, np.inf))
        ty, tx = np.unravel_index(k, acc.shape)
        path = np.array(mcp.traceback((ty, tx)))[:, ::-1] + [x0, y0]   # (x, y) px
        if len(path) < 3:
            continue
        L = np.linalg.norm(np.diff(path, axis=0), axis=1).sum()
        if L / max(np.linalg.norm(path[-1] - path[0]), 1e-6) > WANDER:
            continue
        i = int(own[ty, tx])
        near, side = sc.support(flat, path.astype(float), np.full(len(path), w / 2))
        dim = float(np.percentile(near - np.median(side), 20))
        if dim < PATH_SIGNAL * (contrast[j] + contrast[i]) / 2:
            continue
        zt = float(depth[ty + y0, tx + x0])
        if abs(zt - p['z']) > v2.BRIDGE_SLICES:
            continue
        plans.append((dim, n, i, path))
    for dim, n, i, path in sorted(plans, key=lambda x: -x[0]):
        if n in used:
            continue
        e = E[i]
        if e not in m['edges']:
            continue
        xy, _ = sc.sample_edge(e, v2.nodes_of(m), um)
        k = int(np.argmin(np.linalg.norm(xy[:, :2] - path[-1], axis=1)))
        if k <= 1 or k >= len(xy) - 2:   # landing on an end: join that end instead of splitting
            target = e['a'] if k <= 1 else e['b']
        else:
            target = v2.split_edge(m, e, k, depth)
        if target is None or target == n:
            continue
        # a few curve points along the path, so the bridge follows the ridge rather than the chord
        pts = path[1:-1][np.linspace(0, len(path) - 3, min(max(len(path) // 15, 0), 4) + 2).astype(int)[1:-1]] if len(path) > 4 else []
        r = nodes[n].get('r', um)
        via = [{'x': round((q[0] + .5) * um, 2), 'y': round((q[1] + .5) * um, 2),
                'z': round(float(depth[int(q[1]), int(q[0])]), 2), 'r': r} for q in pts]
        new = {'id': 0, 'a': n, 'b': target, 'vessel': None, 'state': 'vessel', 'via': via, 'bridged': True}
        m['edges'].append(new)
        E2, adj2 = sc.graph(m)
        nd = v2.nodes_of(m)
        if any(E2[q] is new for q, _, _ in sc.short_loops(E2, adj2, [sc.edge_length_um(x, nd) for x in E2])):
            m['edges'].remove(new)
            v2.join_pass_through(m)
            continue
        used.add(n); used.add(target)
        made += 1
    for e in m['edges']:
        if e.get('vessel') is None:
            e['vessel'] = max((x.get('vessel') or 0) for x in m['edges']) + 1
    v2.join_pass_through(m)
    return made
