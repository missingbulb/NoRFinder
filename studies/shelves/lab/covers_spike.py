# Exploratory script, not the finder (2026-11-07): kept for the next iteration of covers; books.py does not import it.
"""Cover finder prototype: straight lines at any angle, every quadrilateral two near-parallel pairs of them make, kept
only when each side lies on edges and parts the cover from something else."""
import sys; sys.path.insert(0, __import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), '..', 'py'))
import numpy as np, books
from books import ndi
P = dict(seg=0.05, run_on=0.6, peaks=70, side_on=0.7, contrast=0.12, par=20, cross=40, area=(0.01, 0.6), aspect=(1.0, 2.6))

def lines_of(e):
    """(angles, distances) of straight lines, one per straight edge segment at least SEG of the photo long, near
    duplicates merged: a cover's edges count as much as the long background lines."""
    from skimage.transform import probabilistic_hough_line
    L = max(e.h, e.w)
    segs = probabilistic_hough_line(e.all, threshold=10, line_length=int(P['seg'] * L), line_gap=3, rng=0)
    segs = sorted(segs, key=lambda s_: -np.hypot(s_[1][0] - s_[0][0], s_[1][1] - s_[0][1]))
    out = []
    for (x0, y0), (x1, y1) in segs:
        a_ = np.arctan2(x1 - x0, -(y1 - y0))  # normal direction
        a_ = (a_ + np.pi / 2) % np.pi - np.pi / 2
        d_ = x0 * np.cos(a_) + y0 * np.sin(a_)
        if any(np.degrees(abs((a_ - b_ + np.pi / 2) % np.pi - np.pi / 2)) < 2 and abs(d_ - e_) < 0.01 * L for b_, e_ in out):
            continue
        out.append((a_, d_))
        if len(out) >= P['peaks']:
            break
    return np.array([o[0] for o in out]), np.array([o[1] for o in out])


def meet(a1, d1, a2, d2):
    # x cos a + y sin a = d
    det = np.cos(a1) * np.sin(a2) - np.sin(a1) * np.cos(a2)
    x = (d1 * np.sin(a2) - d2 * np.sin(a1)) / det
    y = (np.cos(a1) * d2 - np.cos(a2) * d1) / det
    return np.stack([x, y], -1)

def find_covers(rgb_small, g):
    e = books.Edges(g, rgb_small)
    h, w = e.h, e.w
    ang, dist = lines_of(e)
    n = len(ang)
    if n < 4: return []
    dang = lambda a, b: np.degrees(np.abs((a - b + np.pi / 2) % np.pi - np.pi / 2))
    pairs = [(i, j) for i in range(n) for j in range(i + 1, n) if dang(ang[i], ang[j]) <= P['par'] and abs(dist[i] - dist[j]) >= 0.05 * min(h, w)]
    combos = [(p, q) for a, p in enumerate(pairs) for q in pairs[a + 1:]
              if dang(ang[p[0]], ang[q[0]]) >= P['cross'] and not set(p) & set(q)]
    if not combos: return []
    C = np.array([[p[0], p[1], q[0], q[1]] for p, q in combos])
    A, D = ang[C], dist[C]
    # corners in order: (p0,q0) (p0,q1) (p1,q1) (p1,q0)
    c = np.stack([meet(A[:, 0], D[:, 0], A[:, 2], D[:, 2]), meet(A[:, 0], D[:, 0], A[:, 3], D[:, 3]),
                  meet(A[:, 1], D[:, 1], A[:, 3], D[:, 3]), meet(A[:, 1], D[:, 1], A[:, 2], D[:, 2])], 1)
    ok = np.all((c[..., 0] > -2) & (c[..., 0] < w + 2) & (c[..., 1] > -2) & (c[..., 1] < h + 2), axis=1)
    c, C = c[ok], C[ok]
    side = np.roll(c, -1, axis=1) - c
    L = np.hypot(side[..., 0], side[..., 1])
    area = 0.5 * np.abs(np.sum(c[..., 0] * np.roll(c[..., 1], -1, 1) - np.roll(c[..., 0], -1, 1) * c[..., 1], axis=1))
    asp = np.maximum(L[:, 0] + L[:, 2], L[:, 1] + L[:, 3]) / np.maximum(1e-6, np.minimum(L[:, 0] + L[:, 2], L[:, 1] + L[:, 3]))
    ok = (area >= P['area'][0] * h * w) & (area <= P['area'][1] * h * w) & (asp >= P['aspect'][0]) & (asp <= P['aspect'][1])
    c, side, L, area = c[ok], side[ok], L[ok], area[ok]
    if not len(c): return []
    u = np.linspace(0.08, 0.92, 40)
    pts = c[:, :, None, :] + u[None, None, :, None] * side[:, :, None, :]
    xi, yi = np.clip(np.round(pts[..., 0]).astype(int), 0, w - 1), np.clip(np.round(pts[..., 1]).astype(int), 0, h - 1)
    on = e.near[yi, xi].mean(axis=2)
    # across each side: the colour a few pixels in, and a few out
    cen = c.mean(axis=1)[:, None, None, :]
    nrm = np.stack([-side[..., 1], side[..., 0]], -1) / np.maximum(L[..., None], 1e-6)
    sgn = np.sign(np.sum((cen - pts) * nrm[:, :, None, :], axis=-1, keepdims=True))
    k = max(3, int(0.01 * max(h, w)))
    sample = lambda q: e.rgb[np.clip(np.round(q[..., 1]).astype(int), 0, h - 1), np.clip(np.round(q[..., 0]).astype(int), 0, w - 1)]
    inn = sample(pts + sgn * k * nrm[:, :, None, :]); out = sample(pts - sgn * k * nrm[:, :, None, :])
    contrast = np.median(np.linalg.norm(inn - out, axis=-1), axis=2) / e.spread
    # past each corner, does the side's edge run on? an object's edges end at its corners
    v = np.linspace(0.02, 0.07, 8)
    ext = lambda base, sgn_: base[:, :, None, :] + sgn_ * v[None, None, :, None] * side[:, :, None, :]
    def onl(q):
        return e.near[np.clip(np.round(q[..., 1]).astype(int), 0, h - 1), np.clip(np.round(q[..., 0]).astype(int), 0, w - 1)].mean(axis=2)
    runs = (onl(ext(c, -1)) >= P['run_on']) | (onl(ext(np.roll(c, -1, axis=1), 1)) >= P['run_on'])
    good = np.all(on >= P['side_on'], axis=1) & np.all(contrast >= P['contrast'], axis=1) & (runs.sum(axis=1) <= 1)
    idx = np.flatnonzero(good)
    order = idx[np.argsort(area[idx])]
    from matplotlib.path import Path
    kept = []
    for i in order:
        poly = Path(c[i])
        if any(Path(k_).contains_point(c[i].mean(0)) or poly.contains_point(k_.mean(0)) for k_ in kept): continue
        kept.append(c[i])
    return kept

def find(rgb, debug=None):
    H, W = rgb.shape[:2]; s = min(1.0, books.WORK / max(H, W))
    small = np.stack([ndi.zoom(rgb[..., k].astype(np.float32), s, order=1) if s < 1 else rgb[..., k].astype(np.float32) for k in range(3)], -1)
    g = ndi.gaussian_filter(books.grey(small), 1.0)
    out = []
    for c in find_covers(small, g):
        c = [[float(x) / s, float(y) / s] for x, y in c]
        out.append(dict(corners=c, view='cover'))
    return out
