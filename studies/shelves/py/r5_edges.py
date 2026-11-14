"""The Bookshelf Reader's R5 finder, kept as it was (2026-11-07) beside the current one (books.py): the books found
from the photo's own edges alone, with no text finder, and a box whose ends turn otherwise than the camera saw the
shelves dropped. Its straightening is books.py's; this module only finds."""
import numpy as np
from scipy import ndimage as ndi
from skimage.measure import points_in_poly

from books import straighten

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
# a book lies between two neighbouring edges between books: none lies between its sides
REACH = 1
# the edges between books, after Osef's spine segmentation (yoavberliner/Osef, 2026-09-25): an unblurred upright
# gradient over this, and this many times the across one, on a strict pass and on a relaxed one inside a wide gap
SEAM_STRICT, SEAM_RELAXED = (40, 1.5), (25, 1.0)
# a line is an edge between books when it lies on one along this share of the rows nearly every book crosses, the rows
# where the mean upright gradient is this share of its strongest's
BOUNDARY, CORE = 0.8, 0.35
# a gap this many times the shelf's usual spine is searched again on the relaxed pass, and a box this many times as
# wide is looked at for two books of one series
WIDE = 1.8
# [series-seam] two books of one series: a box holding this many bright marks that recur at the same height (within this
# share of its height), all one shift across, within this share of its width of each other, and the shift this share of
# its width. A mark: brighter than its surroundings by this share of the box's own brightness range, no smaller than
# this share of the box, and laid over its repeat, overlapping it this much. Calibrated on one photo's pair (17 marks
# against at most 4 in the 50 single books of three photos)
REPEATS, SPLIT_SLIP, SPLIT_AGREE, SPLIT_RANGE = 8, 0.04, 0.04, (0.3, 0.7)
MARK_BRIGHT, MARK_SIZE, MARK_ALIKE = 0.25, 0.0005, 0.6
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
# and how far, in degrees, from square to its sides it is looked for at: the camera's angle on it
END_TURN = 12
# [barcode] a shelf is several books packed together: one whose spines number fewer than this is no shelf
SHELF_BOOKS = 3
# [barcode] books standing packed look like a barcode: a band whose edges between books stand apart by at most this share
# of its height (the owner's shelves: 0.09-0.15; three covers drawn on a bench: 0.24; the owner's covers, walls
# above books and strips under boards: 0.49 and up) is a
# shelf, whether or not its spines were boxed, and no cover is looked for in it
BARCODE_GAP = 0.2
# and a band is looked at only when at least this share of the photo's height
BAND_LEAST = 0.1
# [cover-shape] covers: straight edge segments at least this share of the photo long, at most this many lines; a cover's
# two pairs of sides within this many degrees of parallel and at least this many degrees apart; its area this share of
# the photo, its long sides at most this many times its short; each side on edges along this share of it, with a colour
# change across it of this share of the brightness range, and its edge running on past a corner when this much of the
# way past it lies on edges
SEGMENT, COVER_LINES, COVER_PARALLEL, COVER_CROSS = 0.05, 70, 20, 40
COVER_AREA, COVER_ASPECT, COVER_ON, COVER_CONTRAST, COVER_SIDE = (0.01, 0.6), 2.6, 0.7, 0.12, 0.6
# [camera-uniform] the perspective is read from at least this many boxes; a box whose ends turn more than this many
# degrees otherwise than it has them turn there is dropped
SURE_MIN, PERSPECTIVE_TOL = 4, 15
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
        self.gray = grey(rgb)
        self.seam = seams(self.gray, True)
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


def seams(gray, strict):
    """Where a near-upright edge is, from the unblurred gradient, a pixel of slack either side: the dark seam between
    two black spines of one series is a pixel or two wide, and a blur takes it away."""
    gx, gy = np.abs(ndi.sobel(gray, 1)), np.abs(ndi.sobel(gray, 0))
    least, dominance = SEAM_STRICT if strict else SEAM_RELAXED
    on = (gx > least) & (gx > dominance * gy)
    return ndi.maximum_filter1d(on, 3, axis=1)


def core_rows(gray):
    """(top, bottom): the rows nearly every book crosses, where the mean upright gradient is CORE of its strongest's."""
    r = np.abs(ndi.sobel(gray, 1)).mean(axis=1)
    on = np.flatnonzero(r >= CORE * r.max()) if r.max() > 0 else []
    return (int(on[0]), int(on[-1]) + 1) if len(on) else None


def side_lines(e, top, bottom):
    """[(x at the rows' middle, lean as tan)] of the edges between books, left to right: lines that lie on a seam
    along BOUNDARY of the rows nearly every book crosses, at leans up to LEAN, kept strongest first and none crossing
    one already kept or close to it along its length, since two books' edges never cross; a gap far wider than the
    shelf's usual spine is searched again with a lower bar, for the one weak edge, a pale book against a pale wall. A
    spine's lettering runs along part of its length, a gap between two books along all of it."""
    core = core_rows(e.gray[top:bottom])
    if not core:
        return []
    c0, c1 = top + core[0], top + core[1]
    yc, mid = (c0 + c1) / 2, (top + bottom) / 2
    ys = np.arange(c0, c1)
    tans = np.tan(np.deg2rad(np.arange(-LEAN, LEAN + LEAN_STEP / 2, LEAN_STEP)))
    gap = MIN_WIDTH * 2 * e.w

    def scan(x0s, strict):
        on = seams(e.gray, strict)
        found = []
        for x0 in x0s:
            xs = np.round(x0 + (ys[None] - yc) * tans[:, None]).astype(int)
            ok = (xs >= 0) & (xs < e.w)
            cover = np.where(ok, on[ys[None], np.clip(xs, 0, e.w - 1)], False).mean(axis=1)
            k = int(np.argmax(cover))
            if cover[k] >= BOUNDARY:
                found.append((float(cover[k]), float(x0), float(tans[k])))
        return found

    def keep(found, kept):
        at = lambda x, t, y: x + (y - yc) * t
        kept = list(kept)
        for f in sorted(found, reverse=True):
            _, x, t = f
            # two books leaning apart touch at one end and leave a wedge at the other: a line is crowding only when it
            # is close to a kept one at both ends
            if all((abs(at(x, t, c0) - at(kx, kt, c0)) >= gap or abs(at(x, t, c1) - at(kx, kt, c1)) >= gap)
                   and np.sign(at(x, t, c0) - at(kx, kt, c0)) == np.sign(at(x, t, c1) - at(kx, kt, c1)) for _, kx, kt in kept):
                kept.append(f)
        return sorted(kept, key=lambda f: f[1])

    kept = keep(scan(range(1, e.w - 1), True), [])
    spans = np.diff([x for _, x, _ in kept])
    if len(spans):
        usual = float(np.median(spans))
        for (_, xa, _), (_, xb, _) in zip(list(kept), list(kept)[1:]):
            if xb - xa > WIDE * usual:
                kept = keep(scan(range(int(xa + gap), int(xb - gap)), False), kept)
    # in this module's terms: x at the rows' middle, and the lean as x falling going down
    return [(x + (mid - yc) * t, -t) for _, x, t in kept]


class Line:
    """A straight edge running up the rows top..bottom: x at their middle and its lean as tan."""

    def __init__(self, xm, t, mid, seen=True):
        self.xm, self.t, self.mid = xm, t, mid
        # False for the edge between two books of one series, found by their repeating design and not on the photo
        self.seen = seen

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
    -1 up, +1 down), each square to its sides give or take tilt rows across, it is the first, going outward, where the strip's
    colour changes by END_STEP of the shelf's brightness range (a foot: by STEP_NEAR of the most it changes there) and past which hardly any of the strip is the book's own
    colour: the board's and the wall's edges lie beyond the book's end, and past a row of its lettering most of the strip
    is still the book's. step is that change as a share of the shelf's brightness range."""
    u = np.linspace(0.15, 0.85, 12)
    shifts = np.arange(-3 * win, limit + 1)
    # square to the book's sides, give or take tilt: a leaning book's top leans with it
    tilts = (la.t + lb.t) / 2 * (lb.xm - la.xm) + np.arange(-tilt, tilt + 1, 2)
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
    # a top: the first change sharp enough to be an end at all, since a book's top against the shadow under the board
    # above is softer than the shadow's own edge against that board, beyond it. A foot stands on its board, with no
    # such edge beyond it, and a logo or label near it changes the strip as sharply: the first near the strongest
    least = END_STEP * e.spread if out < 0 else STEP_NEAR * best.max()
    peaks = [i for i in range(n) if best[i] >= least and best[i] >= best[max(0, i - 1)] and best[i] >= best[min(n - 1, i + 1)]]
    i = peaks[0] if peaks else int(np.argmax(best))
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
    # the book's top and foot need not be level: each is where it ends, square to its sides give or take what a camera
    # looking at it END_TURN off square gives across its width
    win, limit = max(2, int(SNAP * h)), max(3, int(REACH_OUT * h))
    tilt = 2 + int(np.ceil(width * np.tan(np.deg2rad(END_TURN))))
    colour = book_colour(e, la, lb, *whole)
    (tl, tr), top_step = end_edge(e, la, lb, whole[0], -1, win, limit, tilt, colour)
    (bl, br), foot_step = end_edge(e, la, lb, whole[1] - 1, 1, win, limit, tilt, colour)
    bl, br = bl + 1, br + 1
    corners = [(float(la.x(tl)), tl), (float(lb.x(tr)), tr), (float(lb.x(br)), br), (float(la.x(bl)), bl)]
    if min(top_step, foot_step) < END_STEP or min(bl - tl, br - tr) < ASPECT * width:
        return None
    # a side between two books of one series has no edge to lie on: the other side must
    sides_on = min([on_line(e.seam, la, tl, bl)] * la.seen + [on_line(e.seam, lb, tr, br)] * lb.seen or [0.0])
    if sides_on < SIDE_COVER or not spine_shaped(corners):
        return None
    # two books are not one: no edge between its sides runs along it as its sides do
    y0, y1 = min(tl, tr), max(bl, br)
    if any(on_line(e.seam, lines[k], y0, y1) >= max(SIDE_COVER, INSIDE * sides_on) for k in range(i + 1, j)
           if lines[k].xm - la.xm > INSET * width and lb.xm - lines[k].xm > INSET * width):
        return None
    return dict(corners=corners, texture=texture(e, la, lb, *whole), fit=sides_on, steps=min(top_step, foot_step))


def bright_marks(crop):
    """The bright marks on an upright book crop (its lettering, a logo): [(y, x, mask)], each a component brighter
    than its surroundings, not a sliver and not a band across the book."""
    g = grey(crop).astype(np.float64)
    h, w = g.shape
    bg = ndi.median_filter(g, size=(max(3, h // 15), max(3, w // 3)))
    on = g - bg > MARK_BRIGHT * max(1.0, float(np.subtract(*np.percentile(g, [99, 1]))))
    lab, _ = ndi.label(on)
    out = []
    for k, sl in enumerate(ndi.find_objects(lab)):
        m = lab[sl] == k + 1
        if m.sum() < MARK_SIZE * h * w or m.shape[0] > 0.3 * h or m.shape[1] > 0.45 * w:
            continue
        out.append(((sl[0].start + sl[0].stop) / 2, (sl[1].start + sl[1].stop) / 2, m))
    return out


def alike(a, b):
    """Two marks of one shape and size: their masks, laid over each other, overlap mostly."""
    (ha, wa), (hb, wb) = a.shape, b.shape
    if abs(ha - hb) > 0.25 * max(ha, hb) or abs(wa - wb) > 0.25 * max(wa, wb):
        return False
    pa, pb = np.zeros((max(ha, hb), max(wa, wb)), bool), np.zeros((max(ha, hb), max(wa, wb)), bool)
    pa[:ha, :wa], pb[:hb, :wb] = a, b
    return (pa & pb).sum() >= MARK_ALIKE * (pa | pb).sum()


def series_split(crop):
    """[series-seam] Where across a box (a share of its width) a second book of one series begins, or None: two such
    books repeat one design, so the box holds marks that recur at the same height, all one shift further across. The
    shift is the first book's width."""
    h, w = crop.shape[:2]
    marks = bright_marks(crop)
    shifts = np.array([(xb - xa) / w for ya, xa, ma in marks for yb, xb, mb in marks
                       if SPLIT_RANGE[0] <= (xb - xa) / w <= SPLIT_RANGE[1] and abs(yb - ya) <= SPLIT_SLIP * h and alike(ma, mb)])
    if not len(shifts):
        return None
    near = lambda f: int((np.abs(shifts - f) <= SPLIT_AGREE).sum())
    best = max(shifts, key=near)
    return float(np.median(shifts[np.abs(shifts - best) <= SPLIT_AGREE])) if near(best) >= REPEATS else None


def shelf_books(g, rgb):
    """Every pair of neighbouring side lines on a shelf that checks out as a spine: {(i, j): spine}, the lines, and the
    rows the books stand in (None when there are none). A
    box far wider than the shelf's usual one whose marks repeat further across is two books of one series: a line goes
    between them, and each is checked as any book is."""
    e = Edges(g, rgb)
    rows = book_rows(e)
    if not rows:
        return {}, [], None
    top, bottom = rows
    lines = [Line(xm, t, (top + bottom) / 2) for xm, t in side_lines(e, top, bottom)]

    def all_found():
        found = {}
        for i in range(len(lines)):
            for j in range(i + 1, min(len(lines), i + 1 + REACH)):
                b = spine(e, lines, i, j, top, bottom)
                if b:
                    found[i, j] = b
        return found

    found = all_found()
    widths = {k: lines[k[1]].xm - lines[k[0]].xm for k in found}
    if widths:
        usual = float(np.median(list(widths.values())))
        new = []
        for (i, j), b in found.items():
            if widths[i, j] > WIDE * usual:
                f = series_split(straighten(rgb, b['corners'])[..., :3])
                if f is not None:
                    cut = lines[i].toward(lines[j], f)
                    cut.seen = False
                    new.append(cut)
        if new:
            lines = sorted(lines + new, key=lambda l: l.xm)
            found = all_found()
    return found, lines, rows


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
    square to the sides varies across the photo, a line over x fitted to them (along a shelf the camera's angle on
    each book changes with where it stands); None while too few are sure."""
    if len(boxes) < SURE_MIN:
        return None
    fit, steps = (np.median([b[k] for _, b in boxes]) for k in ('fit', 'steps'))
    sure = [c for c, b in boxes if b['fit'] >= fit and b['steps'] >= steps]
    if len(sure) < SURE_MIN:
        return None
    X = np.array([[1, np.mean(c, axis=0)[0]] for c in sure])
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
    p = np.array([1, np.mean(c, axis=0)[0]])
    return all(abs(slant(c, end) - p @ fits[end]) <= PERSPECTIVE_TOL for end in (0, 1))


def straight_lines(e, keep):
    """(angles, distances) of the straight lines at any angle, as x cos a + y sin a = d: lines with at least SEGMENT of
    the photo's long side of edge pixels on them, found among edge pixels of one direction at a time (so lettering's
    pixels are not linked across a cover), near duplicates merged, the strongest first; only where keep is True."""
    from skimage.transform import hough_line, hough_line_peaks
    L = max(e.h, e.w)
    gx, gy = ndi.sobel(e.gray, 1), ndi.sobel(e.gray, 0)
    way = (np.degrees(np.arctan2(gy, gx)) + 90) % 180
    on = e.all & keep
    found = []
    for c0 in range(0, 180, 15):
        band = on & (np.abs((way - c0 + 90) % 180 - 90) <= 12)
        th = np.sort((np.deg2rad(np.arange(c0 - 12, c0 + 12.5, 0.5) - 90) + np.pi / 2) % np.pi - np.pi / 2)
        H, A, D = hough_line(band, theta=th)
        votes, ang, dist = hough_line_peaks(H, A, D, min_distance=3, min_angle=2, threshold=SEGMENT * L, num_peaks=COVER_LINES)
        found += zip(votes, ang, dist)
    found.sort(key=lambda f: -int(f[0]))
    out = []
    for _, a, d in found:
        a, d = ((a + np.pi / 2) % np.pi - np.pi / 2, d if -np.pi / 2 <= a < np.pi / 2 else -d)
        if any(np.degrees(abs((a - b + np.pi / 2) % np.pi - np.pi / 2)) < 2 and abs(d - c) < 0.01 * L for b, c in out):
            continue
        out.append((a, d))
        if len(out) >= COVER_LINES:
            break
    return np.array([o[0] for o in out]), np.array([o[1] for o in out])


def covers(e, keep):
    """[cover-shape] The covers lying in a photo, outside its shelves, each four corners: every quadrilateral two pairs of
    near-parallel straight lines make, kept when it is a cover's size and shape, each side lies on edges with a colour
    change across it, at most one side's edge runs on past its corners (a cover's edges end at its corners, a
    plank's or a ledge's do not); the smallest first, and none holding one already kept."""
    h, w = e.h, e.w
    ang, dist = straight_lines(e, keep)
    n = len(ang)
    if n < 4:
        return []
    turn = lambda a, b: np.degrees(np.abs((a - b + np.pi / 2) % np.pi - np.pi / 2))
    pairs = [(i, j) for i in range(n) for j in range(i + 1, n) if turn(ang[i], ang[j]) <= COVER_PARALLEL and abs(dist[i] - dist[j]) >= 0.05 * min(h, w)]
    quads = [p + q for k, p in enumerate(pairs) for q in pairs[k + 1:] if turn(ang[p[0]], ang[q[0]]) >= COVER_CROSS and not set(p) & set(q)]
    if not quads:
        return []
    A, D = ang[np.array(quads)], dist[np.array(quads)]

    def meet(i, j):
        det = np.cos(A[:, i]) * np.sin(A[:, j]) - np.sin(A[:, i]) * np.cos(A[:, j])
        return np.stack([(D[:, i] * np.sin(A[:, j]) - D[:, j] * np.sin(A[:, i])) / det,
                         (np.cos(A[:, i]) * D[:, j] - np.cos(A[:, j]) * D[:, i]) / det], -1)
    c = np.stack([meet(0, 2), meet(0, 3), meet(1, 3), meet(1, 2)], 1)
    c = c[np.all((c[..., 0] > -2) & (c[..., 0] < w + 2) & (c[..., 1] > -2) & (c[..., 1] < h + 2), axis=1)]
    side = np.roll(c, -1, axis=1) - c
    L = np.hypot(side[..., 0], side[..., 1])
    area = 0.5 * np.abs(np.sum(c[..., 0] * np.roll(c[..., 1], -1, 1) - np.roll(c[..., 0], -1, 1) * c[..., 1], axis=1))
    long_, short = np.maximum(L[:, 0] + L[:, 2], L[:, 1] + L[:, 3]), np.minimum(L[:, 0] + L[:, 2], L[:, 1] + L[:, 3])
    ok = (area >= COVER_AREA[0] * h * w) & (area <= COVER_AREA[1] * h * w) & (long_ <= COVER_ASPECT * np.maximum(short, 1e-6))
    c, side, L, area = c[ok], side[ok], L[ok], area[ok]
    if not len(c):
        return []
    at = lambda q: (np.clip(np.round(q[..., 1]).astype(int), 0, h - 1), np.clip(np.round(q[..., 0]).astype(int), 0, w - 1))
    pts = c[:, :, None, :] + np.linspace(0.08, 0.92, 40)[None, None, :, None] * side[:, :, None, :]
    on = e.near[at(pts)].mean(axis=2)
    normal = np.stack([-side[..., 1], side[..., 0]], -1) / np.maximum(L[..., None], 1e-6)
    inward = np.sign(np.sum((c.mean(axis=1)[:, None, None, :] - pts) * normal[:, :, None, :], axis=-1, keepdims=True))
    k = max(3, int(0.01 * max(h, w)))
    across = np.median(np.linalg.norm(e.rgb[at(pts + inward * k * normal[:, :, None, :])] - e.rgb[at(pts - inward * k * normal[:, :, None, :])], axis=-1), axis=2) / e.spread
    beyond = np.linspace(0.02, 0.07, 8)[None, None, :, None] * side[:, :, None, :]
    runs = (e.near[at(c[:, :, None, :] - beyond)].mean(axis=2) >= COVER_SIDE) | (e.near[at(np.roll(c, -1, axis=1)[:, :, None, :] + beyond)].mean(axis=2) >= COVER_SIDE)
    good = np.flatnonzero(np.all(on >= COVER_ON, axis=1) & np.all(across >= COVER_CONTRAST, axis=1) & (runs.sum(axis=1) <= 1))
    kept = []
    for i in good[np.argsort(area[good])]:
        if any(points_in_poly(c[i].mean(0)[None], q)[0] or points_in_poly(q.mean(0)[None], c[i])[0] for q in kept):
            continue
        kept.append(c[i])
    return kept


def barcode_bands(g, small, top, bottom, shelf):
    """[barcode] Marks on shelf the bands of rows top..bottom where books stand packed: the rows the books stand in,
    when their edges between books stand apart by at most BARCODE_GAP of the band's height; then the same in the rows
    left above and below, since two shelves can come as one."""
    if bottom - top < BAND_LEAST * g.shape[0]:
        return
    e = Edges(g[top:bottom], small[top:bottom])
    rows = book_rows(e)
    if not rows or rows[1] - rows[0] < BAND_LEAST * g.shape[0]:
        return
    xs = sorted(x for x, _ in side_lines(e, *rows))
    if len(xs) > 2 and np.median(np.diff(xs)) <= BARCODE_GAP * (rows[1] - rows[0]):
        shelf[top + rows[0]:top + rows[1], int(xs[0]):int(np.ceil(xs[-1])) + 1] = True
    barcode_bands(g, small, top, top + rows[0], shelf)
    barcode_bands(g, small, top + rows[1], bottom, shelf)


def clockwise(c):
    """Four corners clockwise in the image (y down), from the one nearest the photo's top left."""
    c = np.asarray(c, float)
    mid = c.mean(0)
    c = c[np.argsort(np.arctan2(c[:, 1] - mid[1], c[:, 0] - mid[0]))]
    return np.roll(c, -int(np.argmin(c.sum(axis=1))), axis=0)


def find(rgb, text=None):
    """The books in an RGB photo, [{corners, view}]: the spines shelf by shelf from the top, left to right, then the
    covers lying outside the shelves. text is never read: R5 finds without the text finder."""
    H, W = rgb.shape[:2]
    s = min(1.0, WORK / max(H, W))
    small = np.stack([ndi.zoom(rgb[..., k].astype(np.float32), s, order=1) if s < 1 else rgb[..., k].astype(np.float32) for k in range(3)], -1)
    g = ndi.gaussian_filter(grey(small), 1.0)
    # each shelf with a margin: a book standing on its board ends past the board's edge
    m = int(MARGIN * g.shape[0])
    per_shelf = [(max(0, top - m), *shelf_books(g[max(0, top - m):bottom + m], small[max(0, top - m):bottom + m]))
                 for top, bottom in shelves(g)]
    h, w = g.shape
    shelf = np.zeros((h, w), bool)
    for top, bottom in shelves(g):
        barcode_bands(g, small, max(0, top - m), min(h, bottom + m), shelf)
    per_shelf = [(top, found, lines) for top, found, lines, _ in per_shelf]
    textures = [b['texture'] for _, found, _ in per_shelf for b in found.values()]
    spines = []
    if textures:
        least = TEXTURE * float(np.median(textures))
        per_shelf = [(top, {k: b for k, b in found.items() if b['texture'] >= least}, lines) for top, found, lines in per_shelf]
        at = lambda top, c: [(x, y + top) for x, y in c]
        # [camera-uniform] one camera took the whole photo: the books first chosen, the surest of them, say how it looked
        # at the shelves, and a box whose ends turn otherwise is not a book's
        first = [(at(top, found[k]['corners']), found[k]) for top, found, lines in per_shelf for k in most_books(found, len(lines))]
        fits = perspective(first)
        if fits is not None and np.mean([agrees(c, fits) for c, _ in first]) >= PERSPECTIVE_TRUST:
            per_shelf = [(top, {k: b for k, b in found.items() if agrees(at(top, b['corners']), fits)}, lines) for top, found, lines in per_shelf]
        for top, found, lines in per_shelf:
            chosen = most_books(found, len(lines))
            # [barcode] books on a shelf stand packed, several together: a lone strip or two is a gap between other things
            if len(chosen) < SHELF_BOOKS:
                continue
            for k in chosen:
                spines.append([(x, y + top) for x, y in found[k]['corners']])
    # [barcode] covers are looked for outside the shelves: the barcode bands, and the spines boxed
    yy, xx = np.mgrid[0:h, 0:w]
    grid = np.stack([xx.ravel(), yy.ravel()], 1)
    for c in spines:
        shelf |= points_in_poly(grid, np.asarray(c)).reshape(h, w)
    shelf = ndi.binary_dilation(shelf, iterations=max(2, int(0.01 * max(h, w))))
    found = covers(Edges(g, small), ~shelf)
    scale = lambda c: [[round(min(max(x, 0), w) / s, 1), round(min(max(y, 0), h) / s, 1)] for x, y in c]
    return ([dict(corners=scale(c), view='spine') for c in spines]
            + [dict(corners=scale(clockwise(c)), view='cover') for c in found if not shelf[int(np.clip(np.mean(c, 0)[1], 0, h - 1)), int(np.clip(np.mean(c, 0)[0], 0, w - 1))]])
