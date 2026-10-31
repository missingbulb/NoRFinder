#!/usr/bin/env python3
"""How plausible an extracted vessel graph is, judged by the image under it and by how vessels are built.

Every extraction version is scored by this one function, so versions can be compared without an
owner-corrected answer key. Two kinds of evidence:

  pixels   each edge is sampled along its curve and checked against the flattened stack: how much of
           its length sits on signal, and how much brighter the curve is than the tissue beside it.
  biology  the graph's shape against invariants of cortical vessel networks
           (references/BIOLOGY-INVARIANTS.md): junctions are bifurcations, loops are many segments
           long, branches leave a junction at wide angles, and a vessel narrows in one direction only.

Widths are measured here too, from the intensity profile across each edge, and fitted as a radius
running linearly from end a to end b, so every version gets the same start and end widths.

    python3 analysis/extraction/score.py STACK.tif MODEL.json [--json OUT]
"""
import argparse, json, os, sys
from collections import deque

import numpy as np
from scipy import ndimage as ndi
from scipy.stats import theilslopes

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import vessel_model as vm

# Pixel evidence, in each stack's own noise units (vessel_model.noise_units) and in multiples of the vessel's width.
ON_SIGNAL = vm.GROW_SIGMA       # a curve sample is "on signal" where the flattened stack clears the tracing's growth level
SNAP_WIDTHS = 0.5               # the curve may sit half a width off the ridge and still be on it
BESIDE_WIDTHS = 2.0             # "the tissue beside it" is sampled two widths out on each side
SUPPORTED = 0.6                 # an edge with less than 60% of its length on signal is unsupported
# Biology (references/BIOLOGY-INVARIANTS.md; Ji 2021, Smith 2019 for mouse cortex).
SHORT_LOOP_EDGES = 2            # loops average ~8 edges and ~15% have 2-4 (Blinder 2013), so only a 2-edge loop (~1-4% of real ones) is suspect by count
LOOP_SEARCH_EDGES = 8          # loops are searched up to the mean real loop's edge count
SHORT_LOOP_UM = 100.0           # a loop under ~100 µm around is suspect whatever its count (mean real loop ~486 µm, Smith 2019)
DEGREE4_EXPECTED = 0.07         # up to ~7% of interior nodes have degree > 3; more suggests crossings traced as junctions
NARROW_DEG = 40.0               # smallest angle at a junction averages 84° in 3D (Ji 2021); under ~40° is one vessel traced twice or a shallow crossing (BIOLOGY-INVARIANTS B4)
STEEP_DEG = 50.0                # under 10% of junctions have a branch more than 50° out of the plane of the other two (Cassot 2010)
ARTERIOLE_R = 3.5               # µm; above this radius a vessel is an arteriole or venule (Ji 2021), below it a capillary
TAPER_SIG = 2.0                 # a radius slope this many standard errors from flat makes an edge's taper "known"
TAPER_MIN = 0.15                # ... and only when the ends differ by at least 15% of the mean radius
PROFILE_WIDTHS = 3.0            # the cross profile reaches this many widths either side when measuring a width


def flat_signal(vol, um):
    """The flattened stack in noise units: what the extractors trace on, and what edges are judged against."""
    z, keep = vm.noise_units(vol, um)
    return z[keep].max(axis=0) if keep.any() else np.zeros(vol.shape[1:], np.float32)


def edge_radius(e, nodes):
    """Radius (µm) at the control points of edge e: r_a and r_b when the edge carries them, else the points' own r."""
    pts = [nodes[e['a']]] + list(e.get('via', [])) + [nodes[e['b']]]
    r = np.array([p.get('r', 0.0) for p in pts], float)
    if 'r_a' in e and 'r_b' in e:
        P = np.array([[p['x'], p['y']] for p in pts], float)
        s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
        r = e['r_a'] + (e['r_b'] - e['r_a']) * s / max(s[-1], 1e-9)
    return r


def sample_edge(e, nodes, um, step_px=0.5):
    """Points along edge e's curve in px (x, y), depth in slices and radius in px, about step_px apart."""
    pts = [nodes[e['a']]] + list(e.get('via', [])) + [nodes[e['b']]]
    P = np.array([[p['x'] / um - .5, p['y'] / um - .5, p['z']] for p in pts], float)
    r = edge_radius(e, nodes) / um
    keep = np.r_[True, np.linalg.norm(np.diff(P[:, :2], axis=0), axis=1) > 1e-6]
    P, r = P[keep], r[keep]
    if len(P) < 2:
        return P, r
    ext = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    out, rad = [], []
    for k in range(len(P) - 1):
        n = max(int(np.ceil(np.linalg.norm(P[k + 1, :2] - P[k, :2]) / step_px)), 2)
        t = np.linspace(0, 1, n, endpoint=False)
        out.append(vm.catmull_rom(*ext[k:k + 4], t)); rad.append(r[k] + (r[k + 1] - r[k]) * t)
    return np.vstack(out + [P[-1:]]), np.concatenate(rad + [r[-1:]])


def normals(xy):
    t = np.gradient(xy, axis=0)
    t /= np.linalg.norm(t, axis=1, keepdims=True) + 1e-9
    return np.column_stack([-t[:, 1], t[:, 0]])


def at(img, xy):
    return ndi.map_coordinates(img, [xy[..., 1], xy[..., 0]], order=1, mode='nearest')


def support(flat, xy, rad):
    """Per sample: the brightest signal within half a width of the curve, and the tissue two widths out on
    either side (the dimmer side, so a neighbouring vessel does not count as background)."""
    n = normals(xy)
    w = np.maximum(2 * rad, 2.0)[:, None]
    near = np.max([at(flat, xy + n * f * SNAP_WIDTHS * w) for f in np.linspace(-1, 1, 5)], axis=0)
    side = np.min([at(flat, xy + n * f * BESIDE_WIDTHS * w) for f in (-1, 1)], axis=0)
    return near, side


def profile_radius(flat, xy, rad):
    """Half-maximum half-width (px) of the cross profile at each sample; NaN where there is no clear ridge."""
    n = normals(xy)
    reach = np.maximum(PROFILE_WIDTHS * 2 * rad, 4.0)
    out = np.full(len(xy), np.nan)
    s = np.linspace(-1, 1, 61)
    for i in range(len(xy)):
        off = s * reach[i]
        prof = at(flat, xy[i] + n[i] * off[:, None])
        mid = np.abs(off) <= max(rad[i], 1.0)
        k = np.flatnonzero(mid)[np.argmax(prof[mid])]
        bg = min(np.median(prof[:10]), np.median(prof[-10:]))
        half = (prof[k] + bg) / 2
        if prof[k] < ON_SIGNAL or prof[k] - bg < ON_SIGNAL:
            continue
        L = k
        while L > 0 and prof[L] > half:
            L -= 1
        R = k
        while R < len(prof) - 1 and prof[R] > half:
            R += 1
        if L == 0 or R == len(prof) - 1:
            continue
        xl = off[L] + (half - prof[L]) / (prof[L + 1] - prof[L] + 1e-9) * (off[L + 1] - off[L])
        xr = off[R - 1] + (prof[R - 1] - half) / (prof[R - 1] - prof[R] + 1e-9) * (off[R] - off[R - 1])
        out[i] = (xr - xl) / 2
    return out


def taper(flat, xy, rad, end_reach=(0.0, 0.0)):
    """Fit radius (px) = r_a + slope * arc length over the measured profile widths, leaving out the
    stretches inside each end's junction. Returns r_a, r_b, and whether the taper is known."""
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(xy, axis=0), axis=1))])
    L = s[-1]
    meas = profile_radius(flat, xy, rad)
    ok = np.isfinite(meas) & (s >= end_reach[0]) & (s <= L - end_reach[1])
    if ok.sum() < 6:
        r = float(np.nanmedian(meas)) if np.isfinite(meas).any() else float(np.median(rad))
        return r, r, False
    slope, icpt, lo, hi = theilslopes(meas[ok], s[ok])
    ra, rb = icpt, icpt + slope * L
    if min(ra, rb) <= 0.25:   # a fit that runs out of width is a fit to noise: fall back to the median
        r = float(np.median(meas[ok]))
        return r, r, False
    se = (hi - lo) / (2 * 1.96)
    known = abs(slope) > TAPER_SIG * se and abs(ra - rb) > TAPER_MIN * (ra + rb) / 2
    return float(ra), float(rb), bool(known)


def graph(model):
    """Confirmed edges, node degrees over them, and adjacency (node -> [(edge index, other node)])."""
    E = [e for e in model['edges'] if e.get('state', 'vessel') in ('vessel', 'accepted') and e['a'] != e['b']]
    adj = {}
    for i, e in enumerate(E):
        adj.setdefault(e['a'], []).append((i, e['b'])); adj.setdefault(e['b'], []).append((i, e['a']))
    return E, adj


def edge_length_um(e, nodes):
    pts = [nodes[e['a']]] + list(e.get('via', [])) + [nodes[e['b']]]
    P = np.array([[p['x'], p['y']] for p in pts])
    return float(np.linalg.norm(np.diff(P, axis=0), axis=1).sum())


def short_loops(E, adj, lengths):
    """Edges that close a loop of at most SHORT_LOOP_EDGES edges or SHORT_LOOP_UM µm around: for each
    edge, the fewest-hop other path between its ends, searched up to LOOP_SEARCH_EDGES edges."""
    hits = []
    for i, e in enumerate(E):
        a, b = e['a'], e['b']
        best = {a: (0, 0.0)}
        q = deque([a])
        found = None
        while q:
            n = q.popleft()
            h, d = best[n]
            if h >= LOOP_SEARCH_EDGES - 1:
                continue
            for j, m in adj.get(n, []):
                if j == i or m in best:
                    continue
                best[m] = (h + 1, d + lengths[j])
                if m == b:
                    found = best[m]; q.clear(); break
                q.append(m)
        if found:
            hops, around = found[0] + 1, found[1] + lengths[i]
            if hops <= SHORT_LOOP_EDGES or around < SHORT_LOOP_UM:
                hits.append((i, hops, around))
    return hits


def leave_dirs(E, nodes, n, adj):
    """Unit directions (x, y) in which each edge leaves node n, read about two widths out along it."""
    out = []
    for j, m in adj[n]:
        e = E[j]
        pts = [nodes[e['a']]] + list(e.get('via', [])) + [nodes[e['b']]]
        if e['b'] == n:
            pts = pts[::-1]
        P = np.array([[p['x'], p['y']] for p in pts])
        reach = max(4 * nodes[n].get('r', 1.0), 3.0)
        s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
        k = min(np.searchsorted(s, reach), len(P) - 1)
        v = P[k] - P[0]
        out.append((j, v / (np.linalg.norm(v) or 1)))
    return out


def branch_tangents(E, nodes, n, adj, um, z_step):
    """Unit 3D directions (x, y, z in µm) in which each edge leaves node n, Cassot's way: the mean
    direction of the curve where it runs just outside a sphere as wide as the widest branch there.
    Depth counts only when the slice spacing is known; without it the directions are flat (z = 0)."""
    end_r = [E[j].get('r_a' if E[j]['a'] == n else 'r_b', nodes[n].get('r', 1.0)) for j, _ in adj[n]]
    R = max(max(end_r, default=1.0), 1.0)
    out = []
    for j, m in adj[n]:
        e = E[j]
        xy, _ = sample_edge(e, nodes, um)
        if e['b'] == n:
            xy = xy[::-1]
        P = np.column_stack([(xy[:, 0] + .5) * um, (xy[:, 1] + .5) * um, xy[:, 2] * (z_step or 0.0)])
        v = P - P[0]
        d = np.linalg.norm(v, axis=1)
        shell = (d >= R) & (d <= R + max(2 * R, 3.0))
        u = (v[shell] / d[shell, None]).mean(0) if shell.any() else v[-1] / (d[-1] or 1)
        out.append((j, u / (np.linalg.norm(u) or 1)))
    return out


def out_of_plane_deg(dirs):
    """For a three-way junction: the smallest angle any one branch makes with the plane of the other two."""
    best = 90.0
    for k in range(3):
        a, b = [dirs[i][1] for i in range(3) if i != k]
        nrm = np.cross(a, b)
        if np.linalg.norm(nrm) < 1e-6:
            continue
        best = min(best, float(np.degrees(np.arcsin(min(abs(dirs[k][1] @ nrm) / np.linalg.norm(nrm), 1.0)))))
    return best


def score(model, flat, measure_taper=True):
    """Score card for a model against its flattened stack. Adds r_a, r_b (and taper_known) to each
    confirmed edge when measure_taper; returns the card."""
    um = model['um_per_px']
    nodes = {n['id']: n for n in model['nodes']}
    E, adj = graph(model)
    lengths = [edge_length_um(e, nodes) for e in E]
    deg = {n: len(v) for n, v in adj.items()}
    on_len = total = 0.0
    contrast, unsupported, per_edge = [], [], []
    for i, e in enumerate(E):
        xy, rad = sample_edge(e, nodes, um)
        if len(xy) < 2:
            per_edge.append(None); continue
        near, side = support(flat, xy[:, :2], rad)
        seg = np.r_[0, np.linalg.norm(np.diff(xy[:, :2], axis=0), axis=1)]
        on = near >= ON_SIGNAL
        frac = float((seg * on).sum() / max(seg.sum(), 1e-9))
        on_len += frac * lengths[i]; total += lengths[i]
        c = float(np.median(near) - np.median(side))
        contrast.append(c)
        if frac < SUPPORTED:
            unsupported.append(i)
        rec = {'support': round(frac, 3), 'contrast': round(c, 2)}
        if measure_taper:
            reach = [nodes[e[k]].get('r', 0) / um if deg.get(e[k], 0) >= 3 else 0.0 for k in 'ab']
            ra, rb, known = taper(flat, xy[:, :2], rad, reach)
            e['r_a'], e['r_b'] = round(ra * um, 2), round(rb * um, 2)
            e['taper_known'] = known
        per_edge.append(rec)
    loops = short_loops(E, adj, lengths)
    junctions = [n for n, d in deg.items() if d >= 3]
    deg4 = [n for n in junctions if deg[n] >= 4]
    narrow, steep, conflict, murray = [], [], [], []
    z_step = model.get('z_step_um')
    for n in junctions:
        dirs = branch_tangents(E, nodes, n, adj, um, z_step)
        if z_step and len(dirs) == 3 and out_of_plane_deg(dirs) > STEEP_DEG:
            steep.append(n)
        ang = min(np.degrees(np.arccos(np.clip(u @ v, -1, 1))) for x, (_, u) in enumerate(dirs) for _, v in dirs[x + 1:])
        if ang < NARROW_DEG:
            narrow.append(n)
        if not measure_taper:
            continue
        rs = sorted(((E[j]['r_a'] if E[j]['a'] == n else E[j]['r_b']) for j, _ in adj[n]), reverse=True)
        if rs[0] <= ARTERIOLE_R:
            continue   # capillary junctions converge and diverge about evenly (Smith 2019): taper says nothing there
        # narrowing towards the junction (into it) from two or more known-taper edges: blood cannot both
        # arrive narrowing from two sides and leave widening; one trunk feeds the rest
        into = 0
        for j, m in adj[n]:
            e = E[j]
            if not e.get('taper_known'):
                continue
            r_here, r_far = (e['r_a'], e['r_b']) if e['a'] == n else (e['r_b'], e['r_a'])
            into += r_here < r_far
        if into >= 2:
            conflict.append(n)
        # Murray, at the same junctions only (not at capillary-capillary ones)
        murray.append(np.log(sum(r ** 3 for r in rs[1:])) / 3 - np.log(rs[0]))
    interior = sum(1 for d in deg.values() if d >= 2)
    card = {
        'edges': len(E), 'junctions': len(junctions), 'length_um': round(total, 1),
        'on_signal': round(on_len / max(total, 1e-9), 3),
        'unsupported_edges': len(unsupported),
        'median_contrast': round(float(np.median(contrast)) if contrast else 0.0, 2),
        'short_loops': len({i for i, _, _ in loops}),
        'degree4_rate': round(len(deg4) / max(interior, 1), 3),
        'narrow_junctions': round(len(narrow) / max(len(junctions), 1), 3),
        # depth along a faint vessel is noisy (about a slice), so over the few µm the tangent spans this rate runs high
        'steep_junctions': round(len(steep) / max(sum(1 for n in junctions if deg[n] == 3), 1), 3) if z_step else None,
        'taper_conflicts': round(len(conflict) / max(len(junctions), 1), 3) if measure_taper else None,   # per junction, counted at arteriole/venule junctions only
        'murray_log_ratio_median': round(float(np.median(murray)), 3) if murray else None,
        'median_segment_um': round(float(np.median(lengths)), 1) if lengths else 0.0,
        # healthy tissue has no blind ends inside the volume (Blinder 2013): an open end away from the frame is a gap or a spur
        'interior_ends': interior_ends(model, deg, nodes, flat.shape),
    }
    card['plausibility'] = plausibility(card)
    card['_flags'] = {'unsupported': [E[i]['id'] for i in unsupported], 'short_loop_edges': sorted({E[i]['id'] for i, _, _ in loops}),
                      'degree4_nodes': deg4, 'narrow_nodes': narrow, 'steep_nodes': steep, 'conflict_nodes': conflict}
    card['_per_edge'] = {E[i]['id']: r for i, r in enumerate(per_edge) if r}
    return card


def interior_ends(model, deg, nodes, shape):
    """Open ends more than one vessel width inside the frame, per junction (a fragmentation rate)."""
    um = model['um_per_px']
    H, W = shape
    n = 0
    for k, d in deg.items():
        if d != 1:
            continue
        p = nodes[k]
        x, y, w = p['x'] / um, p['y'] / um, max(2 * p.get('r', um) / um, 2.0)
        n += min(x, y, W - x, H - y) > w
    return round(n / max(sum(1 for d in deg.values() if d >= 3), 1), 2)


def plausibility(c):
    """One number to rank versions by, 0-1: the share of length on signal, discounted by each biological
    violation rate. Every factor is a rate, so the number does not grow with the field's size."""
    loops = c['short_loops'] / max(c['edges'], 1)
    deg4 = max(c['degree4_rate'] - DEGREE4_EXPECTED, 0)
    conf = c['taper_conflicts'] or 0
    return round(c['on_signal'] * (1 - min(loops * 4, 1)) * (1 - min(deg4 * 4, 1)) * (1 - c['narrow_junctions'] / 2) * (1 - conf / 2), 3)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('stack'); ap.add_argument('model'); ap.add_argument('--json')
    a = ap.parse_args()
    vol, um, _ = vm.read_cd31(a.stack, None)
    model = json.load(open(a.model))
    card = score(model, flat_signal(vol, um))
    print(' · '.join(f'{k} {v}' for k, v in card.items() if not k.startswith('_')))
    if a.json:
        json.dump(card, open(a.json, 'w'), indent=1)


if __name__ == '__main__':
    main()
