#!/usr/bin/env python3
"""Draft a curved vessel model of a whole CD31 stack, for the owner to correct in the viewer.

The model is about a hundred KB of JSON instead of a stack of pictures: junctions and tips in 3D
joined by smooth curves, with the same number of slices as the stack it was drawn from. It is a DRAFT answer key:
the owner checks it against the stack in the 3D MicroViewer (side by side or overlaid), corrects it
there, and only the corrected model is ground truth.

    python3 analysis/vessel_model.py STACK.tif OUT.json [--channel N]

Reads a single-channel stack (the CD31-only trimmed files) or the two-channel originals (CD31 is
channel 1 there, data/README.md).

Tracing is the owner's chosen "flat plus depth": each slice is put in its own noise units, the slices
are flattened, the flat picture is thresholded and skeletonised, and every centerline point takes
the depth (in slices) where its signal sits. Each traced vessel between two junctions or tips then
becomes a curve through the fewest points on it that keep the curve within half the vessel's width
of its centerline, each point carrying the vessel's radius there.

A vessel takes up its width: two junctions whose discs overlap are one junction, and a branch is
measured from the edge of the junction it leaves. Where junctions still crowd far more densely than
the stack's own mean, the area is marked for the owner as probably traced wrong.

Tracing runs on a fainter threshold than the one the draft trusts, so it also finds vessels too faint
to be sure of. Those are kept as low-confidence "candidate" segments that the owner approves or
declines in the viewer, instead of being dropped unseen. Junctions are never stored: they are the
points where three or more confirmed segments meet.
"""
import argparse, json, os
import numpy as np
import tifffile
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
from scipy.stats import poisson
from skimage.filters import apply_hysteresis_threshold
from skimage.morphology import skeletonize, remove_small_objects

import stack_sources

# Every constant is in noise units, µm read off the file, or multiples of the vessel's own width.
BACKGROUND_UM = 11.0   # haze varies over tens of µm; capillaries are ~2-6 µm wide (Stefanitsch digest)
SMOOTH_UM = 0.55       # about the lateral resolution of a 20x objective
SEED_SIGMA, GROW_SIGMA = 5.0, 2.5   # hysteresis, in each slice's own robust noise units
CANDIDATE_SEED_SIGMA, CANDIDATE_GROW_SIGMA = 3.5, 2.0   # a fainter hysteresis finds the low-confidence vessels the owner reviews in the viewer
CANDIDATE_BELOW = 0.5               # a faint trace with less than half its centerline in the confident mask is a candidate
SIGNAL_OVER_NOISE = 1.5             # a slice counts only if its top 0.1% beats pure noise (3.09 sigma) by this
MIN_OBJECT_UM2 = 20.0  # flattened specks; Rust et al. 2020 drop objects below the same area
SPUR_WIDTHS = 2.0      # a side branch shorter than 2 parent widths is a wall bump (Murray floor 1.29, analysis/3D-STACKS.md)
ISLAND_WIDTHS = 4.0    # a lone piece shorter than 4 of its own widths is a speck
NETWORK_WIDTHS = 10.0  # a connected piece whose vessels add up to less than 10 widths is noise, not network
STRAIGHT_WIDTHS = 0.5  # an edge's curve may stray from the centerline by half the vessel's width
AXIAL_HALF_SLICES = 2.0   # a capillary spans 4-6 slices through depth at half its peak (measured on three stacks, analysis/3D-STACKS.md)
THROUGH_DEG = 60.0     # ASSUMPTION: a branch leaving a junction within 60° of straight on continues the vessel; fails where a trunk turns sharply at a split
DEPTH_SMOOTH_WIDTHS = 2.0  # the per-pixel depth is noisy on faint vessels: median along the path over this span
DENSE_WIDTHS = 5.0     # junctions are counted within 5 typical vessel widths of each junction
DENSE_P = 1e-3         # a count this unlikely at the stack's own mean junction density marks a knot the tracing likely got wrong

FORMAT = 'vessel-model/2'
ABOUT = ('status: draft as drawn by analysis/vessel_model.py, or corrected once the owner has edited it in the '
         '3D MicroViewer; a draft is not ground truth. '
         'nodes: the junctions and tips only, each with id, x and y in µm from the top-left corner of the image, z in '
         'slices (0 = the middle of the first slice; the spacing between slices is z_step_um, null while unknown, and '
         'then lengths in 3D are left out rather than guessed), and r, the vessel\'s radius there in µm. A tip on the '
         'image border is a vessel cut off by the frame, not a vessel end. '
         'edges: each a smooth curve from node a to node b through its via points in order, a centripetal Catmull-Rom '
         'over x, y and z as stored, with the radius running between the points that carry it. vessel: which edges '
         'are one vessel running on through its junctions (the extractor\'s guess, for the owner to correct). '
         'state: "vessel" (traced with confidence, or drawn by the owner), "candidate" (too faint to be sure of, '
         'waiting for the owner to review), "accepted" or "rejected" (the owner\'s verdict on a candidate; a rejected '
         'edge is kept as a recorded no and is not part of the network). confidence: the vessel\'s median signal over '
         'the confident seed level, capped at 1; a ranking for review, not a calibrated probability; absent on edges '
         'the owner drew. A junction is where three or more confirmed (vessel or accepted) edges meet. '
         'reviewed_regions: boxes the owner has checked completely; outside them a missing vessel is not annotated, '
         'not absent. dense_regions: boxes (x0, y0, x1, y1 in µm) where the extractor found far more junctions than the '
         'stack\'s own mean density makes likely (junctions found, and expected at that density), a hint that the '
         'tracing went wrong there; the viewer does not update them as the model is edited. '
         'excluded_regions: areas the owner marked as damaged sample, each {polygon: [[x, y], ...] in µm, reason}, '
         'running through every slice; whatever lies inside is left out of the analysis, and densities are taken over '
         'the rest of the field. '
         'Optional, written by analysis/extraction/lab.py: on an edge, r_a and r_b, the radius in µm at end a and end b '
         'measured across the vessel and fitted as a straight taper (the radius runs linearly between them; absent, '
         'read the points\' own r); taper_known, true where that taper is clearly more than noise; flow, "ab" or "ba" '
         'once the direction blood runs is known (not inferred by the extractor: narrowing runs with the flow in '
         'arterioles but against it in venules); bridged, true on an edge the extractor drew across a gap in the '
         'signal. At the top: algorithm, the extraction version that drew the model; score, its plausibility card; '
         'repairs, what that version changed.')


def read_cd31(path, channel):
    with tifffile.TiffFile(path) as tf:
        s = tf.series[0]
        a = s.asarray()
        axes = s.axes
        page = tf.pages[0]
        xres = page.tags.get('XResolution')
        ij = tf.imagej_metadata or {}
    if axes == 'ZCYX':
        a = a[:, 1 if channel is None else channel]
    elif axes != 'ZYX':
        raise SystemExit(f'unexpected layout {axes} {a.shape}')
    um = xres.value[1] / xres.value[0] if xres and ij.get('unit') in ('micron', 'um', 'µm') else None
    if not um:
        raise SystemExit('the file records no pixel size in µm')
    return a.astype(np.float32), um, ij.get('spacing') or stack_sources.z_step_um(path)


def noise_units(vol, um):
    """Each slice with its background removed, in its own robust noise units; slices with no signal
    above noise are zeroed (the signal fades with depth, so one stack-wide scale would not do)."""
    r = vol - ndi.gaussian_filter(vol, (0, BACKGROUND_UM / um, BACKGROUND_UM / um))
    r = ndi.gaussian_filter(r, (0, SMOOTH_UM / um, SMOOTH_UM / um))
    dev = np.abs(r - np.median(r, axis=(1, 2), keepdims=True))
    z = r / (1.4826 * np.median(dev, axis=(1, 2), keepdims=True) + 1e-9)
    keep = np.percentile(z, 99.9, axis=(1, 2)) >= SIGNAL_OVER_NOISE * 3.09
    return np.where(keep[:, None, None], z, 0), keep


def segment(z, keep, um, fill_lumens=False):
    """The confident and the faint-seeded masks, the depth (slices) of each pixel, and the flattened
    signal in noise units. fill_lumens fills every hole narrower than the mask's own median vessel
    width: a gap that thin is a lumen or a stain dropout inside one vessel, not tissue between two."""
    flat = z[keep].max(axis=0)

    def mask_at(grow, seed):
        m = ndi.binary_closing(apply_hysteresis_threshold(flat, grow, seed), np.ones((3, 3)))
        m = remove_small_objects(m, max_size=int(MIN_OBJECT_UM2 / um ** 2))
        if fill_lumens and m.any():
            holes = ndi.binary_fill_holes(m) & ~m
            lab, n = ndi.label(holes)
            if n:
                width = 2 * float(np.median(ndi.distance_transform_edt(m)[m]))
                narrow = ndi.maximum(ndi.distance_transform_edt(holes), lab, range(1, n + 1)) < width
                m = m | np.concatenate([[False], narrow])[lab]
        return m
    confident, mask = mask_at(GROW_SIGMA, SEED_SIGMA), mask_at(CANDIDATE_GROW_SIGMA, CANDIDATE_SEED_SIGMA)
    zk = ndi.gaussian_filter(z[keep], (0, 2 * SMOOTH_UM / um, 2 * SMOOTH_UM / um))
    w = np.clip(zk - GROW_SIGMA, 0, None)
    slices = np.flatnonzero(keep)
    # where the blurred signal clears the growth level nowhere, the brightest slice stands in
    depth = np.where(w.sum(0) > 0, (w * slices[:, None, None]).sum(0) / (w.sum(0) + 1e-9), slices[zk.argmax(0)])
    return confident, mask, depth, flat


NB = [(dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]


def skeleton_graph(skel):
    """2D skeleton -> node positions (px, y x) and edges as pixel paths between node ids."""
    count = ndi.convolve(skel.astype(np.uint8), np.array([[1, 1, 1], [1, 0, 1], [1, 1, 1]]), mode='constant') * skel
    node_px = skel & (count != 2)
    lab, n = ndi.label(node_px, np.ones((3, 3)))
    H, W = skel.shape
    on = lambda y, x: 0 <= y < H and 0 <= x < W and skel[y, x]
    edges, seen = [], set()
    for sy, sx in zip(*np.nonzero(node_px)):
        for dy, dx in NB:
            y, x = sy + dy, sx + dx
            if not on(y, x) or node_px[y, x]:
                continue
            path, prev = [(sy, sx), (y, x)], (sy, sx)
            while not node_px[path[-1]]:
                cy, cx = path[-1]
                nxt = [(cy + a, cx + b) for a, b in NB if on(cy + a, cx + b) and (cy + a, cx + b) not in path[-3:]]
                if not nxt:
                    break
                # prefer stepping onto a node, then orthogonal steps, so paths do not cut corners off each other
                nxt.sort(key=lambda p: (not node_px[p], abs(p[0] - cy) + abs(p[1] - cx)))
                prev, _ = path[-1], path.append(nxt[0])
            key = (min(path[1], path[-2]), max(path[1], path[-2]), len(path))
            if key in seen:
                continue
            seen.add(key)
            end = int(lab[path[-1]]) if node_px[path[-1]] else 0
            edges.append([int(lab[sy, sx]), end, np.array(path)])
    cent = ndi.center_of_mass(node_px, lab, range(1, n + 1))
    return {i: np.array(c) for i, c in enumerate(cent, 1)}, edges


def plen(p):
    return float(np.linalg.norm(np.diff(p, axis=0), axis=1).sum())


def clean(pos, edges, dist):
    """Drop wall bumps and specks, then join edges through points where only two meet."""
    E = dict(enumerate(edges))
    nid = max(pos, default=0)
    for j, (a, b, p) in E.items():   # a trace that ran round a loop ends on no node
        if b == 0:
            nid += 1; pos[nid] = p[-1].astype(float); E[j][1] = nid

    def degrees():
        d = {}
        for a, b, _ in E.values():
            d[a] = d.get(a, 0) + 1; d[b] = d.get(b, 0) + 1
        return d

    def join_pass_through():
        while True:
            for n in [n for n, d in degrees().items() if d == 2]:
                es = [k for k, (a, b, _) in E.items() if n in (a, b)]
                if len(es) != 2 or es[0] == es[1]:
                    continue
                (a1, b1, p1), (a2, b2, p2) = E[es[0]], E[es[1]]
                if b1 != n: a1, b1, p1 = b1, a1, p1[::-1]
                if a2 != n: a2, b2, p2 = b2, a2, p2[::-1]
                E[es[0]] = [a1, b2, np.concatenate([p1, p2[1:]])]; del E[es[1]]
                break
            else:
                return

    width = lambda p: 2 * float(dist[p[:, 0], p[:, 1]].mean())
    reach = lambda n: float(dist[tuple(np.round(pos[n]).astype(int))])

    def merge(j):
        """Edge j's two ends become one point, midway, and the edge goes."""
        a, b, _ = E.pop(j)
        pos[a] = (pos[a] + pos[b]) / 2
        for k, e in E.items():
            E[k] = [a if e[0] == b else e[0], a if e[1] == b else e[1], e[2]]
    changed = True
    while changed:
        changed = False
        join_pass_through()
        deg = degrees()
        spurs = {}   # only the shortest spur per junction goes per pass, so a vessel's last stretch survives its bump
        for j, (a, b, p) in list(E.items()):
            L = plen(p)
            if a == b and L < 4 * max(width(p), 1):
                del E[j]; changed = True; continue
            ends = (deg[a] == 1) + (deg[b] == 1)
            if ends == 2 and L < ISLAND_WIDTHS * max(width(p), 1):
                del E[j]; changed = True; continue
            if ends == 1 and a != b:
                junc = a if deg[b] == 1 else b
                parent = [width(q) for k, (c, d, q) in E.items() if k != j and junc in (c, d)]
                # the part of a spur inside its junction's own width is the junction, not the branch
                if parent and L - reach(junc) < SPUR_WIDTHS * max(float(np.median(parent)), 1):
                    if junc not in spurs or L < spurs[junc][1]:
                        spurs[junc] = (j, L)
        for j, _ in spurs.values():
            del E[j]; changed = True
        # a vessel has the width it was traced with: two points whose discs overlap sit inside one
        # vessel, so the edge between them is the skeleton's stair inside a wide vessel, not a vessel
        for j, (a, b, p) in sorted(E.items(), key=lambda kv: plen(kv[1][2])):
            if a != b and j in E and E[j][:2] == [a, b] and plen(p) < reach(a) + reach(b):
                merge(j); changed = True
        # two short paths between the same two junctions are one vessel the skeleton split around a hole
        pairs = {}
        for j, (a, b, p) in E.items():
            if a != b:
                pairs.setdefault((min(a, b), max(a, b)), []).append(j)
        for js in pairs.values():
            if len(js) > 1:
                short = min(js, key=lambda j: plen(E[j][2]))
                if plen(E[short][2]) < ISLAND_WIDTHS * max(width(E[short][2]), 1):
                    del E[short]; changed = True
    join_pass_through()
    root = {}
    def find(n):
        while root.get(n, n) != n:
            n = root[n]
        return n
    for a, b, _ in E.values():
        root[find(a)] = find(b)
    total, wsum = {}, {}
    for a, b, p in E.values():
        r = find(a); L = plen(p)
        total[r] = total.get(r, 0) + L; wsum[r] = wsum.get(r, 0) + L * width(p)
    return [e for e in E.values() if total[find(e[0])] >= NETWORK_WIDTHS * max(wsum[find(e[0])] / max(total[find(e[0])], 1e-9), 1)]


def catmull_rom(P0, P1, P2, P3, t):
    """Points at t (array, 0..1) between P1 and P2 of a centripetal Catmull-Rom through P0..P3
    (Barry and Goldman's form); the viewer draws the same curve."""
    P = [np.asarray(q, float) for q in (P0, P1, P2, P3)]
    d = lambda p, q: max(float(np.linalg.norm(p - q)) ** .5, 1e-6)
    t0, t1 = 0.0, d(P[0], P[1]); t2 = t1 + d(P[1], P[2]); t3 = t2 + d(P[2], P[3])
    u = (t1 + (t2 - t1) * np.asarray(t, float))[:, None]
    lerp = lambda p, q, ta, tb: ((tb - u) * p + (u - ta) * q) / (tb - ta)
    A1, A2, A3 = lerp(P[0], P[1], t0, t1), lerp(P[1], P[2], t1, t2), lerp(P[2], P[3], t2, t3)
    return lerp(lerp(A1, A2, t0, t2), lerp(A2, A3, t1, t3), t1, t2)


def curve(pts, step):
    """Samples of the curve through pts (K, 3) in order, its ends continued straight, about step apart."""
    ext = np.vstack([2 * pts[0] - pts[1], pts, 2 * pts[-1] - pts[-2]])
    out = []
    for k in range(len(pts) - 1):
        n = max(int(np.ceil(1.5 * np.linalg.norm(pts[k + 1] - pts[k]) / step)), 4)
        out.append(catmull_rom(*ext[k:k + 4], np.linspace(0, 1, n, endpoint=False)))
    return np.vstack(out + [pts[-1:]])


def fit_curve(p, tol):
    """Indices of the fewest points of path p (N, 3) that a curve through them keeps within tol of
    every path point: start from the two ends, and add the path point the curve strays furthest
    from until none strays more than tol."""
    keep = [0, len(p) - 1]
    while True:
        c = curve(p[keep], tol / 4)
        d = np.min(np.linalg.norm(p[:, None, :] - c[None, :, :], axis=2), axis=1)
        k = int(np.argmax(d))
        if d[k] <= tol or k in keep:
            return keep
        keep = sorted(keep + [k])


def trace(mask):
    """The cleaned skeleton graph of a mask, and its distance map in px."""
    dist = ndi.distance_transform_edt(mask)
    pos, edges = skeleton_graph(skeletonize(mask))
    return pos, clean(pos, edges, dist), dist


def model(vol, um, source, z_step, fill_lumens=False):
    z, keep = noise_units(vol, um)
    confident, faint, depth, flat = segment(z, keep, um, fill_lumens)
    where, E = {}, []   # node key -> (y px, x px, z slices); edges as pixel paths between node keys

    def add(tag, pos, edges, dist, state):
        for a, b, p in edges:
            rad = dist[p[:, 0], p[:, 1]]
            w = 2 * float(rad.mean())
            d = ndi.median_filter(depth[p[:, 0], p[:, 1]], size=max(int(DEPTH_SMOOTH_WIDTHS * w) | 1, 3), mode='nearest')
            # the vessel's median signal against the confident seed level: a ranking, not a calibrated probability
            conf = round(min(float(np.median(flat[p[:, 0], p[:, 1]])) / SEED_SIGMA, 1.0), 2)
            E.append({'a': (tag, a), 'b': (tag, b), 'p': p, 'd': d, 'rad': rad, 'w': w, 'state': state, 'conf': conf})
        for n in {k for a, b, _ in edges for k in (a, b)}:   # a junction or tip sits at the median depth its edges arrive at
            arrive = [depth[tuple(q[0] if np.linalg.norm(q[0] - pos[n]) < np.linalg.norm(q[-1] - pos[n]) else q[-1])]
                      for e0, e1, q in edges if n in (e0, e1)]
            where[tag, n] = (*pos[n], float(np.median(arrive)))

    pos, edges, dist = trace(confident)
    add('v', pos, edges, dist, 'vessel')
    sure = len(E)
    # the faint trace adds only what the confident one does not already hold; where it reaches a
    # confident vessel it joins it, so the two are one network
    pos, edges, dist = trace(faint)
    add('c', pos, [e for e in edges if float(confident[e[2][:, 0], e[2][:, 1]].mean()) < CANDIDATE_BELOW], dist, 'candidate')
    snap_candidates(E, sure, where, confident)
    prune_candidates(E)
    return curves(E, where, um, vol.shape, source, z_step)


def snap_candidates(E, sure, where, confident):
    """Each candidate end that lies on a confident vessel is moved onto it: onto the vessel's own
    junction or tip within a pixel of it, or onto a new point that splits the vessel there."""
    pix = np.vstack([e['p'] for e in E[:sure]]) if sure else np.zeros((0, 2))
    owner = np.concatenate([np.column_stack([np.full(len(e['p']), i), np.arange(len(e['p']))]) for i, e in enumerate(E[:sure])]) if sure else None
    tree = cKDTree(pix) if sure else None
    to, splits = {}, {}
    for e in E[sure:]:
        for end, k in (('a', 0), ('b', -1)):
            n = e[end]
            if n in to or not sure or not confident[tuple(e['p'][k])]:
                continue
            dd, j = tree.query(e['p'][k])
            if dd > max(e['w'], 2.0):
                continue
            i, at = owner[j]
            L = len(E[i]['p'])
            to[n] = ('node', E[i]['a']) if at <= 1 else ('node', E[i]['b']) if at >= L - 2 else ('split', int(i), int(at))
            if to[n][0] == 'split':
                splits.setdefault(int(i), set()).add(int(at))
    # split points within a pixel of each other along one vessel are one point
    rep = {}
    for i, ks in splits.items():
        last = None
        for k in sorted(ks):
            if last is None or k - last > 1:
                last = k
            rep[i, k] = last
    pieces = {}
    for i in splits:
        e, ks = E[i], sorted(set(rep[i, k] for k in splits[i]))
        cuts, keys = [0] + ks + [len(e['p']) - 1], [e['a']] + [('s', i, k) for k in ks] + [e['b']]
        for k in ks:
            where['s', i, k] = (*e['p'][k], float(e['d'][k]))
        pieces[i] = [{**e, 'a': keys[q], 'b': keys[q + 1], 'p': e['p'][cuts[q]:cuts[q + 1] + 1], 'd': e['d'][cuts[q]:cuts[q + 1] + 1],
                      'rad': e['rad'][cuts[q]:cuts[q + 1] + 1]} for q in range(len(ks) + 1)]
    for e in E[sure:]:
        for end in 'ab':
            t = to.get(e[end])
            if t:
                e[end] = t[1] if t[0] == 'node' else ('s', t[1], rep[t[1], t[2]])
    E[:] = [q for i, e in enumerate(E) for q in pieces.get(i, [e])]


def prune_candidates(E):
    """The confident trace takes the middle out of many faint ones, leaving stubs: a candidate that
    ends in nothing and is shorter than a spur, or touches nothing and is shorter than an island, goes."""
    while True:
        deg = {}
        for e in E:
            for n in (e['a'], e['b']):
                deg[n] = deg.get(n, 0) + 1
        drop = [i for i, e in enumerate(E) if e['state'] == 'candidate' and e['a'] != e['b']
                and plen(e['p']) < {0: 0, 1: SPUR_WIDTHS, 2: ISLAND_WIDTHS}[(deg[e['a']] == 1) + (deg[e['b']] == 1)] * max(e['w'], 1)]
        if not drop:
            return
        E[:] = [e for i, e in enumerate(E) if i not in set(drop)]


def curves(E, where, um, shape, source, z_step):
    """The vessel-model/2 file: junctions and tips, and each edge as the fewest on-vessel points a
    curve through them needs to stay within half the vessel's width of its centerline."""
    ids, nodes = {}, []
    xyz = lambda y, x, d: np.array([(float(x) + .5) * um, (float(y) + .5) * um, float(d)])
    end_r = {}

    def r_at(e, k):
        h = max(int(e['w']), 1)
        return round(float(np.median(e['rad'][max(k - h, 0):k + h + 1])) * um, 2)

    out = []
    for e in E:
        # the pixel path steps in stairs and its depth is noisy: neither is a bend of the vessel
        w = max(e['w'], 1.0)
        yx = ndi.gaussian_filter1d(e['p'].astype(float), max(STRAIGHT_WIDTHS * w, 1.0), axis=0, mode='nearest')
        d = ndi.gaussian_filter1d(e['d'].astype(float), DEPTH_SMOOTH_WIDTHS / 2 * w, mode='nearest')
        P = np.column_stack([(yx[:, 1] + .5) * um, (yx[:, 0] + .5) * um, d])
        P[0], P[-1] = xyz(*where[e['a']]), xyz(*where[e['b']])
        if len(P) < 2 or (e['a'] == e['b'] and len(P) < 4):
            continue
        # a curve strays when it leaves the vessel sideways by half its width, or in depth by half
        # the depth a vessel spans: depth is scaled so that both read as the same tolerance
        tol = max(STRAIGHT_WIDTHS * e['w'], 1.0) * um
        keep = fit_curve(P * [1, 1, tol / AXIAL_HALF_SLICES], tol)
        if e['a'] == e['b'] and len(keep) < 4:   # a loop needs two points of its own to stay a loop
            continue
        for end, k in (('a', 0), ('b', len(P) - 1)):
            end_r.setdefault(e[end], []).append(r_at(e, k))
        via = [{'x': round(P[k, 0], 2), 'y': round(P[k, 1], 2), 'z': round(P[k, 2], 2), 'r': r_at(e, k)} for k in keep[1:-1]]
        out.append({'e': e, 'via': via, 'P': P})
    for o in out:
        for end in 'ab':
            n = o['e'][end]
            if n not in ids:
                ids[n] = len(nodes) + 1
                x, y, d = xyz(*where[n])
                nodes.append({'id': ids[n], 'x': round(x, 2), 'y': round(y, 2), 'z': round(d, 2), 'r': round(float(np.median(end_r[n])), 2)})
    vessel = vessel_ids(out, ids)
    edges = [{'id': k + 1, 'a': ids[o['e']['a']], 'b': ids[o['e']['b']], 'vessel': vessel[k], 'state': o['e']['state'],
              'confidence': o['e']['conf'], 'via': o['via']} for k, o in enumerate(out)]
    Z, H, W = shape
    dense = dense_regions(nodes, edges, W * H * um * um)
    return {'format': FORMAT, '_about': ABOUT, 'status': 'draft', 'source': source, 'slices': int(Z), 'size_px': [int(W), int(H)],
            'um_per_px': um, 'z_step_um': z_step, 'nodes': nodes, 'edges': edges, 'reviewed_regions': [],
            'dense_regions': dense, 'excluded_regions': []}


def dense_regions(nodes, edges, area):
    """Boxes (µm) around knots of junctions far denser than the stack's own: around each junction,
    the junctions within DENSE_WIDTHS typical widths are counted, and a count the stack's mean
    density makes less likely than DENSE_P marks it; marked junctions within reach of each other
    make one box."""
    sure = [e for e in edges if e['state'] == 'vessel']
    deg = np.bincount([e[k] for e in sure for k in 'ab'], minlength=len(nodes) + 1)
    J = np.array([[n['x'], n['y']] for n in nodes if deg[n['id']] >= 3])
    if len(J) < 2:
        return []
    R = DENSE_WIDTHS * 2 * float(np.median([n['r'] for n in nodes if deg[n['id']]] or [1.0]))
    tree = cKDTree(J)
    count = np.array([len(tree.query_ball_point(p, R)) - 1 for p in J])
    mu = len(J) / area * np.pi * R * R
    marked = np.flatnonzero(poisson.sf(count - 1, mu) < DENSE_P)
    root = {i: i for i in marked}
    def find(i):
        while root[i] != i:
            i = root[i]
        return i
    for i in marked:
        for j in tree.query_ball_point(J[i], R):
            if j in root:
                root[find(j)] = find(i)
    groups = {}
    for i in marked:
        groups.setdefault(find(i), set()).update(j for j in tree.query_ball_point(J[i], R))
    out = []
    for g in groups.values():
        P = J[sorted(g)]
        (x0, y0), (x1, y1) = P.min(0) - R / 2, P.max(0) + R / 2
        out.append({'x0': round(float(x0), 2), 'y0': round(float(y0), 2), 'x1': round(float(x1), 2), 'y1': round(float(y1), 2),
                    'junctions': len(g), 'expected': round(len(J) / area * float((x1 - x0) * (y1 - y0)), 1)})
    return out


def vessel_ids(out, ids):
    """One id per vessel: at each junction the two branches of one state that run most nearly
    straight on through it, within THROUGH_DEG of straight, continue one vessel."""
    root = list(range(len(out)))
    def find(i):
        while root[i] != i:
            root[i] = root[root[i]]; i = root[i]
        return i
    at = {}
    for k, o in enumerate(out):
        P, w = o['P'], max(o['e']['w'], 1.0)
        reach = min(max(int(2 * w), 2), len(P) - 1)   # the direction a branch leaves in, two widths out
        for end, a, b in (('a', P[0], P[reach]), ('b', P[-1], P[-1 - reach])):
            v = (b - a)[:2]
            at.setdefault(ids[o['e'][end]], []).append((k, v / (np.linalg.norm(v) or 1)))
    for arms in at.values():
        free = list(arms)
        while True:
            pairs = [(float(p[1] @ q[1]), x, y) for x, p in enumerate(free) for y, q in enumerate(free)
                     if x < y and p[0] != q[0] and out[p[0]]['e']['state'] == out[q[0]]['e']['state']]
            if not pairs or min(pairs)[0] > -np.cos(np.radians(THROUGH_DEG)):
                break
            _, x, y = min(pairs)
            root[find(free[x][0])] = find(free[y][0])
            free = [f for z, f in enumerate(free) if z not in (x, y)]
    first = {}
    return [first.setdefault(find(k), len(first) + 1) for k in range(len(out))]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('stack'); ap.add_argument('out')
    ap.add_argument('--channel', type=int, help='channel index in a multi-channel stack (default: CD31 = 1)')
    a = ap.parse_args()
    vol, um, z_step = read_cd31(a.stack, a.channel)
    m = model(vol, um, os.path.basename(a.stack), z_step)
    with open(a.out, 'w') as f:
        json.dump(m, f, separators=(',', ':'))
    sure = [e for e in m['edges'] if e['state'] == 'vessel']
    junctions = sum(1 for v in np.bincount([e[k] for e in sure for k in 'ab']) if v >= 3)
    print(f"{len(m['nodes'])} junctions and tips, {len(sure)} curved vessel edges through "
          f"{sum(len(e['via']) for e in sure)} curve points, {junctions} junctions, {len(set(e['vessel'] for e in sure))} vessels, "
          f"{len(m['edges']) - len(sure)} low-confidence edges to review, {os.path.getsize(a.out) / 1024:.0f} KB")


if __name__ == '__main__':
    main()
