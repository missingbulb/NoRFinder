"""Finding the books on a shelf photo, and straightening each one for reading.

A book is four corners in image pixels, clockwise from the one at the top left of the image, and a view: "spine"
(the narrow face, standing or lying) or "cover" (the book facing the camera). v0 of the finder works on the photo's
own edges: the shelves are the long horizontal edges that cross the photo, and within each shelf a book ends where
a vertical edge runs the shelf's height. Where a shelf's stretch has no such edges but horizontal ones, the books
lie flat in a pile; a stretch about as wide as it is tall, with few edges inside, is a cover."""
import numpy as np
from scipy import ndimage as ndi

# scale-dependent: the long side the finder works at, in pixels; boxes are scaled back to the photo's own
WORK = 900


def grey(rgb):
    return rgb[..., :3].astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)


def peaks(profile, min_gap, rise):
    """The indices where profile has a local maximum standing rise above its own median, at least min_gap apart,
    strongest first kept."""
    p = ndi.uniform_filter1d(profile.astype(np.float64), 3)
    floor = np.median(p)
    cand = [i for i in range(1, len(p) - 1) if p[i] >= p[i - 1] and p[i] >= p[i + 1] and p[i] - floor > rise]
    kept = []
    for i in sorted(cand, key=lambda i: -p[i]):
        if all(abs(i - k) >= min_gap for k in kept):
            kept.append(i)
    return sorted(kept)


def cuts(profile, length, min_gap):
    """Where a stretch of length pixels is cut, ends included, by the profile's peaks; rise from its own spread."""
    rise = 1.5 * np.std(profile) if len(profile) else 0
    inner = [i for i in peaks(profile, min_gap, rise) if min_gap <= i <= length - min_gap]
    return [0, *inner, length]


def find(rgb):
    """The books in an RGB photo, [{corners, view}], in reading order: shelf by shelf from the top, left to right."""
    H, W = rgb.shape[:2]
    s = min(1.0, WORK / max(H, W))
    g = ndi.zoom(grey(rgb), s, order=1) if s < 1 else grey(rgb)
    h, w = g.shape
    g = ndi.gaussian_filter(g, 1.0)
    gx, gy = np.abs(ndi.sobel(g, axis=1)), np.abs(ndi.sobel(g, axis=0))
    # an edge counts toward a line only where it beats the other direction: texture inside a book has both
    vx, vy = np.where(gx > 2 * gy, gx, 0), np.where(gy > 2 * gx, gy, 0)
    # the shelves: rows a horizontal edge crosses most of the photo on, not the tops of books that happen to line up
    strong = vy > np.quantile(vy, 0.9)
    across = ndi.maximum_filter1d(strong, 5, axis=0).mean(axis=1)
    rows = [0, *[r for r in peaks(across, max(8, h // 12), 0) if across[r] >= 0.6 and h // 20 <= r <= h - h // 20], h]
    books = []
    for top, bottom in zip(rows, rows[1:]):
        band = bottom - top
        if band < h // 15:
            continue
        cols = cuts(vx[top:bottom].mean(axis=0), w, max(4, band // 12))
        for left, right in zip(cols, cols[1:]):
            span = right - left
            if span < 3:
                continue
            inside_x = vx[top:bottom, left + 1:right - 1].mean() if span > 2 else 0
            inside_y = vy[top:bottom, left:right].mean()
            if span > 0.6 * band and inside_y > 1.5 * inside_x:
                # a pile: books lying flat, cut where horizontal edges cross the stretch
                sub = cuts(vy[top:bottom, left:right].mean(axis=1), band, max(3, band // 15))
                books += [dict(box=(left, top + a, right, top + b), view='spine') for a, b in zip(sub, sub[1:]) if b - a >= 3]
            else:
                # a standing book ends at its own top: the strongest horizontal edge across its stretch, above its middle
                upper = vy[top:top + band // 2, left:right].mean(axis=1)
                head = top + int(np.argmax(upper)) if upper.size and upper.max() > 2 * np.median(upper) else top
                if bottom - head < band // 6:
                    continue
                view = 'cover' if 0.5 * (bottom - head) <= span <= 1.6 * (bottom - head) else 'spine'
                books.append(dict(box=(left, head, right, bottom), view=view))
    out = []
    for b in books:
        x0, y0, x1, y1 = (v / s for v in b['box'])
        out.append(dict(corners=[[round(x0, 1), round(y0, 1)], [round(x1, 1), round(y0, 1)], [round(x1, 1), round(y1, 1)], [round(x0, 1), round(y1, 1)]],
                        view=b['view']))
    return out


def homography(src, dst):
    """The 3×3 matrix taking each of the four points src to its dst."""
    A = []
    for (x, y), (u, v) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y, -v])
    _, _, vt = np.linalg.svd(np.asarray(A, np.float64))
    M = vt[-1].reshape(3, 3)
    return M / M[2, 2]


def straighten(rgb, corners):
    """The book's four corners as an upright rectangle, RGBA, as wide as its top and bottom edges and as tall as its
    sides, on average; the first corner at the top left."""
    c = np.asarray(corners, np.float64)
    side = lambda a, b: float(np.hypot(*(c[a] - c[b])))
    w = max(1, round((side(0, 1) + side(3, 2)) / 2))
    h = max(1, round((side(0, 3) + side(1, 2)) / 2))
    # pulled: each crop pixel's centre sampled where it falls in the photo
    M = homography([[0, 0], [w, 0], [w, h], [0, h]], c)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64) + 0.5
    p = M @ np.stack([xx.ravel(), yy.ravel(), np.ones(xx.size)])
    X, Y = p[0] / p[2] - 0.5, p[1] / p[2] - 0.5
    out = np.empty((h, w, 4), np.uint8)
    for k in range(3):
        out[..., k] = np.clip(ndi.map_coordinates(rgb[..., k].astype(np.float32), [Y, X], order=1, mode='nearest'), 0, 255).round().reshape(h, w)
    out[..., 3] = 255
    return out
