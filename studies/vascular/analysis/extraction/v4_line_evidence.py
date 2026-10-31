"""v4, line evidence on every dead end: v3, then confirmed dead-end branches must also prove they are lines.

From the first provisional grade (labels/fable-v1.json): the largest error class left was confirmed
edges the judge called "not a vessel", 17 of them, against 8 real vessels lost. They are short
(median 12 µm against 27 µm for real ones) and lie on bright speckle: their ridge strength is half a
real vessel's, and they beat their own quarter-turned copy by much less. v2 asks only candidates to
pass the quarter-turn test; here every confirmed branch with an open end must pass it too, on the
ridge map, measured against the field's own typical vessel so the cut-off travels across stacks.
"""
import os, sys

import numpy as np
from skimage.filters import sato

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..'))
import score as sc
import v2_scored_repair as v2
import v3_geodesic_bridges as v3
import vessel_model as vm

NAME = 'v4-line-evidence'

RIDGE_SHARE = 0.5      # a dead end whose ridge is under half the field's median vessel ridge ...
TURNED_SHARE = 0.35    # ... and whose lead over its quarter-turned copy is under this share of the field's median lead, goes
SHORT_WIDTHS = 10.0    # only dead ends shorter than this many widths are judged; a long branch has proved itself by running on


def extract(vol, um, source, z_step):
    m = v3.extract(vol, um, source, z_step)
    z, keep = vm.noise_units(vol, um)
    _, _, _, flat = vm.segment(z, keep, um)
    ridge = sato(np.clip(flat, 0, None), sigmas=[s / um for s in v3.RIDGE_UM], black_ridges=False)
    m['repairs']['dead_ends_dropped'] = drop_unproven_dead_ends(m, flat, ridge)
    v2.renumber(m)
    m['algorithm'] = NAME
    return m


def evidence(m, e, flat, ridge):
    xy, rad = sc.sample_edge(e, v2.nodes_of(m), m['um_per_px'])
    P = xy[:, :2]
    mid = P.mean(0)
    turned = (P - mid)[:, ::-1] * [-1, 1] + mid
    near, _ = sc.support(flat, P, rad)
    tnear, _ = sc.support(flat, turned, rad)
    L = np.linalg.norm(np.diff(P, axis=0), axis=1).sum()
    return float(np.median(sc.at(ridge, P))), float(np.median(near) - np.median(tnear)), L, max(2 * float(np.median(rad)), 1.0)


def drop_unproven_dead_ends(m, flat, ridge):
    E, _ = sc.graph(m)
    ev = [evidence(m, e, flat, ridge) for e in E]
    if not ev:
        return 0
    typ_ridge = float(np.median([x[0] for x in ev]))
    typ_lead = float(np.median([x[1] for x in ev]))
    deg = v2.degrees(m)
    out = 0
    for e, (r, lead, L, w) in zip(E, ev):
        if min(deg.get(e['a'], 0), deg.get(e['b'], 0)) != 1 or L > SHORT_WIDTHS * w:
            continue
        if r < RIDGE_SHARE * typ_ridge and lead < TURNED_SHARE * typ_lead:
            m['edges'].remove(e); out += 1
    v2.join_pass_through(m)
    return out
