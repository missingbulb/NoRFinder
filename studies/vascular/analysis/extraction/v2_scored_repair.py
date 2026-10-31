"""v2, scored repair: the v1 draft, then the graph repaired where the score says it is implausible.

The tracer fills every hole in the vessel mask narrower than a vessel first: a thick vessel's dim
lumen, or a dropout inside one vessel, otherwise skeletonises into two parallel lines and a short loop.
Then each step answers one of the score's complaints with the pixels under the vessel as the judge:

0. Each curve point moves onto the brightest line across the vessel within its radius, so the
   evidence below is read on the vessel and not beside it.
1. A low-confidence candidate stays only if it is a line, not a speck: the signal along its curve has
   to beat the same curve turned a quarter turn about its middle, and it may not wander far more than
   a capillary does.
2. A short loop (references/BIOLOGY-INVARIANTS.md: real loops run ~9-11 segments) loses its weakest
   edge, judged by the signal along it.
3. A vessel that ends in the open, facing a vessel or another end a few widths ahead at about the same
   depth, is joined to it when the gap between them carries signal: stain dropouts split one vessel
   into several, and that fragmentation inflates the segment count.
4. A four-way junction whose arms pair off into two straight lines at different depths is a crossing:
   it becomes two vessels passing over each other.
"""
import os, sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..'))
import score as sc
import vessel_model as vm

NAME = 'v2-scored-repair'

LINE_OVER_TURNED = 1.0     # noise units: a candidate's signal must beat its own quarter-turned copy by this much
WANDER = 1.6               # curve length over chord; cortical capillaries average 1.27 (Ji 2021), so a short trace far above it is a scribble
WANDER_WIDTHS = 20.0       # ... the wander test applies to traces shorter than this many widths
LOOP_KEEP = 0.75          # a loop edge at least this share of the field's median vessel contrast is kept
BRIDGE_WIDTHS = 6.0        # an open end looks this many vessel widths ahead for something to join
BRIDGE_DEG = 35.0          # ... within this angle of the direction it was running in
BRIDGE_FACING_DEG = 120.0  # two ends join only if they face each other at least this squarely
BRIDGE_SLICES = 2 * vm.AXIAL_HALF_SLICES   # ... and lie within one vessel's depth extent of each other
BRIDGE_SIGNAL = 0.4        # the gap's dimmest stretch must keep this share of the two vessels' own contrast
CROSS_DEG = 30.0           # a four-way junction's arms pair into straight lines within this of straight
CROSS_SLICES = vm.AXIAL_HALF_SLICES   # ... and the two lines arrive this far apart in depth to be a crossing


def extract(vol, um, source, z_step):
    m = vm.model(vol, um, source, z_step, fill_lumens=True)
    z, keep = vm.noise_units(vol, um)
    _, _, depth, flat = vm.segment(z, keep, um)
    repair(m, flat, depth)
    m['algorithm'] = NAME
    return m


def repair(m, flat, depth):
    log = {}
    log['points_snapped'] = snap_to_ridge(m, flat)
    log['candidates_dropped'] = drop_specks(m, flat)
    log['loop_edges_dropped'] = break_short_loops(m, flat)
    log['gaps_bridged'] = bridge_gaps(m, flat, depth)
    log['crossings_split'] = split_crossings(m)
    renumber(m)
    m['repairs'] = log
    return log


# ---- helpers over the model -------------------------------------------------------------------

def nodes_of(m):
    return {n['id']: n for n in m['nodes']}


def confirmed(e):
    return e.get('state', 'vessel') in ('vessel', 'accepted')


def degrees(m, only_confirmed=True):
    d = {}
    for e in m['edges']:
        if only_confirmed and not confirmed(e):
            continue
        if e.get('state') == 'rejected':
            continue
        for k in 'ab':
            d[e[k]] = d.get(e[k], 0) + 1
    return d


def along(flat, m, e):
    xy, rad = sc.sample_edge(e, nodes_of(m), m['um_per_px'])
    return xy, rad


def strength(flat, m, e):
    """Median signal on the curve over the tissue beside it (noise units)."""
    xy, rad = along(flat, m, e)
    if len(xy) < 2:
        return 0.0
    near, side = sc.support(flat, xy[:, :2], rad)
    return float(np.median(near) - np.median(side))


def join_pass_through(m):
    """Where only two edges of one state meet, they are one edge: the meeting point becomes a curve point."""
    while True:
        deg = degrees(m, only_confirmed=False)
        nodes = nodes_of(m)
        done = True
        for n, d in deg.items():
            if d != 2:
                continue
            es = [e for e in m['edges'] if n in (e['a'], e['b']) and e.get('state') != 'rejected']
            if len(es) != 2 or es[0] is es[1] or es[0]['a'] == es[0]['b'] or es[1]['a'] == es[1]['b'] \
                    or es[0].get('state') != es[1].get('state'):
                continue
            e1, e2 = es
            v1 = list(e1['via']) if e1['b'] == n else list(e1['via'])[::-1]
            a1 = e1['a'] if e1['b'] == n else e1['b']
            v2 = list(e2['via']) if e2['a'] == n else list(e2['via'])[::-1]
            b2 = e2['b'] if e2['a'] == n else e2['a']
            if a1 == b2:
                continue
            p = nodes[n]
            e1.update({'a': a1, 'b': b2, 'via': v1 + [{k: p[k] for k in ('x', 'y', 'z', 'r')}] + v2})
            e1.pop('r_a', None); e1.pop('r_b', None)
            m['edges'].remove(e2)
            m['nodes'] = [q for q in m['nodes'] if q['id'] != n]
            done = False
            break
        if done:
            return


def drop_unused_nodes(m):
    used = {e[k] for e in m['edges'] for k in 'ab'}
    m['nodes'] = [n for n in m['nodes'] if n['id'] in used]


def renumber(m):
    drop_unused_nodes(m)
    for i, e in enumerate(m['edges'], 1):
        e['id'] = i


# ---- 1. specks among the candidates ------------------------------------------------------------

def drop_specks(m, flat):
    um = m['um_per_px']
    nodes = nodes_of(m)
    out = 0
    for e in list(m['edges']):
        if e.get('state') != 'candidate':
            continue
        xy, rad = sc.sample_edge(e, nodes, um)
        if len(xy) < 3:
            m['edges'].remove(e); out += 1; continue
        P = xy[:, :2]
        mid = P.mean(0)
        turned = (P - mid)[:, ::-1] * [-1, 1] + mid
        near, _ = sc.support(flat, P, rad)
        tnear, _ = sc.support(flat, turned, rad)
        L = np.linalg.norm(np.diff(P, axis=0), axis=1).sum()
        wander = L / max(np.linalg.norm(P[-1] - P[0]), 1e-6)
        w = max(2 * float(np.median(rad)), 1.0)
        if np.median(near) - np.median(tnear) < LINE_OVER_TURNED or (wander > WANDER and L < WANDER_WIDTHS * w):
            m['edges'].remove(e); out += 1
    join_pass_through(m)
    return out


# ---- 2. short loops ----------------------------------------------------------------------------

def break_short_loops(m, flat):
    """The weakest edge over all short loops goes first, and the loops it closed are re-found. Two edges
    between the same two points are one vessel traced twice, so the weaker always goes; otherwise an edge
    as strong as the field's typical vessel stays, and its loop is left for the owner to see."""
    out = 0
    E, _ = sc.graph(m)
    typical = float(np.median([strength(flat, m, e) for e in E])) if E else 0.0
    spared = set()
    while True:
        E, adj = sc.graph(m)
        nodes = nodes_of(m)
        lengths = [sc.edge_length_um(e, nodes) for e in E]
        loops = [x for x in sc.short_loops(E, adj, lengths) if id(E[x[0]]) not in spared]
        if not loops:
            break
        i = min({i for i, _, _ in loops}, key=lambda i: strength(flat, m, E[i]))
        twin = any(i != j and {E[i]['a'], E[i]['b']} == {E[j]['a'], E[j]['b']} for j in range(len(E)))
        if not twin and strength(flat, m, E[i]) >= LOOP_KEEP * typical:
            spared.update(id(E[k]) for k, _, _ in loops)
            continue
        m['edges'].remove(E[i]); out += 1
        join_pass_through(m)
    return out


# ---- 3. gaps -----------------------------------------------------------------------------------

def bridge_gaps(m, flat, depth):
    um = m['um_per_px']
    H, W = flat.shape
    made = 0
    deg = degrees(m)
    nodes = nodes_of(m)
    E, adj = sc.graph(m)
    tips = [n for n, d in deg.items() if d == 1]
    # every confirmed edge as samples, for a tip to land on the side of a vessel
    samples = []
    for i, e in enumerate(E):
        xy, rad = sc.sample_edge(e, nodes, um)
        for k in range(1, len(xy) - 1):
            samples.append((i, k, xy[k], rad[k]))
    S = np.array([s[2][:2] for s in samples]) if samples else np.zeros((0, 2))
    contrast = {i: strength(flat, m, e) for i, e in enumerate(E)}
    plans = []
    for n in tips:
        p = nodes[n]
        P0 = np.array([p['x'], p['y']]) / um - .5
        w = max(2 * p.get('r', um) / um, 2.0)
        if min(P0[0], P0[1], W - 1 - P0[0], H - 1 - P0[1]) < 2 * w:
            continue   # a tip at the frame is a vessel cut off by it
        (j, u), = sc.leave_dirs(E, nodes, n, adj)
        ahead = -u   # the vessel runs out of the tip opposite the way the edge leaves it
        reach = BRIDGE_WIDTHS * w
        best = None
        # another open end, facing back
        for t in tips:
            if t == n:
                continue
            q = nodes[t]
            Q = np.array([q['x'], q['y']]) / um - .5
            v = Q - P0
            dist = np.linalg.norm(v)
            if dist > reach or dist < 1 or abs(q['z'] - p['z']) > BRIDGE_SLICES:
                continue
            if np.degrees(np.arccos(np.clip(v @ ahead / dist, -1, 1))) > BRIDGE_DEG:
                continue
            (j2, u2), = sc.leave_dirs(E, nodes, t, adj)
            facing = np.degrees(np.arccos(np.clip(u @ u2, -1, 1)))   # 180° when the two run straight at each other
            if j2 == j or facing < BRIDGE_FACING_DEG:
                continue
            if best is None or dist / reach < best[0]:
                best = (dist / reach, 'tip', t, Q, contrast[j2])
        # the side of another vessel
        if len(S):
            d = np.linalg.norm(S - P0, axis=1)
            for k in np.flatnonzero((d <= reach) & (d >= 1)):
                i, kk, xyz, r = samples[k]
                if i == j:
                    continue
                v = S[k] - P0
                if np.degrees(np.arccos(np.clip(v @ ahead / d[k], -1, 1))) > BRIDGE_DEG or abs(xyz[2] - p['z']) > BRIDGE_SLICES:
                    continue
                # joining an open end beats landing on a vessel's side at the same distance
                if best is None or d[k] / reach + 0.25 < best[0]:
                    best = (d[k] / reach + 0.25, 'side', (i, kk), S[k], contrast[i])
        if best is None:
            continue
        _, kind, target, Q, c_other = best
        # the gap must carry signal: its dimmest stretch keeps a share of the two vessels' own contrast
        line = P0 + np.linspace(0, 1, max(int(np.linalg.norm(Q - P0) * 2), 3))[:, None] * (Q - P0)
        near, side = sc.support(flat, line, np.full(len(line), w / 2))
        dim = float(np.percentile(near - np.median(side), 20))
        if dim < BRIDGE_SIGNAL * (contrast[j] + c_other) / 2:
            continue
        plans.append((n, kind, target, Q, dim))
    # one bridge per end; strongest gaps first
    used = set()
    for n, kind, target, Q, dim in sorted(plans, key=lambda x: -x[4]):
        if n in used or (kind == 'tip' and target in used):
            continue
        if kind == 'tip':
            m['edges'].append({'id': 0, 'a': n, 'b': target, 'vessel': None, 'state': 'vessel', 'via': [], 'bridged': True})
            used.update((n, target))
        else:
            i, k = target
            new = split_edge(m, E[i], k, depth)
            if new is None:
                continue
            m['edges'].append({'id': 0, 'a': n, 'b': new, 'vessel': None, 'state': 'vessel', 'via': [], 'bridged': True})
            used.add(n)
        made += 1
        # the new edge must not close a short loop
        E2, adj2 = sc.graph(m)
        nd = nodes_of(m)
        if any(E2[i] is m['edges'][-1] for i, _, _ in sc.short_loops(E2, adj2, [sc.edge_length_um(e, nd) for e in E2])):
            m['edges'].pop(); made -= 1
    for e in m['edges']:
        if e.get('vessel') is None:
            e['vessel'] = max((x.get('vessel') or 0) for x in m['edges']) + 1
    join_pass_through(m)
    return made


def split_edge(m, e, k, depth):
    """Split edge e at its k-th curve sample: a new node there, two edges either side. Returns the node id."""
    um = m['um_per_px']
    nodes = nodes_of(m)
    if e not in m['edges']:
        return None
    pts = [nodes[e['a']]] + list(e['via']) + [nodes[e['b']]]
    P = np.array([[p['x'] / um - .5, p['y'] / um - .5] for p in pts])
    xy, _ = sc.sample_edge(e, nodes, um)
    at = xy[k]
    # the control span the sample falls in: the nearest control point before it along the curve
    s_ctrl = [int(np.argmin(np.linalg.norm(xy[:, :2] - c, axis=1))) for c in P]
    span = max(sum(1 for s in s_ctrl[1:-1] if s <= k), 0)
    nid = max(n['id'] for n in m['nodes']) + 1
    r = float(np.interp(k, [0, len(xy) - 1], [pts[0].get('r', 1), pts[-1].get('r', 1)]))
    zz = float(depth[int(np.clip(round(at[1]), 0, depth.shape[0] - 1)), int(np.clip(round(at[0]), 0, depth.shape[1] - 1))])
    m['nodes'].append({'id': nid, 'x': round((at[0] + .5) * um, 2), 'y': round((at[1] + .5) * um, 2), 'z': round(float(at[2]) if np.isfinite(at[2]) else zz, 2), 'r': round(r, 2)})
    via = list(e['via'])
    first = dict(e, b=nid, via=via[:span]); second = dict(e, a=nid, via=via[span:])
    for x in (first, second):
        x.pop('r_a', None); x.pop('r_b', None)
    i = m['edges'].index(e)
    m['edges'][i:i + 1] = [first, second]
    return nid


# ---- 4. crossings ------------------------------------------------------------------------------

def split_crossings(m):
    um = m['um_per_px']
    out = 0
    deg = degrees(m)
    for n in [n for n, d in deg.items() if d == 4]:
        E, adj = sc.graph(m)
        nodes = nodes_of(m)
        if n not in adj or len(adj[n]) != 4:
            continue
        dirs = sc.leave_dirs(E, nodes, n, adj)
        # arrival depth: the edge's nearest curve point (or far end) to the junction
        def arrive(j):
            e = E[j]
            pts = [nodes[e['a']]] + list(e['via']) + [nodes[e['b']]]
            return pts[1]['z'] if e['a'] == n else pts[-2]['z']
        best = None
        for pair in ((0, 1, 2, 3), (0, 2, 1, 3), (0, 3, 1, 2)):
            a, b, c, d = pair
            s1 = np.degrees(np.arccos(np.clip(dirs[a][1] @ -dirs[b][1], -1, 1)))
            s2 = np.degrees(np.arccos(np.clip(dirs[c][1] @ -dirs[d][1], -1, 1)))
            if s1 <= CROSS_DEG and s2 <= CROSS_DEG:
                gap = abs((arrive(dirs[a][0]) + arrive(dirs[b][0])) / 2 - (arrive(dirs[c][0]) + arrive(dirs[d][0])) / 2)
                if best is None or s1 + s2 < best[0]:
                    best = (s1 + s2, gap, (c, d))
        if best is None or best[1] < CROSS_SLICES:
            continue
        c, d = best[2]
        p = nodes[n]
        nid = max(q['id'] for q in m['nodes']) + 1
        zs = [arrive(dirs[c][0]), arrive(dirs[d][0])]
        m['nodes'].append({**p, 'id': nid, 'z': round(float(np.mean(zs)), 2)})
        for k in (c, d):
            e = E[dirs[k][0]]
            e['a' if e['a'] == n else 'b'] = nid
        out += 1
    join_pass_through(m)
    return out


# ---- 5. ridge ----------------------------------------------------------------------------------

def snap_to_ridge(m, flat):
    """Move each curve point across the vessel onto the brightest line within half its width."""
    um = m['um_per_px']
    nodes = nodes_of(m)
    moved = 0
    for e in m['edges']:
        if not e['via']:
            continue
        pts = [nodes[e['a']]] + list(e['via']) + [nodes[e['b']]]
        P = np.array([[p['x'] / um - .5, p['y'] / um - .5] for p in pts])
        n = sc.normals(P)
        for k in range(1, len(P) - 1):
            r = max(pts[k].get('r', um) / um, 1.0)
            off = np.linspace(-r, r, 21)
            prof = sc.at(flat, P[k] + n[k] * off[:, None])
            i = int(np.argmax(prof))
            if 0 < i < len(off) - 1:   # parabola through the peak and its neighbours for a sub-pixel position
                den = prof[i - 1] - 2 * prof[i] + prof[i + 1]
                t = 0.5 * (prof[i - 1] - prof[i + 1]) / den if den < 0 else 0.0
                o = off[i] + t * (off[1] - off[0])
            else:
                o = off[i]
            if abs(o) > 0.25:
                Q = P[k] + n[k] * o
                pts[k]['x'], pts[k]['y'] = round((Q[0] + .5) * um, 2), round((Q[1] + .5) * um, 2)
                moved += 1
    return moved
