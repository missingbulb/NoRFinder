"""Finding the books on a shelf photo, and straightening each one for reading.

A book is four corners in image pixels, clockwise from the one at the top left of the image, and a view: "spine"
(the narrow face) or "cover" (the book facing the camera). The finder (R1) works on the photo's own edges: the shelves
are the long horizontal edges that cross the photo; within each shelf, the edges between spines are straight lines,
found at whatever angle they lean, and each book is the strip between two neighbouring lines, from the shelf's top to
its bottom. It boxes spines alone: a cover, or a pile of books lying flat, is not told apart yet."""
import numpy as np
from scipy import ndimage as ndi

# scale-dependent: the long side the finder works at, in pixels; boxes are scaled back to the photo's own
WORK = 900
# [spine-lean] how far from upright a spine's edges may lean, in degrees, and the step the lean is searched in
LEAN, LEAN_STEP = 30, 0.5
# [spine-sides] how far apart, in degrees, a book's two sides may lean
SIDES = 6


def grey(rgb):
    return rgb[..., :3].astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)


def shelves(g):
    """[(top, bottom)]: the shelves, between rows a horizontal edge crosses at least half the photo on."""
    h = g.shape[0]
    gx, gy = np.abs(ndi.sobel(g, 1)), np.abs(ndi.sobel(g, 0))
    vy = np.where(gy > 2 * gx, gy, 0)
    across = ndi.uniform_filter1d(ndi.maximum_filter1d(vy > np.quantile(vy, 0.9), 5, axis=0).mean(axis=1), 3)
    reach = max(1, h // 15)
    rows = [r for r in range(h // 20, h - h // 20) if across[r] >= 0.5 and across[r] == across[max(0, r - reach):r + reach].max()]
    cuts = [0, *rows, h]
    return [(a, b) for a, b in zip(cuts, cuts[1:]) if b - a > h // 6]


def edge_lines(band):
    """[(x at the band's middle, lean as tan)] of the straight edges running up a band, left to right."""
    from skimage.feature import canny
    from skimage.transform import hough_line, hough_line_peaks
    h, w = band.shape
    gx, gy = ndi.sobel(band, 1), ndi.sobel(band, 0)
    # edges that run up the band: the brightness changes across it, not along it
    on = canny(band, sigma=1.5) & (np.abs(gx) > 1.5 * np.abs(gy))
    H, angles, dists = hough_line(on, theta=np.deg2rad(np.arange(-LEAN, LEAN + LEAN_STEP / 2, LEAN_STEP)))
    # a line has a quarter of the band's height on it, and stands 4 px and 3 degrees clear of a stronger one
    _, ang, dist = hough_line_peaks(H, angles, dists, min_distance=4, min_angle=3, threshold=0.25 * h, num_peaks=200)
    # skimage's line is x cos(a) + y sin(a) = d: at row y, x = (d - y sin a) / cos a
    return sorted(((d - (h / 2) * np.sin(a)) / np.cos(a), float(np.tan(a))) for d, a in zip(dist, ang))


def find(rgb):
    """The books in an RGB photo, [{corners, view}], in reading order: shelf by shelf from the top, left to right."""
    H, W = rgb.shape[:2]
    s = min(1.0, WORK / max(H, W))
    g = ndi.zoom(grey(rgb), s, order=1) if s < 1 else grey(rgb)
    g = ndi.gaussian_filter(g, 1.0)
    w = g.shape[1]
    out = []
    for top, bottom in shelves(g):
        h = bottom - top
        lines = edge_lines(g[top:bottom])
        for (xa, ta), (xb, tb) in zip(lines, lines[1:]):
            # a strip narrower than this is two edges of one spine's lettering or rim, not a book
            if xb - xa < 0.008 * w:
                continue
            # [spine-sides] a book's two sides run near parallel; a wedge between a leaning book and an upright one is the
            # gap beside them
            if abs(np.degrees(np.arctan(ta) - np.arctan(tb))) > SIDES:
                continue
            x_at = lambda xm, t, y: xm - t * (y - h / 2)
            clip = lambda x: min(max(x, 0), w)
            corners = [[clip(x_at(xa, ta, 0)), top], [clip(x_at(xb, tb, 0)), top], [clip(x_at(xb, tb, h)), bottom], [clip(x_at(xa, ta, h)), bottom]]
            out.append(dict(corners=[[round(x / s, 1), round(y / s, 1)] for x, y in corners], view='spine'))
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
