"""Invariance test inputs: a photo and its ground truth warped by a rotation or a perspective tilt, as a camera turned or
tipped would have taken it. For each transform, OUTDIR gets `<name>.png` (the warped photo, lossless) and `<name>.json`
(the ground truth with every book's corners mapped through the same homography, the other fields kept, corners clockwise
from the top-left corner as the finder writes them).

    python3 studies/shelves/lab/warp.py PHOTO GT.json OUTDIR --rotate DEG ... --tilt FRAC ... --vtilt FRAC ...

--rotate DEG   turn the photo DEG degrees clockwise on screen (0 = no warp: the same PNG path, for a baseline).
--tilt FRAC    the right edge farther from the camera: its height scaled by (1 - FRAC) about the middle and its width
               shortened by FRAC/2 (a negative FRAC is the left edge farther, i.e. the right nearer).
--vtilt FRAC   the same with the top edge farther.
--crop       instead of the padded canvas, the largest axis-aligned rectangle inscribed in the warped photo (no black);
               the ground truth keeps only the books wholly inside it (verdict-blind: all entries). Names get a `c` suffix.
Names: r<deg>, t<frac>, v<frac> (e.g. r-10, t0.3, t-0.15, v0.2).

The canvas grows to hold the whole warped photo, nothing cropped; what the photo does not cover is black, not edge-
replicated: replication would draw streaks of fake spine-like texture the finder could read as books, black is an
obvious non-content area like the border of a real wide photo. Sampling is bilinear (scipy map_coordinates, pull mapping
through the inverse homography).
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'py'))
from books import clockwise, homography
from shelves import load


def rotation(deg, w, h):
    t = np.radians(deg)
    c, s = np.cos(t), np.sin(t)
    ctr = np.array([[1, 0, w / 2], [0, 1, h / 2], [0, 0, 1]])
    return ctr @ np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]]) @ np.linalg.inv(ctr)


def tilt(frac, w, h):
    """Right edge farther (frac > 0) or nearer (frac < 0): left edge fixed."""
    f = abs(frac)
    far = [(w * (1 - f / 2), h * f / 2), (w * (1 - f / 2), h * (1 - f / 2))]
    src = [(0, 0), (0, h), (w, 0), (w, h)]
    if frac >= 0:
        return homography(src, [(0, 0), (0, h), far[0], far[1]])
    # nearer on the right: the left edge is the farther one, the right edge fixed
    return homography(src, [(w * f / 2, h * f / 2), (w * f / 2, h * (1 - f / 2)), (w, 0), (w, h)])


def vtilt(frac, w, h):
    far = [(w * frac / 2, h * frac / 2), (w * (1 - frac / 2), h * frac / 2)]
    # top farther: the top edge shrinks about its middle and sinks by FRAC/2 of the height
    src = [(0, 0), (w, 0), (0, h), (w, h)]
    return homography(src, [far[0], far[1], (0, h), (w, h)])


def apply(m, pts):
    p = np.c_[np.asarray(pts, float), np.ones(len(pts))] @ m.T
    return p[:, :2] / p[:, 2:3]


def warp(img, m):
    """(warped uint8 array, the homography with the canvas shift folded in, the mask of pixels the photo covers)."""
    h, w = img.shape[:2]
    box = apply(m, [(0, 0), (w, 0), (w, h), (0, h)])
    lo, hi = box.min(0), box.max(0)
    size = np.ceil(np.round(hi - lo, 6)).astype(int)
    shift = np.array([[1, 0, -lo[0]], [0, 1, -lo[1]], [0, 0, 1]])
    m = shift @ m
    inv = np.linalg.inv(m)
    W, H = int(size[0]), int(size[1])
    out = np.zeros((H, W, img.shape[2]), np.uint8)
    valid = np.zeros((H, W), bool)
    xs = np.arange(W, dtype=np.float64)
    for y0 in range(0, H, 256):
        ys = np.arange(y0, min(H, y0 + 256), dtype=np.float64)
        gx, gy = np.meshgrid(xs, ys)
        d = inv[2, 0] * gx + inv[2, 1] * gy + inv[2, 2]
        sx = (inv[0, 0] * gx + inv[0, 1] * gy + inv[0, 2]) / d
        sy = (inv[1, 0] * gx + inv[1, 1] * gy + inv[1, 2]) / d
        valid[y0:y0 + len(ys), :] = (d > 0) & (sx >= 0) & (sx <= w - 1) & (sy >= 0) & (sy <= h - 1)
        for c in range(img.shape[2]):
            out[y0:y0 + len(ys), :, c] = np.clip(np.rint(ndi.map_coordinates(img[..., c], [sy, sx], order=1, mode='constant', cval=0)), 0, 255)
    return out, m, valid


def inscribed(valid, step=4):
    """(x0, y0, x1, y1): the largest axis-aligned rectangle inside the mask, found on a mask thinned by STEP."""
    v = valid[::step, ::step]
    best, rect = 0, (0, 0, 0, 0)
    up = np.zeros(v.shape[1], int)
    for y, row in enumerate(v):
        up = np.where(row, up + 1, 0)
        stack = []
        for x in range(len(up) + 1):
            hgt = up[x] if x < len(up) else 0
            start = x
            while stack and stack[-1][1] >= hgt:
                s0, h0 = stack.pop()
                if h0 * (x - s0) > best:
                    best, rect = h0 * (x - s0), (s0, y - h0 + 1, x, y + 1)
                start = s0
            stack.append((start, hgt))
    return tuple(int(c * step) for c in rect)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('photo')
    ap.add_argument('gt')
    ap.add_argument('outdir')
    ap.add_argument('--rotate', type=float, nargs='*', default=[])
    ap.add_argument('--tilt', type=float, nargs='*', default=[])
    ap.add_argument('--crop', action='store_true')
    ap.add_argument('--vtilt', type=float, nargs='*', default=[])
    a = ap.parse_args(argv)
    os.makedirs(a.outdir, exist_ok=True)
    img = load(a.photo)
    h, w = img.shape[:2]
    gt = json.load(open(a.gt))
    jobs = [(f'r{d:g}', rotation(d, w, h)) for d in a.rotate] + [(f't{f:g}', tilt(f, w, h)) for f in a.tilt] + [(f'v{f:g}', vtilt(f, w, h)) for f in a.vtilt]
    for name, m in jobs:
        out, m, valid = warp(img, m)
        if a.crop:
            x0, y0, x1, y1 = inscribed(valid)
            out, name = out[y0:y1, x0:x1], name + 'c'
            m = np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]]) @ m
        Image.fromarray(out).save(os.path.join(a.outdir, name + '.png'))
        g = json.loads(json.dumps(gt))
        g['W'], g['H'] = out.shape[1], out.shape[0]
        if a.crop:
            inside = lambda p: all(0 <= x <= out.shape[1] and 0 <= y <= out.shape[0] for x, y in apply(m, p))
            g['books'] = [b for b in g['books'] if 'corners' not in b or inside(b['corners'])]
        for b in g['books']:
            if 'corners' in b:
                b['corners'] = [[round(float(x), 2), round(float(y), 2)] for x, y in clockwise(apply(m, b['corners']))]
            if 'proposed' in b and 'corners' in b['proposed']:
                b['proposed']['corners'] = [[round(float(x), 2), round(float(y), 2)] for x, y in clockwise(apply(m, b['proposed']['corners']))]
        g['image'] = name + '.png'
        json.dump(g, open(os.path.join(a.outdir, name + '.json'), 'w'))
        print(name, out.shape[1], out.shape[0])


if __name__ == '__main__':
    main()
