#!/usr/bin/env python3
"""Draft a 3D vessel graph for one region of a raw CD31 stack, for the owner to correct.

This is a DRAFT answer key, not a measurement: it exists so the owner can mark each traced edge and
junction right or wrong in the 3D viewer, and only what they confirm becomes ground truth.

    python3 analysis/trace_vessel_graph.py STACK.tif OUT_DIR --region Y0,X0,SIZE [--z-step UM | --flat]

--flat traces the stack flattened to one picture instead, so no depth and no z-step enter the graph.

OUT_DIR receives the region's viewer files (export_stack_view.py, full resolution) plus graph.json,
whose `_about` field explains every other field.
"""
import argparse, hashlib, json, os, re
import numpy as np
from scipy import ndimage as ndi
from skimage.filters import apply_hysteresis_threshold
from skimage.morphology import skeletonize, remove_small_objects

import export_stack_view as ev

# Every constant is either in noise units, in µm read off the file, or in multiples of the local
# vessel width, so none of them is a pixel count that happens to suit this stack.
BACKGROUND_UM = 11.0  # haze varies over tens of µm; capillaries are ~2-6 µm wide (Stefanitsch digest)
SMOOTH_UM = 0.55      # about the lateral resolution of a 20x objective
SEED_SIGMA, GROW_SIGMA = 5.0, 2.5   # hysteresis, in each slice's own robust noise units
SIGNAL_OVER_NOISE = 1.5            # a plane is traced only if its top 0.1% beats pure noise by this
MIN_OBJECT_UM3 = 60.0               # below a ~5 µm stretch of the thinnest capillary
# A real daughter vessel leaves its parent's wall (half the parent's width from the centerline) and
# runs at least its own width beyond it; by Murray's law (r0^a = r1^a + r2^a, a = 3 laminar, ~2.2
# measured in capillaries) an even split's daughter is 2^(-1/a) = 0.73-0.79 of the parent's width,
# so no real branch is shorter than 0.5 + 0.79 = 1.29 parent widths. The stubs between that floor
# and 2 parent widths were all wall bumps on the owner's first region, so 2 is used.
SPUR_WIDTHS = 2.0
MIN_OBJECT_UM2 = 20.0  # flattened specks; Rust et al. 2020 drop objects below the same area
ISLAND_WIDTHS = 4     # a lone piece shorter than 4 of its own widths is a speck
# Two vessels cross rather than meet when their branches arrive at depths further apart than this
# many times the branches' own point-to-point depth noise.
CROSS_SEPARATION = 3.0
MIN_DEPTH_NOISE_SLICES = 0.5
STRAIGHT_THROUGH_COS = -0.5    # two branches leaving a node over 120° apart are one vessel
# The lens blurs each vessel over neighbouring slices, so two crossing vessels touch in the slice
# where their blurs overlap: a branch counts in a slice only near its own strongest slices.
SLICE_PEAK_FRACTION = 0.5
SLICE_TOLERANCE = 1            # slices; a branch peaking one slice off its neighbour still meets it   # scale-dependent: a floor of half a slice on that noise
Z_STEP_PLACEHOLDER_UM = 1.0  # the owner's approved guess until the lab supplies the real z-step


def segment(vol, um_xy, z_step):
    """CD31 (Z, Y, X) -> mask, distance map (µm) and voxel spacing (µm) of a near-isotropic grid."""
    n_z = max(round((len(vol) - 1) * z_step / um_xy) + 1, 2)
    iso = ndi.zoom(vol.astype(np.float32), (n_z / len(vol), 1, 1), order=1)
    spacing = np.array([z_step * (len(vol) - 1) / (n_z - 1), um_xy, um_xy])
    r = iso - ndi.gaussian_filter(iso, (0, BACKGROUND_UM / um_xy, BACKGROUND_UM / um_xy))
    r = ndi.gaussian_filter(r, SMOOTH_UM / um_xy)
    # the signal fades with depth, so noise is measured per plane
    dev = np.abs(r - np.median(r, axis=(1, 2), keepdims=True))
    z = r / (1.4826 * np.median(dev, axis=(1, 2), keepdims=True) + 1e-9)
    # A plane whose brightest 0.1% is barely above what noise alone reaches (3.09 sigma) holds no
    # vessel to trace, only camera noise that the per-plane scaling would otherwise blow up.
    z[np.percentile(z, 99.9, axis=(1, 2)) < SIGNAL_OVER_NOISE * 3.09] = 0
    mask = apply_hysteresis_threshold(z, GROW_SIGMA, SEED_SIGMA)
    mask = ndi.binary_closing(mask, np.ones((3, 3, 3)))
    mask = remove_small_objects(mask, max_size=int(MIN_OBJECT_UM3 / um_xy ** 3))
    return mask, ndi.distance_transform_edt(mask, sampling=spacing), spacing


def segment_flat(vol, um_xy):
    """CD31 (Z, Y, X) -> the flattened picture's mask and distance map (µm), as one-plane volumes,
    the depth (in slices) where each pixel's signal sits, and each slice segmented on its own:
    its mask and its signal in noise units (all False / zero for a slice with no signal)."""
    # Each plane is put in its own noise units first, exactly as the 3D tracer does, and only then
    # flattened, so a vessel that is faint because it lies deep still counts as signal.
    v = vol.astype(np.float32)
    r = v - ndi.gaussian_filter(v, (0, BACKGROUND_UM / um_xy, BACKGROUND_UM / um_xy))
    r = ndi.gaussian_filter(r, (0, SMOOTH_UM / um_xy, SMOOTH_UM / um_xy))
    dev = np.abs(r - np.median(r, axis=(1, 2), keepdims=True))
    z = r / (1.4826 * np.median(dev, axis=(1, 2), keepdims=True) + 1e-9)
    keep = np.percentile(z, 99.9, axis=(1, 2)) >= SIGNAL_OVER_NOISE * 3.09   # as in segment()
    mask = apply_hysteresis_threshold(z[keep].max(axis=0), GROW_SIGMA, SEED_SIGMA)
    mask = ndi.binary_closing(mask, np.ones((3, 3)))
    mask = remove_small_objects(mask, max_size=int(MIN_OBJECT_UM2 / um_xy ** 2))
    skel = skeletonize(mask)
    dist = ndi.distance_transform_edt(mask, sampling=um_xy)
    zk = ndi.gaussian_filter(z[keep], (0, 2 * SMOOTH_UM / um_xy, 2 * SMOOTH_UM / um_xy))
    w = np.clip(zk - GROW_SIGMA, 0, None)
    depth = (w * np.flatnonzero(keep)[:, None, None]).sum(0) / (w.sum(0) + 1e-9)
    slices = np.zeros(z.shape, bool)
    for i in np.flatnonzero(keep):
        m = apply_hysteresis_threshold(z[i], GROW_SIGMA, SEED_SIGMA)
        slices[i] = remove_small_objects(ndi.binary_closing(m, np.ones((3, 3))), max_size=int(MIN_OBJECT_UM2 / um_xy ** 2))
    return skel[None], dist[None], np.array([1.0, um_xy, um_xy]), depth, slices, np.where(keep[:, None, None], z, 0)


def raw_graph(skel):
    """Skeleton -> node labels and edges as voxel paths between them."""
    k = np.ones((3, 3, 3), np.uint8); k[1, 1, 1] = 0
    nb = ndi.convolve(skel.astype(np.uint8), k, mode='constant') * skel
    node_vox = skel & (nb != 2)
    lab, n = ndi.label(node_vox, np.ones((3, 3, 3)))
    offs = [np.array(o) - 1 for o in np.ndindex(3, 3, 3) if o != (1, 1, 1)]
    shape = np.array(skel.shape)

    def nbrs(p):
        for o in offs:
            q = p + o
            if (q >= 0).all() and (q < shape).all() and skel[tuple(q)]:
                yield q

    edges, seen = [], set()
    for start in zip(*np.nonzero(node_vox)):
        for q in nbrs(np.array(start)):
            if node_vox[tuple(q)]:
                continue
            path, prev, cur = [np.array(start)], np.array(start), q
            while True:
                path.append(cur)
                if node_vox[tuple(cur)]:
                    break
                nxt = [w for w in nbrs(cur) if not (w == prev).all() and not any((w == p).all() for p in path[-3:])]
                if not nxt:
                    break
                prev, cur = cur, nxt[0]
            key = tuple(sorted([tuple(path[1]), tuple(path[-2])]))
            if key in seen:
                continue
            seen.add(key)
            end = lab[tuple(path[-1])] if node_vox[tuple(path[-1])] else 0
            edges.append([int(lab[start]), int(end), np.array(path)])
    cent = ndi.center_of_mass(node_vox, lab, range(1, n + 1))
    return {i: np.array(c) for i, c in enumerate(cent, 1)}, edges


def plen(p, spacing=1):
    return float(np.linalg.norm(np.diff(p, axis=0) * spacing, axis=1).sum())


def clean(pos, edges, dist_px):
    """Drop wall bumps and specks, merge junctions inside one vessel, and dissolve pass-through nodes."""
    rad = {i: float(dist_px[tuple(np.round(c).astype(int))]) for i, c in pos.items()}
    E = dict(enumerate(edges))
    nid = max(pos, default=0)

    def degrees():
        d = {}
        for a, b, _ in E.values():
            d[a] = d.get(a, 0) + 1; d[b] = d.get(b, 0) + 1
        return d

    def dissolve_pass_through():
        """A node where exactly two edges meet is a point on one vessel: join the two edges."""
        while True:
            for n in [n for n, d in degrees().items() if d == 2]:
                es = [k for k, (a, b, _) in E.items() if n in (a, b)]
                if len(es) != 2:
                    continue
                (a1, b1, p1), (a2, b2, p2) = E[es[0]], E[es[1]]
                if b1 != n: a1, b1, p1 = b1, a1, p1[::-1]
                if a2 != n: a2, b2, p2 = b2, a2, p2[::-1]
                E[es[0]] = [a1, b2, np.concatenate([p1, p2[1:]])]; del E[es[1]]
                break
            else:
                return

    changed = True
    while changed:
        changed = False
        for j, (a, b, p) in list(E.items()):   # a trace that ran round a loop ends on no node
            if b == 0:
                nid += 1; pos[nid] = p[-1].astype(float); rad[nid] = float(dist_px[tuple(p[-1])]); E[j][1] = nid
        dissolve_pass_through()
        deg = degrees()
        # Only the shortest spur at each junction goes per pass: two short spurs off one junction are
        # often a bump and the real vessel's last stretch, and the vessel must survive the bump.
        spurs = {}
        width = {j: 2 * float(dist_px[tuple(p.T)].mean()) for j, (a, b, p) in E.items()}
        for j, (a, b, p) in list(E.items()):
            L = plen(p)
            if a == b and L < 4 * max(rad[a], 1):
                del E[j]; changed = True; continue
            ends = (deg[a] == 1) + (deg[b] == 1)
            junc = a if deg[b] == 1 else b
            parent = [width[k] for k, (c, d, _) in E.items() if k != j and junc in (c, d)]
            if ends == 1 and L < SPUR_WIDTHS * max(float(np.median(parent)) if parent else 0, 1):
                if junc not in spurs or L < spurs[junc][1]:
                    spurs[junc] = (j, L)
            elif ends == 2 and L < ISLAND_WIDTHS * max(width[j], 1):
                del E[j]; changed = True
        for j, _ in spurs.values():
            del E[j]; changed = True
        if changed:
            continue
        deg = degrees()
        for j, (a, b, p) in list(E.items()):   # two junctions inside one vessel cross-section
            if a != b and plen(p) < rad[a] + rad[b] + 1 and deg[a] > 1 and deg[b] > 1:
                del E[j]
                for e in E.values():
                    e[0] = a if e[0] == b else e[0]; e[1] = a if e[1] == b else e[1]
                changed = True; break
    dissolve_pass_through()
    return pos, list(E.values())


ABOUT = {
    'status': 'DRAFT traced by trace_vessel_graph.py; nothing here is ground truth until the owner marks it',
    'units': 'µm; zyx_um is depth, row, column from the region corner (region_yx_px in the full frame)',
    'z_step_um': 'spacing between slices assumed when tracing; z_step_source says whether it is a guess',
    'flat': 'true when traced on the flattened picture: zyx_um depth is 0 and lengths are in the image plane',
    'depth_slices': 'flat only: the slice where the signal sits at each centerline point (edges) or node, '
                    'used to tell crossing vessels apart, never for length',
    'crossings': 'flat only: points where branches arrived at clearly separate depths, so the draft treats '
                 'them as vessels passing over each other; branch_depths_slices lists each group\'s depths; '
                 'decided_by: slices (some single slice shows the branches apart) or depth (too faint per slice)',
    'nodes': 'id, zyx_um, degree (edges meeting there), kind: junction (3+) or end (1), '
             'at_region_edge: the vessel continues outside the region, so this end is not a real tip',
    'edges': 'id, from/to node ids, length_um along the 3D centerline, width_um_mean/sd/min/max: twice the '
             'distance from the centerline to the mask edge, sampled along the edge; path_zyx_um: the centerline',
    'width_caveat': 'the 20x axial blur widens vessels along z, and widths under ~2 µm are near the pixel size',
}


def branch_depth(p, at, depth, dist_px):
    """A branch's depth a little way out from node `at`, its point-to-point depth noise, and the
    in-plane unit direction it leaves `at` in."""
    if np.linalg.norm(p[0] - at) > np.linalg.norm(p[-1] - at):
        p = p[::-1]
    w = 2 * dist_px[tuple(p.T)].mean()
    L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))])
    near = (L >= w) & (L <= 5 * w)   # clear of the blend at the junction itself
    if near.sum() < 3:
        near = L >= L[-1] / 3
    d = depth[p[:, 1], p[:, 2]]
    noise = 1.4826 * np.median(np.abs(np.diff(d))) / np.sqrt(2)   # not the vessel's slow dive
    heading = p[near][-1, 1:] - p[0, 1:]
    return float(np.median(d[near])), max(float(noise), MIN_DEPTH_NOISE_SLICES), heading / (np.linalg.norm(heading) + 1e-9)


def slice_groups(p_list, at, pieces, z, dist_px):
    """Group a junction's branches by the slices that show them: two branches join only if one slice
    shows both, each near its own strongest slices, in one connected piece of that slice.
    Returns the groups of branch indices and the branches no single slice shows."""
    near, strong = [], []
    for p in p_list:
        if np.linalg.norm(p[0] - at) > np.linalg.norm(p[-1] - at):
            p = p[::-1]
        w = 2 * dist_px[tuple(p.T)].mean()
        L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))])
        sel = (L >= w) & (L <= 3 * w)   # clear of the blend at the junction itself
        if sel.sum() < 2:
            sel = L >= L[-1] / 3
        q = p[sel][:, 1:]
        prof = np.array([np.median(z[k][q[:, 0], q[:, 1]] * (pieces[k][q[:, 0], q[:, 1]] > 0)) for k in range(len(z))])
        on = (prof > 0) & (prof >= SLICE_PEAK_FRACTION * prof.max())
        strong.append(ndi.binary_dilation(on, iterations=SLICE_TOLERANCE) if on.any() else on)
        near.append(q)
    seen = [i for i in range(len(p_list)) if strong[i].any()]
    root = list(range(len(p_list)))

    def find(i):
        while root[i] != i:
            i = root[i]
        return i
    for k in range(len(z)):
        ids = {}
        for i in seen:
            if strong[i][k]:
                l = pieces[k][near[i][:, 0], near[i][:, 1]]; l = l[l > 0]
                if len(l):
                    ids[i] = np.bincount(l).argmax()
        for i in ids:
            for j in ids:
                if i < j and ids[i] == ids[j]:
                    root[find(i)] = find(j)
    groups = {}
    for i in seen:
        groups.setdefault(find(i), []).append(i)
    return list(groups.values()), [i for i in range(len(p_list)) if i not in seen]


def split_crossings(pos, edges, depth, dist_px, slices, z):
    """Where a junction's branches are separate vessels passing over each other, give each vessel
    its own node, so a pair becomes one vessel passing through. The slices decide wherever they
    show the branches; a branch no single slice shows joins the group nearest its depth, and when
    fewer than two branches are shown, depth alone decides: separate depth groups with one pair
    running straight through. A branch that merely dives stays a branch."""
    edges = [list(e) for e in edges]
    deg = {}
    for a, b, _ in edges:
        deg[a] = deg.get(a, 0) + 1; deg[b] = deg.get(b, 0) + 1
    nid, crossings = max(pos), []
    pieces = np.stack([ndi.label(m, np.ones((3, 3)))[0] for m in slices])
    for n in [n for n, d in deg.items() if d >= 3]:
        ends = [(j, 0 if e[0] == n else 1) for j, e in enumerate(edges) if n in e[:2]]
        if len(ends) != deg[n]:
            continue
        bd = [branch_depth(edges[j][2], pos[n], depth, dist_px) for j, _ in ends]
        groups, faint = slice_groups([edges[j][2] for j, _ in ends], pos[n], pieces, z, dist_px)
        if sum(map(len, groups)) >= 2:
            how = 'slices'
            if len(groups) < 2:
                continue
            for i in faint:
                min(groups, key=lambda g: abs(np.median([bd[k][0] for k in g]) - bd[i][0])).append(i)
        else:
            how = 'depth'
            order = np.argsort([b[0] for b in bd])
            groups = [[order[0]]]
            for i, k in zip(order[:-1], order[1:]):
                if bd[k][0] - bd[i][0] > CROSS_SEPARATION * np.hypot(bd[k][1], bd[i][1]):
                    groups.append([])
                groups[-1].append(k)
            through = [g for g in groups if len(g) == 2 and bd[g[0]][2] @ bd[g[1]][2] < STRAIGHT_THROUGH_COS]
            if len(groups) < 2 or not through or any(len(g) == 2 and g not in through for g in groups):
                continue
        crossings.append((pos[n].copy(), [[round(bd[k][0], 1) for k in g] for g in groups], how))
        for g in groups[1:]:
            nid += 1; pos[nid] = pos[n].copy()
            for k in g:
                j, side = ends[k]; edges[j][side] = nid
    return pos, edges, crossings


def to_json(pos, edges, dist_um, sp, meta):
    deg = {}
    for a, b, _ in edges:
        deg[a] = deg.get(a, 0) + 1; deg[b] = deg.get(b, 0) + 1
    ren = {n: i for i, n in enumerate(sorted(deg), 1)}
    lim = np.array(dist_um.shape) - 1
    nodes = []
    for n in sorted(deg):
        c = pos[n]
        edge = bool(min(c[1], c[2]) < 3 or c[1] > lim[1] - 3 or c[2] > lim[2] - 3)
        nodes.append({'id': ren[n], 'zyx_um': [round(float(v), 2) for v in c * sp], 'degree': deg[n],
                      'kind': 'junction' if deg[n] >= 3 else 'end', 'at_region_edge': edge})
    out = []
    for j, (a, b, p) in enumerate(sorted(edges, key=lambda e: (e[2][:, 1].min(), e[2][:, 2].min())), 1):
        w = 2 * dist_um[tuple(p.T)]
        out.append({'id': j, 'from': ren[a], 'to': ren[b], 'length_um': round(plen(p, sp), 2),
                    'width_um_mean': round(float(w.mean()), 2), 'width_um_sd': round(float(w.std()), 2),
                    'width_um_min': round(float(w.min()), 2), 'width_um_max': round(float(w.max()), 2),
                    'path_zyx_um': (p * sp).round(2).tolist()})
    return {'_about': ABOUT, **meta, 'nodes': nodes, 'edges': out}


def trace_flat(vol, um, meta):
    skel, dist, sp, depth, slices, z = segment_flat(vol, um)
    pos, edges = raw_graph(skel)
    pos, edges = clean(pos, edges, dist / um)
    pos, edges, crossings = split_crossings(pos, edges, depth, dist / um, slices, z)
    pos, edges = clean(pos, edges, dist / um)
    g = to_json(pos, edges, dist, sp, {**meta, 'um_per_px': um, 'z_step_um': None, 'flat': True})
    at = lambda q: depth[int(round(q[1] / um)), int(round(q[2] / um))]
    for n in g['nodes']:
        n['depth_slice'] = round(float(at(n['zyx_um'])), 1)
    for e in g['edges']:
        e['depth_slices'] = [round(float(at(q)), 1) for q in e['path_zyx_um']]
    g['crossings'] = [{'id': i, 'zyx_um': [round(float(v), 2) for v in c * sp], 'depth_slice': float(max(map(max, ds))),
                       'branch_depths_slices': ds, 'decided_by': how} for i, (c, ds, how) in enumerate(crossings, 1)]
    return g


def trace(vol, um, z_step, meta):
    mask, dist, sp = segment(vol, um, z_step)
    pos, edges = raw_graph(skeletonize(mask).astype(bool))
    pos, edges = clean(pos, edges, dist / um)
    return to_json(pos, edges, dist, sp, {**meta, 'um_per_px': um, 'z_step_um': z_step})


def draft_id(g):
    """Names this draft for the viewer's saved marks, which must not carry over to a re-traced graph."""
    stem = re.sub(r'[^A-Za-z0-9_.-]+', '_', os.path.splitext(g['source'])[0]).strip('_')
    digest = hashlib.sha256(json.dumps([g['nodes'], g['edges']]).encode()).hexdigest()[:8]
    return f"{stem}-{g['region_yx_px'][0]}-{g['region_yx_px'][1]}-{g['region_size_px']}-{digest}"


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('stack'); ap.add_argument('out')
    ap.add_argument('--region', required=True, help='Y0,X0,SIZE in full-resolution px')
    ap.add_argument('--z-step', type=float, help='µm between slices; defaults to the file, then the placeholder')
    ap.add_argument('--flat', action='store_true', help='trace the flattened picture, ignoring depth')
    a = ap.parse_args()
    region = ev.parse_region(a.region)
    m = ev.export(a.stack, a.out, 1, a.z_step, region)
    z_step = m['z_step_um'] or Z_STEP_PLACEHOLDER_UM
    cd31 = next(c for c, name in ev.CHANNELS.items() if name == 'cd31')
    vol = ev.read_channel(a.stack, cd31, len(ev.CHANNELS), region)
    meta = {'source': m['source'], 'region_yx_px': list(region[:2]), 'region_size_px': region[2]}
    if a.flat:
        g = trace_flat(vol, m['um_per_px'], meta)
    else:
        g = trace(vol, m['um_per_px'], z_step, {**meta, 'z_step_source': m['z_step_source'] or 'placeholder'})
    g['draft_id'] = draft_id(g)
    with open(os.path.join(a.out, 'graph.json'), 'w') as f:
        json.dump(g, f)
    page = os.path.join(a.out, 'index.html')
    with open(page) as f:
        html = f.read().replace('<title>CD31 Stack Viewer</title>', '<title>Vessel Graph Review</title>', 1)
    with open(page, 'w') as f:
        f.write(html)
    n_j = sum(n['kind'] == 'junction' for n in g['nodes'])
    how = 'flattened' if a.flat else f"z-step {z_step} µm, {g['z_step_source']}"
    print(f"{m['source']} region {a.region}: {len(g['edges'])} edges, {n_j} junctions, "
          f"{sum(e['length_um'] for e in g['edges']):.0f} µm of centerline ({how}) -> {a.out}")


if __name__ == '__main__':
    main()
