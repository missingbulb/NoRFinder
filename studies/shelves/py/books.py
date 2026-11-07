"""Finding the books on a shelf photo, and straightening each one for reading.

A book is four corners in image pixels, clockwise from the one at the top left of the image, and a view: "spine"
(the narrow face) or "cover" (the book facing the camera). The finder (R2) works on the photo's own edges. Within each
shelf, a spine's sides are long straight edges, found at whatever angle they lean; between two of them, the book's own
top and foot are where its texture gives way to the plain wall or board, each snapped to the straight edge it ends on,
at whatever angle that runs. A box is kept only once it checks out as a readable spine (`spine`), and of the boxes kept,
the most that share no ground are the books. It boxes spines alone: a cover, or a pile of books lying flat, is not told
apart yet."""
import numpy as np
from scipy import ndimage as ndi

# scale-dependent: the long side the finder works at, in pixels; boxes are scaled back to the photo's own
WORK = 900
# [spine-lean] how far from upright a spine's edges may lean, in degrees, and the step the lean is searched in
LEAN, LEAN_STEP = 30, 0.5
# [spine-sides] how far apart, in degrees, a book's two sides may lean
SIDES = 6
# the share of the photo's height a shelf is looked at past its own top and bottom: a board seen slanted crosses rows
MARGIN = 0.08
# the edge detector's blur, in work pixels: enough to drop a JPEG's grain, little enough to keep a thin spine's sides
SIGMA = 2.0
# an edge piece shorter than this share of the shelf is lettering or grain, not a spine's side
PIECE = 0.04
# how many edges along a spine may lie between its two sides: its lettering's, when one was taken for a side
REACH = 6
# a book's face carries texture: a row of its strip is the book while its edges are this share of the strip's median,
# and a plain stretch shorter than this share of the shelf between them is still the book
FILL, GAP = 0.25, 0.15
# the share of a strip's width at either side its texture is not read on
INSET = 0.12
# [spine-shape] a box is a readable spine when: it is this many times as long as it is wide
ASPECT = 2.5
#   its sides lie on edges along this share of their length, and no edge between them does as much
SIDE_COVER, INSIDE = 0.4, 0.8
#   its ends change the strip's colour by this share of the shelf's brightness range, and an end is the first change out
#   from its texture this near the strongest
END_STEP, STEP_NEAR = 0.08, 0.6
#   past an end, at most this share of its strip is the book's own colour: within this share of the shelf's brightness
#   range of it
OWN_BEYOND, OWN = 0.3, 0.15
#   its long sides are of a length within this ratio, and its ends within this many degrees of square to them
SIDES_EQUAL, SQUARE = 0.75, 30
#   its inside has this share of the median verified box's edges: a wall, a board or a gap has next to none
TEXTURE = 0.5
#   it is longer than this share of its shelf, and wider than this share of the photo
LENGTH, MIN_WIDTH = 0.5, 0.008
# how far, as a share of the shelf's height, a book's end is looked for around where its texture stops
SNAP = 0.04
# [camera-uniform] the perspective is read from at least this many boxes; a box whose ends turn more than this many
# degrees otherwise than it has them turn there is dropped
SURE_MIN, PERSPECTIVE_TOL = 3, 15
# a perspective that disagrees with more than this share of the boxes it was read from is not the photo's
PERSPECTIVE_TRUST = 2 / 3
# and how far beyond it, as a share of the shelf's height, a plain end of the book is followed to the edge it ends on
REACH_OUT = 0.3


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


def long_pieces(m, frac):
    """The connected pieces of an edge map reaching frac of its height."""
    lab, n = ndi.label(m, np.ones((3, 3)))
    if not n:
        return m
    keep = np.array([False] + [s[0].stop - s[0].start >= frac * m.shape[0] for s in ndi.find_objects(lab)])
    return keep[lab]


class Edges:
    """A shelf's edges: every edge, the long ones running up it, how strongly its brightness changes, and its colour."""

    def __init__(self, g, rgb):
        from skimage.feature import canny
        # in colour: two books of one brightness and different colours still part where they touch. skimage's
        # thresholds are for brightness 0 to 1: at 0 to 255 a wall's grain clears them
        self.all = np.zeros(g.shape, bool)
        up = np.zeros(g.shape, bool)
        for k in range(3):
            c = ndi.gaussian_filter(rgb[..., k], 1.0) / 255
            edge = canny(c, sigma=SIGMA)
            self.all |= edge
            up |= edge & (np.abs(ndi.sobel(c, 1)) >= np.abs(ndi.sobel(c, 0)))
        self.up = long_pieces(up, PIECE)
        self.near = ndi.maximum_filter(self.all, 3)
        self.up_near = ndi.maximum_filter1d(self.up, 3, axis=1)
        self.grad = ndi.gaussian_gradient_magnitude(g, SIGMA)
        self.h, self.w = g.shape
        self.rgb = rgb
        self.spread = float(np.subtract(*np.percentile(g, [95, 5]))) or 1.0


def book_rows(e):
    """(top, bottom): the rows the books stand in, where edges running up cross the most columns, out to where they
    still cross a good share: the tops and feet of the tallest, lowest and most leaning books."""
    h = e.h
    dens = ndi.uniform_filter1d(e.up_near.mean(axis=1), max(3, h // 50))
    if dens.max() == 0:
        return None
    core, _ = ndi.label(dens >= 0.4 * dens.max())
    sizes = np.bincount(core.ravel())[1:]
    mid = np.flatnonzero(core == 1 + int(np.argmax(sizes)))
    out, _ = ndi.label(dens >= 0.12 * dens.max())
    ys = np.flatnonzero(out == out[mid[len(mid) // 2]])
    return int(ys[0]), int(ys[-1]) + 1


def side_lines(e, top, bottom):
    """[(x at the rows' middle, lean as tan)] of the straight edges running up the rows, left to right."""
    from skimage.transform import hough_line, hough_line_peaks
    h = bottom - top
    H, angles, dists = hough_line(e.up[top:bottom], theta=np.deg2rad(np.arange(-LEAN, LEAN + LEAN_STEP / 2, LEAN_STEP)))
    _, ang, dist = hough_line_peaks(H, angles, dists, min_distance=3, min_angle=2, threshold=0.2 * h, num_peaks=300)
    # skimage's line is x cos(a) + y sin(a) = d: at row y, x = (d - y sin a) / cos a
    return sorted(((d - (h / 2) * np.sin(a)) / np.cos(a), float(np.tan(a))) for d, a in zip(dist, ang))


class Line:
    """A straight edge running up the rows top..bottom: x at their middle and its lean as tan."""

    def __init__(self, xm, t, mid):
        self.xm, self.t, self.mid = xm, t, mid

    def x(self, y):
        return self.xm - self.t * (np.asarray(y, float) - self.mid)

    def toward(self, other, f):
        return Line((1 - f) * self.xm + f * other.xm, (1 - f) * self.t + f * other.t, self.mid)


def on_line(mask, line, y0, y1):
    """The share of rows y0..y1 the line has an edge on."""
    ys = np.arange(int(y0), int(y1))
    xs = np.round(line.x(ys)).astype(int)
    ok = (xs >= 0) & (xs < mask.shape[1]) & (ys >= 0) & (ys < mask.shape[0])
    return float(mask[ys[ok], xs[ok]].mean()) if ok.any() else 0.0


def extent(e, la, lb, top, bottom):
    """(first row, row after the last) the book between two lines fills: where its strip has the edges a book's face
    carries and the wall or board above and below it lacks."""
    h = bottom - top
    r = np.zeros(h)
    for k, y in enumerate(range(top, bottom)):
        a, b = max(int(np.floor(la.x(y))), 0), min(int(np.ceil(lb.x(y))) + 1, e.w)
        if b > a:
            r[k] = e.grad[y, a:b].mean()
    r = ndi.uniform_filter1d(r, max(3, h // 30))
    if not (r > 0).any():
        return None
    on = r >= FILL * np.median(r[r > 0])
    gap = max(3, int(GAP * h))
    on = ndi.binary_closing(np.pad(on, gap), np.ones(gap, bool))[gap:-gap]
    lab, n = ndi.label(on)
    if not n:
        return None
    ys = np.flatnonzero(lab == 1 + int(np.argmax(np.bincount(lab.ravel())[1:])))
    return top + int(ys[0]), top + int(ys[-1]) + 1


def end_edge(e, la, lb, y, out, win, limit, tilt, colour):
    """((y at la, y at lb), step): a book's end, from row y where its texture stops. Of the lines across its strip,
    from three windows inside that row (a board under a book carries texture of its own) to limit rows beyond it (out:
    -1 up, +1 down), each at a tilt of its own up to tilt rows across, it is the first, going outward, where the strip's
    colour changes by STEP_NEAR of the most it changes there and past which hardly any of the strip is the book's own
    colour: the board's and the wall's edges lie beyond the book's end, and past a row of its lettering most of the strip
    is still the book's. step is that change as a share of the shelf's brightness range."""
    u = np.linspace(0.15, 0.85, 12)
    shifts = np.arange(-3 * win, limit + 1)
    tilts = np.arange(-tilt, tilt + 1, 2)
    xl, xr = float(la.x(y)), float(lb.x(y))
    xs = xl + u * (xr - xl)
    # rows: [shift, tilt, sample]
    ys = y + out * shifts[:, None, None] + tilts[None, :, None] * (u[None, None, :] - 0.5)
    yi = np.clip(np.round(ys).astype(int), 0, e.h - 1)
    xi = np.clip(np.round(xs).astype(int), 0, e.w - 1)
    px = e.rgb[yi, xi[None, None, :]]
    prof = px.mean(axis=2)
    # how much of each line is the book's own colour
    own = (np.linalg.norm(px - colour, axis=-1) <= OWN * e.spread).mean(axis=2)
    k = max(2, win // 2)
    n = len(shifts)
    step = np.zeros((n, len(tilts)))
    c = np.cumsum(np.pad(prof, ((1, 0), (0, 0), (0, 0))), axis=0)
    o = np.cumsum(np.pad(own, ((1, 0), (0, 0))), axis=0)
    for i in range(k, n - k):
        inside, beyond = (c[i] - c[i - k]) / k, (c[i + 1 + k] - c[i + 1]) / k
        # past its end hardly any of the strip is the book's: past a row of its lettering, most still is
        step[i] = np.where((o[i + 1 + k] - o[i + 1]) / k <= OWN_BEYOND, np.linalg.norm(inside - beyond, axis=-1), 0)
    best = step.max(axis=1)
    if best.max() <= 0:
        return (y, y), 0.0
    peaks = [i for i in range(n) if best[i] >= STEP_NEAR * best.max() and best[i] >= best[max(0, i - 1)] and best[i] >= best[min(n - 1, i + 1)]]
    i = peaks[0]
    j = int(np.argmax(step[i]))
    dy = tilts[j]
    yc = y + out * shifts[i]
    return (int(round(yc - dy / 2)), int(round(yc + dy / 2))), float(best[i] / e.spread)


def book_colour(e, la, lb, y0, y1):
    """The colour most of the strip carries between y0 and y1: the book's own, its lettering aside."""
    px = [e.rgb[y, a:b] for y in range(int(y0), int(y1), 2)
          for a, b in [(int(np.ceil(la.x(y))) + 1, int(np.floor(lb.x(y))))] if b > a]
    return np.median(np.concatenate(px), axis=0) if px else np.zeros(3)


def spine_shaped(c):
    """[spine-shape] A convex quad, clockwise, its long sides of a length and its ends near square to them."""
    c = np.asarray(c, float)
    d = [c[(k + 1) % 4] - c[k] for k in range(4)]
    if min(d[k][0] * d[(k + 1) % 4][1] - d[k][1] * d[(k + 1) % 4][0] for k in range(4)) <= 0:
        return False
    right, left = np.hypot(*d[1]), np.hypot(*d[3])
    if min(left, right) < SIDES_EQUAL * max(left, right):
        return False
    for end, side in ((d[0], d[1]), (d[2], d[3])):
        cos = abs(np.dot(end, side)) / (np.hypot(*end) * np.hypot(*side))
        if np.degrees(np.arcsin(min(1.0, cos))) > SQUARE:
            return False
    return True


def texture(e, la, lb, y0, y1):
    tot = n = 0
    for y in range(int(y0), int(y1), 2):
        a, b = int(np.ceil(la.x(y))) + 2, int(np.floor(lb.x(y))) - 2
        if b > a:
            tot += e.all[y, a:b].sum()
            n += b - a
    return tot / n if n else 0.0


def slant(c, end):
    """How far, in degrees, an end of the box (0 its top, 1 its foot) turns from square to its sides."""
    c = np.asarray(c, float)
    side = (c[3] - c[0]) + (c[2] - c[1])
    edge = c[1] - c[0] if end == 0 else c[2] - c[3]
    square = np.arctan2(-side[0], side[1])
    d = np.arctan2(edge[1], edge[0]) - square
    return float(np.degrees((d + np.pi / 2) % np.pi - np.pi / 2))


def spine(e, lines, i, j, top, bottom):
    """The book between side lines i and j as {corners, texture, fit, steps}, or None when it does not check out as a
    readable spine."""
    la, lb = lines[i], lines[j]
    h = bottom - top
    if abs(np.degrees(np.arctan(la.t) - np.arctan(lb.t))) > SIDES:
        return None
    width = lb.xm - la.xm
    if width < MIN_WIDTH * e.w:
        return None
    # clear of its sides, which a taller neighbour's edge runs on above it
    whole = extent(e, la.toward(lb, INSET), lb.toward(la, INSET), top, bottom)
    if not whole or whole[1] - whole[0] < LENGTH * h:
        return None
    # the book's top and foot need not be level: each is where it ends, at the tilt that end runs, up to what a spine
    # turned LEAN from upright gives across its width
    win, limit = max(2, int(SNAP * h)), max(3, int(REACH_OUT * h))
    tilt = win + int(np.ceil(width * np.tan(np.deg2rad(LEAN))))
    colour = book_colour(e, la, lb, *whole)
    (tl, tr), top_step = end_edge(e, la, lb, whole[0], -1, win, limit, tilt, colour)
    (bl, br), foot_step = end_edge(e, la, lb, whole[1] - 1, 1, win, limit, tilt, colour)
    bl, br = bl + 1, br + 1
    corners = [(float(la.x(tl)), tl), (float(lb.x(tr)), tr), (float(lb.x(br)), br), (float(la.x(bl)), bl)]
    if min(top_step, foot_step) < END_STEP or min(bl - tl, br - tr) < ASPECT * width:
        return None
    sides_on = min(on_line(e.up_near, la, tl, bl), on_line(e.up_near, lb, tr, br))
    if sides_on < SIDE_COVER or not spine_shaped(corners):
        return None
    # two books are not one: no edge between its sides runs along it as its sides do
    y0, y1 = min(tl, tr), max(bl, br)
    if any(on_line(e.up_near, lines[k], y0, y1) >= max(SIDE_COVER, INSIDE * sides_on) for k in range(i + 1, j)
           if lines[k].xm - la.xm > INSET * width and lb.xm - lines[k].xm > INSET * width):
        return None
    return dict(corners=corners, texture=texture(e, la, lb, *whole), fit=sides_on, steps=min(top_step, foot_step))


def shelf_books(g, rgb):
    """Every pair of side lines on a shelf that checks out as a spine: {(i, j): spine}, and the lines."""
    e = Edges(g, rgb)
    rows = book_rows(e)
    if not rows:
        return {}, []
    top, bottom = rows
    lines = [Line(xm, t, (top + bottom) / 2) for xm, t in side_lines(e, top, bottom)]
    found = {}
    for i in range(len(lines)):
        for j in range(i + 1, min(len(lines), i + 1 + REACH)):
            b = spine(e, lines, i, j, top, bottom)
            if b:
                found[i, j] = b
    return found, lines


def most_books(found, n):
    """The (i, j) of the most boxes that share no ground, each line the right side of one book at most and the left of
    the next; of as many, the ones whose sides lie most on edges."""
    best = [(0.0, None)] * n
    for j in range(n):
        best[j] = (best[j - 1][0], ('skip', j - 1)) if j else (0.0, None)
        for i in range(max(0, j - REACH), j):
            if (i, j) in found and best[i][0] + 1 + 0.5 * found[i, j]['fit'] > best[j][0]:
                best[j] = (best[i][0] + 1 + 0.5 * found[i, j]['fit'], ('box', i))
    out, j = [], n - 1
    while j >= 0 and best[j][1]:
        kind, i = best[j][1]
        if kind == 'box':
            out.append((i, j))
        j = i
    return out[::-1]


def perspective(boxes):
    """[camera-uniform] The photo's perspective, from the boxes found surest (their sides and their ends both on edges as
    much as the median box's or more): per end (top, foot), how its turn from
    square to the sides varies across the photo, a plane over x and y fitted to them; None while too few are sure."""
    if len(boxes) < SURE_MIN:
        return None
    fit, steps = (np.median([b[k] for _, b in boxes]) for k in ('fit', 'steps'))
    sure = [c for c, b in boxes if b['fit'] >= fit and b['steps'] >= steps]
    if len(sure) < SURE_MIN:
        return None
    X = np.array([[1, *np.mean(c, axis=0)] for c in sure])
    fits = []
    for end in (0, 1):
        y = np.array([slant(c, end) for c in sure])
        coef = np.linalg.lstsq(X, y, rcond=None)[0]
        # once more without the surest boxes that still disagree most
        r = np.abs(X @ coef - y)
        keep = r <= max(PERSPECTIVE_TOL, np.median(r) * 2)
        if keep.sum() >= SURE_MIN:
            coef = np.linalg.lstsq(X[keep], y[keep], rcond=None)[0]
        fits.append(coef)
    return fits


def agrees(c, fits):
    """Whether a box's top and foot turn as the photo's perspective has every end there turn."""
    p = np.array([1, *np.mean(c, axis=0)])
    return all(abs(slant(c, end) - p @ fits[end]) <= PERSPECTIVE_TOL for end in (0, 1))


def find(rgb):
    """The books in an RGB photo, [{corners, view}], in reading order: shelf by shelf from the top, left to right."""
    H, W = rgb.shape[:2]
    s = min(1.0, WORK / max(H, W))
    small = np.stack([ndi.zoom(rgb[..., k].astype(np.float32), s, order=1) if s < 1 else rgb[..., k].astype(np.float32) for k in range(3)], -1)
    g = ndi.gaussian_filter(grey(small), 1.0)
    # each shelf with a margin: a book standing on its board ends past the board's edge
    m = int(MARGIN * g.shape[0])
    per_shelf = [(max(0, top - m), *shelf_books(g[max(0, top - m):bottom + m], small[max(0, top - m):bottom + m]))
                 for top, bottom in shelves(g)]
    textures = [b['texture'] for _, found, _ in per_shelf for b in found.values()]
    if not textures:
        return []
    least = TEXTURE * float(np.median(textures))
    per_shelf = [(top, {k: b for k, b in found.items() if b['texture'] >= least}, lines) for top, found, lines in per_shelf]
    at = lambda top, c: [(x, y + top) for x, y in c]
    # [camera-uniform] one camera took the whole photo: the books first chosen, the surest of them, say how it looked at
    # the shelves, and a box whose ends turn otherwise is not a book's
    first = [(at(top, found[k]['corners']), found[k]) for top, found, lines in per_shelf for k in most_books(found, len(lines))]
    fits = perspective(first)
    if fits is not None and np.mean([agrees(c, fits) for c, _ in first]) >= PERSPECTIVE_TRUST:
        per_shelf = [(top, {k: b for k, b in found.items() if agrees(at(top, b['corners']), fits)}, lines) for top, found, lines in per_shelf]
    out = []
    for top, found, lines in per_shelf:
        for k in most_books(found, len(lines)):
            c = [[min(max(x, 0), g.shape[1]) / s, min(max(y + top, 0), g.shape[0]) / s] for x, y in found[k]['corners']]
            out.append(dict(corners=[[round(x, 1), round(y, 1)] for x, y in c], view='spine'))
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
