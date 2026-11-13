"""Finding the books on a shelf photo, and straightening each one for reading.

A book is four corners in image pixels, clockwise from the one at the top left of the image, and a view: "spine"
(the narrow face) or "cover" (the book facing the camera). The finder (R9) works on the photo's own edges. Within each
shelf, a spine's sides are long straight edges, found at whatever angle they lean; between two of them, the book's own
top and foot are where its texture gives way to the plain wall or board, each snapped to the straight edge it ends on,
at whatever angle that runs. A box is kept only once it checks out as a readable spine (`spine`), and of the boxes kept,
the most that share no ground are the books. It boxes spines alone: a cover, or a pile of books lying flat, is not told
apart yet."""
import copy

import numpy as np
from scipy import ndimage as ndi
from skimage.measure import points_in_poly
from skimage.segmentation import felzenszwalb
from skimage.transform import resize

# scale-dependent: the long side the finder works at, in pixels; boxes are scaled back to the photo's own
WORK = 900
# [fine-pass] the long side of the second, finer run, whose boxes are added where they touch no box found so far
WORK_FINE = 1440
# [log-pass] the third run's grey is log-stretched where the shelf is dark: the window it is dark over, its grey below
# which it counts as dark, and the knee of the stretch
LOG_WIN, LOG_DARK, LOG_KNEE = 31, 90, 32
# [pass-overlap] a box a later run finds is added when its IoU with every box already kept is at most this
ADD_IOU = 0.3
# [texture-waiver] a box whose sides lie this much on the seams and whose face strays from its own colour by at most
# this share of the shelf's brightness range needs no texture
FIT_STRONG, UNIFORM = 0.7, 0.3
# [gap-search] a gap between neighbours this many usual spine widths is searched again; a book lonely beyond this many
# is dropped; the relaxed cover a side needs; how far a side may turn from its neighbours' lean, in degrees; the
# texture bar's share inside a gap; the candidate width in usual widths
GAP_MIN, LONELY, GAP_BOUND, GAP_TURN, GAP_TEXTURE, GAP_WIDTH = 0.6, 2.5, 0.5, 8, 0.5, (0.5, 1.7)
# [spine-lean] how far from upright a spine's edges may lean, in degrees, and the step the lean is searched in
LEAN, LEAN_STEP = 30, 0.5
# [spine-sides] how far apart, in degrees, a book's two sides may lean
SIDES = 6
# the share of the photo's height a shelf is looked at past its own top and bottom: a board seen slanted crosses rows
MARGIN = 0.08
# [shelf-lines] a row the edges between books run on across, on this share of the columns holding one, is no board;
# an edge runs along a row band where it is on in this share of its rows
CROSSED, EDGE_ON = 0.3, 0.7
# no box lies over another: boxes overlapping by under TOUCH of the smaller touch; two overlapping each other alone by
# MERGE, sharing COLUMN of the narrower's width across, are one book's two halves
TOUCH, MERGE, COLUMN = 0.1, 0.2, 0.6
# the edge detector's blur, in work pixels: enough to drop a JPEG's grain, little enough to keep a thin spine's sides
SIGMA = 2.0
# an edge piece shorter than this share of the shelf is lettering or grain, not a spine's side
PIECE = 0.04
# a book lies between two neighbouring edges between books: none lies between its sides
REACH = 1
# two edges between books are one when closer, at both ends, than this share of the shelf's own spacing between its
# edges (this percentile of it), and never closer than twice MIN_WIDTH apart: packed thin spines stand closer than
# that floor
SPACING_Q, CROWD = 25, 0.7
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
# [spine-colour] a book's face is one region of colour: the shelf, at this many pixels wide, cut into regions at these
# scales (Felzenszwalb's), each one long and thin, leaning at most this many degrees, filling this share of its
# rectangle, is a book's face where no line-found box stands; its sides are moved to the strongest edge within this
# share of its width and this many degrees
REGION_WIDE, REGION_SCALES, REGION_SIGMA, REGION_LEAST = 500, (50, 150), 0.8, 40
REGION_LEAN, REGION_FILL, REGION_SNAP, REGION_TURN = 50, 0.6, 0.25, 3
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
# [text-lines] the page's text finder (PaddleOCR's, reading.js) marks the photo's text: a point is text at this
# probability. An edge between books crosses text along at most this share of its rows; a strip between two edges
# whose text, read across it, stands in this many separate columns is searched again for the edge between them; and a
# box a text line runs along this share of is a book's face whatever its texture
TEXT_ON, TEXT_CROSS, TEXT_COLUMNS, TEXT_ALONG = 0.3, 0.12, 2, 0.3
# the share of a strip's width read across it for its text columns, and how much of a column's rows are text
TEXT_STEPS, TEXT_COLUMN = 24, 0.15
# scale-dependent: the long side the text finder reads the photo at (a multiple of 32, as the finder needs)
TEXT_LONG = 1280
# and how far beyond it, as a share of the shelf's height, a plain end of the book is followed to the edge it ends on
REACH_OUT = 0.3

# [camera-roll] a photo's roll is read off the long near-horizontal edges (the boards) of a thumbnail this many pixels
# on its long side (scale-dependent), within this many degrees of level, a line being one this share of the thumbnail's
# width long, its angle the mode of the lines' angles refined over those within this many degrees of it; black padding
# at the frame is a piece of at least this share of the thumbnail
ROLL_WORK, ROLL_SPAN, ROLL_LINE, ROLL_NEAR, PAD_LEAST = 900, 30, 0.3, 1.5, 0.002
# [camera-roll] a roll of at least this many degrees is turned out of the photo before it is read: under it the photo
# is read as it comes (the owner's shelves lean up to 4 degrees on two photos, and reading those level lost books)
ROLL_LEAST = 5.0
# [camera-roll] a photo with fewer books than this is tried on its side
SHELF_ENOUGH = 6


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
    # [shelf-lines] a board stops the edges between books: a row they run on across is a line over the books themselves
    up_down = np.where(gx > 2 * gy, gx, 0)
    up_down = ndi.maximum_filter1d(up_down > np.quantile(up_down, 0.9), 3, axis=1)
    near = max(4, h // 25)
    rows = [r for r in rows if crossed(up_down, r, near) < CROSSED]
    cuts = [0, *rows, h]
    return [(a, b) for a, b in zip(cuts, cuts[1:]) if b - a > h // 6]


def crossed(up_down, r, near):
    """The share of the columns holding an upright edge next to row r where that edge runs on across r: upright edges
    along most of the rows within near above r and within near below it."""
    up = up_down[max(0, r - near):r - 2].mean(0) > EDGE_ON
    down = up_down[r + 3:r + near].mean(0) > EDGE_ON
    return float((up & down).sum() / max(1, (up | down).sum()))


def long_pieces(m, frac):
    """The connected pieces of an edge map reaching frac of its height."""
    lab, n = ndi.label(m, np.ones((3, 3)))
    if not n:
        return m
    keep = np.array([False] + [s[0].stop - s[0].start >= frac * m.shape[0] for s in ndi.find_objects(lab)])
    return keep[lab]


class Edges:
    """A shelf's edges: every edge, the long ones running up it, how strongly its brightness changes, and its colour."""

    def __init__(self, g, rgb, log=False):
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
        self.log = log
        self.base = None
        self.cached = {}
        self.shared = {}
        self.spread = float(np.subtract(*np.percentile(g, [95, 5]))) or 1.0

    @property
    def seam(self):
        return self.seams(True)

    def looked(self, log):
        """These edges with the seams of the run that does (log) or does not log-stretch the dark shelves: the edges
        themselves are shared."""
        if log == self.log:
            return self
        assert not self.log
        other = copy.copy(self)
        other.log, other.base, other.cached = log, self if log else None, {}
        return other

    def seams(self, strict):
        """The seams of the grey, from the log-stretched grey where the shelf is dark when this is the log run."""
        if strict not in self.cached:
            plain = self.base.seams(strict) if self.base is not None else seams(self.gray, strict)
            if self.log:
                sg = 255.0 * np.log1p(np.clip(self.gray, 0, None) / LOG_KNEE) / np.log1p(255 / LOG_KNEE)
                dark = ndi.uniform_filter(self.gray, LOG_WIN) < LOG_DARK
                self.cached[strict] = np.where(dark, seams(sg, strict), plain)
            else:
                self.cached[strict] = plain
        return self.cached[strict]


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


# [lean-scan] the most elements of a window view of the scan's prefix sums, at two bytes each
LINE_VIEW = 1 << 27


class LineScan:
    """[x0, lean] The share of rows ys that a mask is on along the line through x0 at row yc leaning by each of tans, a
    point off the mask counting as off, for runs of consecutive columns x0. The mask is read through its prefix sums down
    the rows, kept for the scan's key."""

    def __init__(self, ys, yc, tans, h, w):
        self.ys, self.yc, self.tans, self.h, self.w = ys, yc, tans, h, w
        n = len(ys)
        self.d = (ys[None] - yc) * tans[:, None]
        # a line this close to a half pixel could round either way once x0 is added: its points are looked up one by one
        self.exact = bool((np.abs(self.d - np.floor(self.d) - 0.5) < 1e-6).any())
        self.pad = int(np.ceil(np.abs(self.d).max())) + 2
        shift = np.round(self.d).astype(np.intp)
        self.first, self.span = int(shift.min()), int(shift.max() - shift.min()) + 1
        # the rows between two cuts lie one column across, so their run of x0s is one stretch of the prefix sums
        self.cuts = []
        for k in range(len(tans)):
            cut = np.flatnonzero(np.diff(shift[k])) + 1
            top = np.r_[0, cut]
            self.cuts.append((top, np.r_[cut, n], shift[k][top] - self.first))
        self.sums = {}

    def cover(self, key, mask, lo, count):
        ys, n, w = self.ys, len(self.ys), self.w
        if count == 0:
            return np.zeros((0, len(self.tans)))
        if self.exact:
            out = []
            for at in range(0, count, 16):
                xs = np.round(np.arange(lo + at, lo + min(count, at + 16))[:, None, None] + self.d[None]).astype(int)
                ok = (xs >= 0) & (xs < w)
                out.append(np.where(ok, mask[ys[None, None], np.clip(xs, 0, w - 1)], False).mean(axis=2))
            return np.concatenate(out)
        if key not in self.sums:
            self.sums[key] = np.zeros((n + 1, w + 2 * self.pad), np.uint16)
            np.cumsum(np.pad(mask[ys[0]:ys[-1] + 1], ((0, 0), (self.pad, self.pad))), axis=0, out=self.sums[key][1:])
        sums = self.sums[key]
        out = np.empty((count, len(self.tans)))
        # the windows of the sums are read in steps of columns that keep the view under the 2 GB a 32-bit runtime allows
        step = max(1, min(count, LINE_VIEW // ((n + 1) * self.span)))
        for at in range(0, count, step):
            size = min(step, count - at)
            start = self.pad + lo + at + self.first
            rows = np.lib.stride_tricks.sliding_window_view(sums[:, start:start + self.span - 1 + size], size, axis=1)
            for k, (top, bottom, col) in enumerate(self.cuts):
                out[at:at + size, k] = rows[bottom, col].sum(0, dtype=np.int64) - rows[top, col].sum(0, dtype=np.int64)
        return out / n


def side_lines(e, top, bottom, text=None):
    """[(x at the rows' middle, lean as tan)] of the edges between books, left to right: lines that lie on a seam
    along BOUNDARY of the rows nearly every book crosses, at leans up to LEAN, kept strongest first and none crossing
    one already kept or close to it along its length, since two books' edges never cross; a gap far wider than the
    shelf's usual spine is searched again with a lower bar, for the one weak edge, a pale book against a pale wall. A
    spine's lettering runs along part of its length, a gap between two books along all of it. Given the text map, a
    line that crosses text is lettering, and a strip holding text in separate columns is searched again with the
    lower bar: two books of one colour, each with its own title."""
    core = core_rows(e.gray[top:bottom])
    if not core:
        return []
    c0, c1 = top + core[0], top + core[1]
    yc, mid = (c0 + c1) / 2, (top + bottom) / 2
    ys = np.arange(c0, c1)
    tans = np.tan(np.deg2rad(np.arange(-LEAN, LEAN + LEAN_STEP / 2, LEAN_STEP)))
    gap = MIN_WIDTH * 2 * e.w

    scanner = LineScan(ys, yc, tans, *e.gray.shape)
    crossing = None if text is None else text > TEXT_ON

    def scan(x0s, strict):
        lo, count = (x0s.start, len(x0s)) if len(x0s) else (0, 0)
        cover = scanner.cover(strict, e.seams(strict), lo, count)
        if text is not None:
            crossed = scanner.cover('text', crossing, lo, count)
            cover = np.where(crossed > TEXT_CROSS, 0, cover)
        best = cover.argmax(axis=1)
        at = np.arange(count)
        return [(float(cover[i, best[i]]), float(lo + i), float(tans[best[i]])) for i in np.flatnonzero(cover[at, best] >= BOUNDARY)]

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

    first = scan(range(1, e.w - 1), True)
    kept = keep(first, [])
    spans = np.diff([x for _, x, _ in kept])
    if len(spans) >= 4:
        near = max(MIN_WIDTH * e.w, CROWD * float(np.percentile(spans, SPACING_Q)))
        if near < gap:
            gap = near
            kept = keep(first, [])
    spans = np.diff([x for _, x, _ in kept])
    if len(spans):
        usual = float(np.median(spans))
        for (_, xa, _), (_, xb, _) in zip(list(kept), list(kept)[1:]):
            if xb - xa > WIDE * usual:
                kept = keep(scan(range(int(xa + gap), int(xb - gap)), False), kept)
    if text is not None:
        for (_, xa, ta), (_, xb, tb) in zip(list(kept), list(kept)[1:]):
            if text_columns(text, Line(xa, -ta, yc), Line(xb, -tb, yc), c0, c1) >= TEXT_COLUMNS:
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


def text_columns(text, la, lb, y0, y1):
    """[text-lines] How many separate columns of text stand between two lines over rows y0..y1, read across the strip
    along its lean."""
    ys = np.arange(int(y0), int(y1))
    xa, xb = la.x(ys), lb.x(ys)
    across = np.zeros(TEXT_STEPS)
    for k in range(TEXT_STEPS):
        xs = np.round(xa + (xb - xa) * (k + 0.5) / TEXT_STEPS).astype(int)
        ok = (xs >= 0) & (xs < text.shape[1])
        across[k] = (text[ys[ok], xs[ok]] > TEXT_ON).mean() if ok.any() else 0.0
    return ndi.label(across > TEXT_COLUMN)[1]


def text_along(text, c):
    """[text-lines] The share of a box's length a text line runs along: of the rows across its inner strip (corners
    clockwise from the top left), those with text on them."""
    tl, tr, br, bl = np.asarray(c, float)
    rows = 40
    f = ((np.arange(rows) + 0.5) / rows)[:, None]
    a, b = tl + (bl - tl) * f, tr + (br - tr) * f
    # the 8 inner samples of np.linspace(a, b, 12) along each row
    step, inner = (b - a) / 11, np.arange(2, 10)[None]
    xs, ys = a[:, :1] + inner * step[:, :1], a[:, 1:] + inner * step[:, 1:]
    xi = np.clip(np.round(xs).astype(int), 0, text.shape[1] - 1)
    yi = np.clip(np.round(ys).astype(int), 0, text.shape[0] - 1)
    return int((text[yi, xi] > TEXT_ON).any(axis=1).sum()) / rows


def extent(e, la, lb, top, bottom):
    """(first row, row after the last) the book between two lines fills: where its strip has the edges a book's face
    carries and the wall or board above and below it lacks."""
    h = bottom - top
    y = np.arange(top, bottom)
    a, b = np.maximum(np.floor(la.x(y)).astype(int), 0), np.minimum(np.ceil(lb.x(y)).astype(int) + 1, e.w)
    r = np.zeros(h)
    for width in np.unique(b - a):
        if width > 0:
            at = np.flatnonzero(b - a == width)
            r[at] = e.grad[y[at, None], a[at, None] + np.arange(width)].mean(axis=1)
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


def row_norm(v):
    """The Euclidean length of each vector along the last axis, as np.linalg.norm gives it."""
    return np.sqrt(np.add.reduce(v * v, axis=-1))


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
    own = (row_norm(px - colour) <= OWN * e.spread).mean(axis=2)
    k = max(2, win // 2)
    n = len(shifts)
    step = np.zeros((n, len(tilts)))
    # running sums down the lines, from a first line of nothing
    c, o = np.zeros((n + 1, *prof.shape[1:]), prof.dtype), np.zeros((n + 1, own.shape[1]), own.dtype)
    np.cumsum(prof, axis=0, out=c[1:])
    np.cumsum(own, axis=0, out=o[1:])
    i = np.arange(k, n - k)
    inside, beyond = (c[i] - c[i - k]) / k, (c[i + 1 + k] - c[i + 1]) / k
    # past its end hardly any of the strip is the book's: past a row of its lettering, most still is
    step[i] = np.where((o[i + 1 + k] - o[i + 1]) / k <= OWN_BEYOND, row_norm(inside - beyond), 0)
    best = step.max(axis=1)
    if best.max() <= 0:
        return (y, y), 0.0
    # a top: the first change sharp enough to be an end at all, since a book's top against the shadow under the board
    # above is softer than the shadow's own edge against that board, beyond it. A foot stands on its board, with no
    # such edge beyond it, and a logo or label near it changes the strip as sharply: the first near the strongest
    least = END_STEP * e.spread if out < 0 else STEP_NEAR * best.max()
    before, after = np.r_[best[:1], best[:-1]], np.r_[best[1:], best[-1:]]
    peaks = np.flatnonzero((best >= least) & (best >= before) & (best >= after))
    i = int(peaks[0]) if len(peaks) else int(np.argmax(best))
    j = int(np.argmax(step[i]))
    dy = tilts[j]
    yc = y + out * shifts[i]
    return (int(round(yc - dy / 2)), int(round(yc + dy / 2))), float(best[i] / e.spread)


def book_colour(e, la, lb, y0, y1):
    """The colour most of the strip carries between y0 and y1: the book's own, its lettering aside."""
    y = np.arange(int(y0), int(y1), 2)
    a, b = np.maximum(0, np.ceil(la.x(y)).astype(int) + 1), np.minimum(e.w, np.floor(lb.x(y)).astype(int))
    long = b > a
    y, a, size = y[long], a[long], (b - a)[long]
    if not len(y):
        return np.zeros(3)
    row = np.repeat(np.arange(len(y)), size)
    across = np.arange(size.sum()) - np.repeat(np.cumsum(size) - size, size)
    return np.median(e.rgb[y[row], a[row] + across], axis=0)


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
    y = np.arange(int(y0), int(y1), 2)
    a, b = np.ceil(la.x(y)).astype(int) + 2, np.floor(lb.x(y)).astype(int) - 2
    long = b > a
    y, a, b = y[long], a[long], b[long]
    if (a < 0).any() or (b > e.w).any():
        # a slice from before the photo's left edge counts from its right, one past its right edge is cut short
        tot = sum(e.all[yy, aa:bb].sum() for yy, aa, bb in zip(y, a, b))
    else:
        tot = sum(e.all[y[at, None], a[at, None] + np.arange(width)].sum() for width in np.unique(b - a) for at in [(b - a) == width])
    n = int((b - a).sum())
    return tot / n if n else 0.0


def face_spread(e, la, lb, y0, y1, colour):
    """How far the box's face strays from its own colour, as a share of the shelf's brightness range (median)."""
    y = np.arange(int(y0), int(y1), 3)
    a, b = np.ceil(la.x(y)).astype(int) + 2, np.floor(lb.x(y)).astype(int) - 2
    long = b > a
    y, a, b = y[long], a[long], b[long]
    if not len(y):
        return 9.0
    if (a < 0).any() or (b > e.w).any():
        d = [row_norm(e.rgb[yy, aa:bb:2, :3] - colour) for yy, aa, bb in zip(y, a, b)]
    else:
        d = [row_norm(e.rgb[y[at, None], a[at, None] + 2 * np.arange((width + 1) // 2), :3] - colour).ravel()
             for width in np.unique(b - a) for at in [(b - a) == width]]
    return float(np.median(np.concatenate(d)) / e.spread)


def spine(e, lines, i, j, top, bottom):
    """The book between side lines i and j as {corners, texture, fit, steps, strong, uni}, or None when it does not check
    out as a readable spine."""
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
    strong = min(on_line(e.seam, la, *whole), on_line(e.seam, lb, *whole)) >= FIT_STRONG
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
    return dict(corners=corners, texture=texture(e, la, lb, *whole), fit=sides_on, steps=min(top_step, foot_step),
                strong=strong, uni=face_spread(e, la, lb, *whole, colour))


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


def shelf_books(g, rgb, text=None, log=False, e=None):
    """Every pair of neighbouring side lines on a shelf that checks out as a spine: {(i, j): spine}, the lines, and the
    rows the books stand in (None when there are none). A
    box far wider than the shelf's usual one whose marks repeat further across is two books of one series: a line goes
    between them, and each is checked as any book is."""
    e = Edges(g, rgb, log) if e is None else e
    rows = book_rows(e)
    if not rows:
        return {}, [], None
    top, bottom = rows
    lines = [Line(xm, t, (top + bottom) / 2) for xm, t in side_lines(e, top, bottom, text)]

    def all_found():
        found = {}
        for i in range(len(lines)):
            for j in range(i + 1, min(len(lines), i + 1 + REACH)):
                b = spine(e, lines, i, j, top, bottom)
                if b:
                    if text is not None:
                        b['text'] = text_along(text, b['corners'])
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
    for n, (la, lb) in enumerate(regions(e, top, bottom)):
        if lb.xm > la.xm:
            b = spine(e, [la, lb], 0, 1, top, bottom)
            if b:
                if text is not None:
                    b['text'] = text_along(text, b['corners'])
                found['region', n] = b
    e.rows = rows
    return found, lines, e


def region_pieces(e, top, bottom):
    """[(centre, normal, left, right, width, rows, lean)] of each region of one colour on the shelf rows top..bottom that
    is shaped like a spine: long, thin, near upright and filling its rectangle, the offsets of its two sides along the
    normal and the lean of its axis."""
    q = max(1.0, e.w / REGION_WIDE)
    sub = e.rgb[top:bottom, :, :3].astype(np.float32) / 255
    small = resize(sub, (max(8, round(sub.shape[0] / q)), max(8, round(sub.shape[1] / q))), anti_aliasing=True)
    qy, qx = sub.shape[0] / small.shape[0], sub.shape[1] / small.shape[1]
    out = []
    for scale in REGION_SCALES:
        seg = felzenszwalb(small, scale=scale, sigma=REGION_SIGMA, min_size=REGION_LEAST)
        for k, sl in enumerate(ndi.find_objects(seg + 1)):
            if sl is None:
                continue
            ys, xs = np.nonzero(seg[sl] == k)
            if len(ys) < REGION_LEAST:
                continue
            p = np.stack([(xs + sl[1].start + 0.5) * qx, (ys + sl[0].start + 0.5) * qy + top], 1)
            c = p.mean(0)
            a = np.linalg.eigh(np.cov((p - c).T))[1][:, 1]
            a = -a if a[1] < 0 else a
            n = np.array([-a[1], a[0]])
            (a0, b0), (a1, b1) = np.percentile(np.stack([(p - c) @ a, (p - c) @ n]), [1, 99], axis=1)
            width, length = b1 - b0, a1 - a0
            if (width < MIN_WIDTH * e.w or length < ASPECT * width or a[1] < np.cos(np.deg2rad(REGION_LEAN))
                    or len(ys) * qx * qy / (width * length) < REGION_FILL):
                continue
            y0, y1 = c[1] + a0 * a[1], c[1] + a1 * a[1]
            out.append((c, n, b0, b1, width, np.arange(int(max(top, y0)), int(min(bottom, y1))), a[0] / a[1]))
    return out


def regions(e, top, bottom):
    """[(left, right) Line] of each region of one colour on the shelf rows top..bottom that is shaped like a spine, its
    sides each moved onto the strongest edge near it. The regions are cut once for every run that reads the edges."""
    mid = (top + bottom) / 2
    if ('regions', top, bottom) not in e.shared:
        e.shared['regions', top, bottom] = region_pieces(e, top, bottom)
    out = []
    for c, n, b0, b1, width, r, t0 in e.shared['regions', top, bottom]:
        sides = []
        turns = [float(np.tan(np.arctan(t0) + np.deg2rad(turn))) for turn in np.arange(-REGION_TURN, REGION_TURN + 0.1, 1.0)]
        dxs = np.arange(-REGION_SNAP * width, REGION_SNAP * width + 0.5, 1.0)
        for b in (b0, b1):
            px, py = c[0] + n[0] * b, c[1] + n[1] * b
            # [turn, shift, row]: the side's seam cover over the rows it is on the photo for, the first best of them
            xs_ = np.round((px + dxs)[None, :, None] + np.array(turns)[:, None, None] * (r - py)[None, None, :]).astype(int)
            ok = (xs_ >= 0) & (xs_ < e.w)
            on = ok & e.seam[r[None, None, :], np.clip(xs_, 0, e.w - 1)]
            seen = ok.sum(axis=2)
            cover = np.where(seen > 0, on.sum(axis=2) / np.maximum(seen, 1), 0.0)
            turn, dx = np.unravel_index(int(np.argmax(cover)), cover.shape)
            sides.append(Line(px + dxs[dx] + turns[turn] * (mid - py), -turns[turn], mid))
        out.append(sorted(sides, key=lambda l: l.xm))
    return out


def box_sides(c, mid):
    """(left Line, right Line) of a box's corners TL, TR, BR, BL, both with x at row mid."""
    (tlx, tly), (trx, try_), (brx, bry), (blx, bly) = c

    def line(x0, y0, x1, y1):
        d = (x1 - x0) / (y1 - y0)
        return Line(x0 + d * (mid - y0), -d, mid)
    return line(tlx, tly, blx, bly), line(trx, try_, brx, bry)


def lonely_veto(boxes):
    """Drop a box with no other box beside it on its shelf: nearest sides within LONELY of the shelf's usual width, at
    rows both stand in."""
    if len(boxes) < 3:
        return boxes
    ys = [p[1] for b in boxes for p in b['corners']]
    mid = (min(ys) + max(ys)) / 2
    sides = [box_sides(b['corners'], mid) for b in boxes]
    wid = [r.xm - l.xm for l, r in sides]
    u = float(np.median(wid))
    keep = []
    for i, b in enumerate(boxes):
        yi = (min(p[1] for p in b['corners']), max(p[1] for p in b['corners']))
        ok = False
        for j, c in enumerate(boxes):
            if j == i:
                continue
            yj = (min(p[1] for p in c['corners']), max(p[1] for p in c['corners']))
            if min(yi[1], yj[1]) - max(yi[0], yj[0]) < 0.5 * min(yi[1] - yi[0], yj[1] - yj[0]):
                continue
            d = max(sides[j][0].xm - sides[i][1].xm, sides[i][0].xm - sides[j][1].xm)
            if d <= LONELY * u:
                ok = True
                break
        if ok:
            keep.append(b)
    return keep


def gap_search(e, boxes, top, text, least):
    """Between neighbouring boxes of a shelf, a gap wider than GAP_MIN of the usual spine is searched again with
    relaxed evidence: sides on the relaxed seams leaning like the neighbours, boxes checked by spine(), those tiling the
    gap kept."""
    if len(boxes) < 2:
        return boxes
    t_, b_ = e.rows
    mid = (t_ + b_) / 2
    local = [[(x, y - top) for x, y in b['corners']] for b in boxes]
    order = sorted(range(len(boxes)), key=lambda k: np.mean([p[0] for p in local[k]]))
    sides = {k: box_sides(local[k], mid) for k in order}
    wid = {k: sides[k][1].xm - sides[k][0].xm for k in order}
    relaxed = e.seams(False)

    def search(la, rb, ya0, ya1, u, lean):
        ys = np.arange(int(ya0), int(ya1))
        xs0 = np.arange(int(la.xm + 0.25 * u), int(rb.xm - 0.25 * u) + 1)
        if len(ys) < 8 or len(xs0) == 0:
            return []
        t0 = np.full(len(xs0), lean)
        turn = np.deg2rad(np.arange(-GAP_TURN, GAP_TURN + 0.1, 0.5))
        tl = np.tan(np.arctan(t0)[None, :] + turn[:, None])
        xx = np.round(xs0[None, :, None] - tl[:, :, None] * (ys[None, None, :] - mid)).astype(int)
        ok = (xx >= 0) & (xx < e.w)
        cover = np.where(ok, relaxed[ys[None, None, :], np.clip(xx, 0, e.w - 1)], False).mean(axis=2)
        if text is not None:
            tx = np.where(ok, text[ys[None, None, :], np.clip(xx, 0, e.w - 1)] > TEXT_ON, False).mean(axis=2)
            cover = np.where(tx > TEXT_CROSS, 0, cover)
        kbest = cover.argmax(axis=0)
        score = cover[kbest, np.arange(len(xs0))]
        cands = []
        for i in np.argsort(-score):
            if score[i] < GAP_BOUND:
                break
            if all(abs(xs0[i] - xs0[j]) >= 0.3 * u for j in cands):
                cands.append(i)
        lines = [la] + [Line(float(xs0[i]), float(tl[kbest[i], i]), mid) for i in sorted(cands, key=lambda i: xs0[i])] + [rb]
        m = len(lines)
        found = {}
        for i in range(m):
            for j in range(i + 1, m):
                w = lines[j].xm - lines[i].xm
                if GAP_WIDTH[0] * u <= w <= GAP_WIDTH[1] * u:
                    b = spine(e, [lines[i], lines[j]], 0, 1, t_, b_)
                    if b and (b['texture'] >= least or (text is not None and text_along(text, b['corners']) >= TEXT_ALONG)):
                        found[i, j] = b
        best = [(0.0, None)] * m
        for j in range(m):
            best[j] = (best[j - 1][0], ('skip', j - 1)) if j else (0.0, None)
            for i in range(j):
                if (i, j) in found:
                    w = lines[j].xm - lines[i].xm
                    val = min(w / u, 1.3) + 0.5 * found[i, j]['fit']
                    if best[i][0] + val > best[j][0]:
                        best[j] = (best[i][0] + val, ('box', i))
        res, j = [], m - 1
        while j >= 0 and best[j][1]:
            kind, i = best[j][1]
            if kind == 'box':
                res.append(found[i, j])
            j = i
        return res

    def lean_near(n):
        tn = [(sides[k][0].t + sides[k][1].t) / 2 for k in order[max(0, n - 3):n + 5]]
        return float(np.tan(np.median(np.arctan(tn))))

    out = []
    for n, (ka, kb) in enumerate(zip(order, order[1:])):
        la, rb = sides[ka][1], sides[kb][0]
        u = float(np.median([wid[k] for k in order[max(0, n - 2):n + 4]]))
        if rb.xm - la.xm < GAP_MIN * u:
            continue
        ya0 = np.mean([local[ka][0][1], local[ka][1][1], local[kb][0][1], local[kb][1][1]])
        ya1 = np.mean([local[ka][2][1], local[ka][3][1], local[kb][2][1], local[kb][3][1]])
        for b in search(la, rb, ya0, ya1, u, lean_near(n)):
            out.append(dict(corners=[(x, y + top) for x, y in b['corners']], fit=b['fit'], new=True))
    return list(boxes) + out


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


def barcode_bands(g, small, top, bottom, shelf, memo=None):
    """[barcode] Marks on shelf the bands of rows top..bottom where books stand packed: the rows the books stand in,
    when their edges between books stand apart by at most BARCODE_GAP of the band's height; then the same in the rows
    left above and below, since two shelves can come as one."""
    if bottom - top < BAND_LEAST * g.shape[0]:
        return
    e = Edges(g[top:bottom], small[top:bottom]) if memo is None else edges_in(memo, g, small, top, bottom)
    rows = book_rows(e)
    if not rows or rows[1] - rows[0] < BAND_LEAST * g.shape[0]:
        return
    xs = sorted(x for x, _ in side_lines(e, *rows))
    if len(xs) > 2 and np.median(np.diff(xs)) <= BARCODE_GAP * (rows[1] - rows[0]):
        shelf[top + rows[0]:top + rows[1], int(xs[0]):int(np.ceil(xs[-1])) + 1] = True
    barcode_bands(g, small, top, top + rows[0], shelf, memo)
    barcode_bands(g, small, top + rows[1], bottom, shelf, memo)


def area(c):
    x, y = np.asarray(c, float).T
    return abs(float(x @ np.roll(y, -1) - y @ np.roll(x, -1))) / 2


def clip(c, by):
    """The part of polygon c inside convex polygon by, either way round: Sutherland and Hodgman's clipping."""
    x, y = np.asarray(by, float).T
    sign = 1 if float(x @ np.roll(y, -1) - y @ np.roll(x, -1)) > 0 else -1
    out = [tuple(p) for p in c]
    for (ax, ay), (bx, by_) in zip(by, list(by[1:]) + [by[0]]):
        side = lambda p: sign * ((bx - ax) * (p[1] - ay) - (by_ - ay) * (p[0] - ax))
        pts, out = out, []
        for p, q in zip(pts, pts[1:] + pts[:1]):
            sp, sq = side(p), side(q)
            if sp >= 0:
                out.append(p)
            if sp * sq < 0:
                f = sp / (sp - sq)
                out.append((p[0] + f * (q[0] - p[0]), p[1] + f * (q[1] - p[1])))
        if not out:
            return []
    return out


def overlap(a, b):
    """The area two boxes share."""
    if (max(p[0] for p in a) < min(p[0] for p in b) or max(p[0] for p in b) < min(p[0] for p in a)
            or max(p[1] for p in a) < min(p[1] for p in b) or max(p[1] for p in b) < min(p[1] for p in a)):
        return 0.0
    both = clip(a, b)
    return area(both) if len(both) >= 3 else 0.0


def apart(found):
    """[{corners, fit}] with no box over another, most overlapping first: two boxes that overlap each other alone, by
    MERGE of the smaller, and stand in one column, are one book's two halves, boxed from the upper's top to the lower's
    foot; of two overlapping otherwise, the weaker fit goes. Boxes overlapping by under TOUCH of the smaller touch."""
    n, sizes = len(found), [area(b['corners']) for b in found]
    share = {}
    for i in range(n):
        for j in range(i + 1, n):
            v = overlap(found[i]['corners'], found[j]['corners']) / max(1e-9, min(sizes[i], sizes[j]))
            if v >= TOUCH:
                share[i, j] = v
    partners = [sum(i in k for k in share) for i in range(n)]
    xs = [(min(p[0] for p in b['corners']), max(p[0] for p in b['corners'])) for b in found]
    gone, merged = set(), []
    for (i, j), v in sorted(share.items(), key=lambda kv: -kv[1]):
        if i in gone or j in gone:
            continue
        (a0, a1), (b0, b1) = xs[i], xs[j]
        column = (min(a1, b1) - max(a0, b0)) / max(1e-9, min(a1 - a0, b1 - b0))
        if partners[i] == partners[j] == 1 and v >= MERGE and column >= COLUMN:
            hi, lo = sorted((found[i], found[j]), key=lambda b: np.mean([p[1] for p in b['corners']]))
            merged.append(dict(corners=[hi['corners'][0], hi['corners'][1], lo['corners'][2], lo['corners'][3]],
                               fit=min(hi['fit'], lo['fit'])))
            gone |= {i, j}
        else:
            gone.add(i if found[i]['fit'] < found[j]['fit'] else j)
    return [b for k, b in enumerate(found) if k not in gone] + merged


def clockwise(c):
    """Four corners clockwise in the image (y down), from the one nearest the photo's top left."""
    c = np.asarray(c, float)
    mid = c.mean(0)
    c = c[np.argsort(np.arctan2(c[:, 1] - mid[1], c[:, 0] - mid[0]))]
    return np.roll(c, -int(np.argmin(c.sum(axis=1))), axis=0)


def text_view(rgb):
    """[text-lines] The photo as the text finder reads it: RGB, its long side TEXT_LONG, each side a multiple of 32."""
    from PIL import Image
    H, W = rgb.shape[:2]
    s = TEXT_LONG / max(H, W)
    size = (max(32, round(W * s / 32) * 32), max(32, round(H * s / 32) * 32))
    return np.asarray(Image.fromarray(np.ascontiguousarray(rgb[..., :3])).resize(size, Image.BILINEAR))


def iou(a, b):
    """The share of the two boxes' union that both cover."""
    inter = overlap(a, b)
    return inter / max(1e-9, area(a) + area(b) - inter) if inter else 0.0


def edges_in(memo, g, small, top, bottom):
    """The (non-log) edges of rows top..bottom of the photo at the work size, made once for every run that reads them."""
    key = (max(0, top), min(g.shape[0], bottom))
    if key not in memo['edges']:
        memo['edges'][key] = Edges(g[key[0]:key[1]], small[key[0]:key[1]])
    return memo['edges'][key]


def find_once(rgb, text, work, log, memo=None):
    """One run of the finder at the work size: [{corners, view}] in the photo's pixels. log: seams from the
    log-stretched grey where the shelf is dark. memo: what an earlier run at this work size made, which this one
    reads instead (the same photo, text and work size)."""
    H, W = rgb.shape[:2]
    s = min(1.0, work / max(H, W))
    memo = {} if memo is None else memo
    if 'view' not in memo:
        small = np.stack([ndi.zoom(rgb[..., k].astype(np.float32), s, order=1) if s < 1 else rgb[..., k].astype(np.float32) for k in range(3)], -1)
        g = ndi.gaussian_filter(grey(small), 1.0)
        if text is not None:
            text = ndi.zoom(np.asarray(text, np.float32), (g.shape[0] / text.shape[0], g.shape[1] / text.shape[1]), order=1)
        memo['view'], memo['edges'], memo['shelves'] = (small, g, text), {}, shelves(g)
    small, g, text = memo['view']
    # each shelf with a margin: a book standing on its board ends past the board's edge
    m = int(MARGIN * g.shape[0])
    per_shelf = [(max(0, top - m), *shelf_books(g[max(0, top - m):bottom + m], small[max(0, top - m):bottom + m],
                                             None if text is None else text[max(0, top - m):bottom + m], log,
                                             edges_in(memo, g, small, top - m, bottom + m).looked(log)))
                 for top, bottom in memo['shelves']]
    h, w = g.shape
    if 'barcode' not in memo:
        memo['barcode'] = np.zeros((h, w), bool)
        for top, bottom in memo['shelves']:
            barcode_bands(g, small, max(0, top - m), min(h, bottom + m), memo['barcode'], memo)
    shelf = memo['barcode'].copy()
    textures = [b['texture'] for _, found, _, _ in per_shelf for k, b in found.items() if k[0] != 'region']
    spines = []
    if textures:
        least = TEXTURE * float(np.median(textures))
        # a wall, a board or a gap carries next to no texture, and no text, unless its sides are all seams and its face
        # one colour
        per_shelf = [(top, {k: b for k, b in found.items() if b['texture'] >= least or b.get('text', 0) >= TEXT_ALONG
                      or (b['strong'] and b['uni'] <= UNIFORM)}, lines, e)
                     for top, found, lines, e in per_shelf]
        for top, found, lines, e in per_shelf:
            chosen = most_books(found, len(lines))
            # [barcode] books on a shelf stand packed, several together: a lone strip or two is a gap between other things
            if len(chosen) < SHELF_BOOKS:
                continue
            mine = [dict(corners=[(x, y + top) for x, y in found[k]['corners']], fit=found[k]['fit']) for k in chosen]
            # [spine-colour] a region of one colour boxes a book where nothing else does
            taken = [(sp['corners'], area(sp['corners'])) for sp in spines + mine]
            for k, b in found.items():
                c = [(x, y + top) for x, y in b['corners']]
                if k[0] == 'region':
                    size = area(c)
                    if not any(overlap(c, other) > TOUCH * min(size, space) for other, space in taken):
                        mine.append(dict(corners=c, fit=b['fit']))
                        taken.append((c, size))
            # [gap-search] a gap between neighbours is searched again, and a book with none beside it is dropped
            band = None if text is None else text[top:top + e.h]
            mine = lonely_veto(gap_search(e, apart(mine), top, band, GAP_TEXTURE * least))
            spines += mine
    spines = [b['corners'] for b in apart(spines)]
    # [barcode] covers are looked for outside the shelves: the barcode bands, and the spines boxed
    for c in spines:
        c = np.asarray(c)
        x0, x1 = max(0, int(np.floor(c[:, 0].min()))), min(w, int(np.ceil(c[:, 0].max())) + 1)
        y0, y1 = max(0, int(np.floor(c[:, 1].min()))), min(h, int(np.ceil(c[:, 1].max())) + 1)
        if x1 > x0 and y1 > y0:
            yy, xx = np.mgrid[y0:y1, x0:x1]
            shelf[y0:y1, x0:x1] |= points_in_poly(np.stack([xx.ravel(), yy.ravel()], 1), c).reshape(yy.shape)
    shelf = ndi.binary_dilation(shelf, iterations=max(2, int(0.01 * max(h, w))))
    found = covers(edges_in(memo, g, small, 0, h), ~shelf)
    scale = lambda c: [[round(min(max(x, 0), w) / s, 1), round(min(max(y, 0), h) / s, 1)] for x, y in c]
    return ([dict(corners=scale(c), view='spine') for c in spines]
            + [dict(corners=scale(clockwise(c)), view='cover') for c in found if not shelf[int(np.clip(np.mean(c, 0)[1], 0, h - 1)), int(np.clip(np.mean(c, 0)[0], 0, w - 1))]])


def find_run(rgb, text=None):
    """One run of the finder on a photo taken as it comes: the boxes of the run at the work size, then those of a run
    with dark shelves log-stretched that touch none of its boxes, then those of a run at WORK_FINE that touch none kept
    so far. text: the text finder's probability (0 to 1) over the photo, at any size, or None to find without it."""
    memo = {}
    kept = find_once(rgb, text, WORK, False, memo)
    base = list(kept)
    kept += [b for b in find_once(rgb, text, WORK, True, memo) if all(iou(b['corners'], c['corners']) <= ADD_IOU for c in base)]
    del memo
    for b in find_once(rgb, text, WORK_FINE, False):
        if all(iou(b['corners'], c['corners']) <= ADD_IOU for c in kept):
            kept.append(b)
    return kept


def roll_angle(rgb):
    """[camera-roll] The photo's roll, in degrees clockwise (the angle its shelves' boards lie at, minus level), or None
    when no long near-horizontal line stands. Read off the boards, the long edges lying within ROLL_SPAN of level on a
    ROLL_WORK thumbnail (Canny, then a Hough transform; black padding at the frame and the frame's own rim left out): the
    mode of their angles, each weighing its length cubed, refined by the lines within ROLL_NEAR of it. Spines are not
    read: books lean."""
    from PIL import Image
    from skimage.feature import canny
    from skimage.transform import hough_line, hough_line_peaks
    H, W = rgb.shape[:2]
    s = min(1.0, ROLL_WORK / max(H, W))
    im = Image.fromarray(np.ascontiguousarray(rgb[..., :3]))
    t = np.asarray(im.resize((round(W * s), round(H * s)), Image.BOX) if s < 1 else im)
    valid = ~ndi.binary_dilation(padding(t), iterations=5)
    valid[:3] = valid[-3:] = False
    valid[:, :3] = valid[:, -3:] = False
    e = canny(ndi.gaussian_filter(grey(t.astype(np.float32)), 1.0), sigma=1.5) & valid
    thetas = np.radians(np.arange(-ROLL_SPAN, ROLL_SPAN + 0.5, 0.5)) + np.pi / 2
    h, a, d = hough_line(e, theta=thetas)
    acc, ang, _ = hough_line_peaks(h, a, d, min_distance=8, min_angle=3, threshold=ROLL_LINE * e.shape[1], num_peaks=80)
    if len(acc) == 0:
        return None
    w = (acc / e.shape[1]) ** 3
    deg = np.degrees(ang) - 90
    bins = np.arange(-ROLL_SPAN, ROLL_SPAN + 1.0, 1.0)
    mode = bins[int(np.argmax([w[np.abs(deg - b) <= 1.0].sum() for b in bins]))]
    near = np.abs(deg - mode) <= ROLL_NEAR
    return float((deg[near] * w[near]).sum() / w[near].sum())


def padding(t):
    """True where black padding touching the frame lies in a thumbnail: constant black joined to the edge, in a piece of
    at least PAD_LEAST of the thumbnail."""
    black = t[..., :3].max(-1) <= 2
    lab, n = ndi.label(black)
    edge = np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])
    edge = edge[edge > 0]
    if len(edge) == 0:
        return np.zeros(black.shape, bool)
    return np.isin(lab, edge[ndi.sum(black, lab, edge) >= PAD_LEAST * black.size])


def level(rgb, text, deg):
    """[camera-roll] The photo, and its text map at the photo's size, turned by deg degrees clockwise about its centre on a
    canvas that holds it whole, the corners the turn uncovers filled with the photo's median colour (and no text), then
    cropped to the content (black padding of the photo's own left out). Returns the turned photo, its text, and the 3×3
    matrix taking the photo's pixels (x, y) to the turned photo's."""
    H, W = rgb.shape[:2]
    c, s = np.cos(np.radians(deg)), np.sin(np.radians(deg))
    turn = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
    centre = lambda w, h: np.array([[1, 0, w / 2], [0, 1, h / 2], [0, 0, 1]])
    corners = np.array([[0, 0], [W, 0], [W, H], [0, H]]) - [W / 2, H / 2]
    lo, hi = (corners @ turn[:2, :2].T).min(0), (corners @ turn[:2, :2].T).max(0)
    ow, oh = int(np.ceil(hi[0] - lo[0])), int(np.ceil(hi[1] - lo[1]))
    M = centre(ow, oh) @ turn @ np.linalg.inv(centre(W, H))
    inv = np.linalg.inv(M)
    pull = dict(matrix=inv[[1, 0]][:, [1, 0]], offset=inv[[1, 0], 2], output_shape=(oh, ow), order=1)
    from PIL import Image
    t = np.asarray(Image.fromarray(np.ascontiguousarray(rgb[..., :3])).resize((max(1, W // 8), max(1, H // 8)), Image.BOX))
    pad = padding(t)
    content = np.ones((H, W), np.float32)
    if pad.any():
        content = 1 - np.kron(pad, np.ones((8, 8), np.float32))[:H, :W].astype(np.float32)
        content = np.pad(content, ((0, H - content.shape[0]), (0, W - content.shape[1])), constant_values=1)
    valid = ndi.affine_transform(content, cval=0, **pull) > 0.99
    fill = np.median(rgb[::8, ::8, :3][content[::8, ::8] > 0.5], 0) if (content[::8, ::8] > 0.5).any() else np.zeros(3)
    out = np.stack([np.where(valid, ndi.affine_transform(rgb[..., k].astype(np.float32), cval=float(fill[k]), **pull), fill[k])
                    for k in range(3)], -1)
    tx = None
    if text is not None:
        tz = ndi.zoom(np.asarray(text, np.float32), (H / text.shape[0], W / text.shape[1]), order=1)[:H, :W]
        tx = np.where(valid, ndi.affine_transform(tz, cval=0.0, **pull), 0).astype(np.float32)
    ys, xs = np.where(valid)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    crop = np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]])
    return (np.clip(np.rint(out[y0:y1, x0:x1]), 0, 255).astype(np.uint8), None if tx is None else tx[y0:y1, x0:x1], crop @ M)


def quarter(rgb, text, k):
    """The photo, and its text map, turned k quarter turns counter-clockwise on screen, with the 3×3 matrix taking the
    photo's pixels to the turned photo's."""
    M = np.eye(3)
    H, W = rgb.shape[:2]
    for _ in range(k % 4):
        M = np.array([[0, 1, 0], [-1, 0, W], [0, 0, 1]]) @ M
        H, W = W, H
    return np.rot90(rgb, k).copy(), None if text is None else np.rot90(text, k).copy(), M


def map_back(boxes, M):
    """The boxes' corners, in the turned photo's pixels, in the photo's, clockwise from the top left."""
    inv = np.linalg.inv(M)
    out = []
    for b in boxes:
        p = np.c_[np.asarray(b['corners'], float), np.ones(4)] @ inv.T
        out.append(dict(b, corners=[[round(float(x), 1), round(float(y), 1)] for x, y in clockwise(p[:, :2])]))
    return out


def find_rolled(rgb, text, k):
    """[camera-roll] The books of the photo turned k quarter turns, found level, in the turned photo's pixels, with the
    map to them from the photo's: a roll of at least ROLL_LEAST is turned out first."""
    r, t, Mq = quarter(rgb, text, k)
    phi = roll_angle(r)
    if phi is None or abs(phi) < ROLL_LEAST:
        return find_run(r, t), Mq
    r2, t2, Ml = level(r, t, -phi)
    return map_back(find_run(r2, t2), Ml), Mq


def find(rgb, text=None):
    """The books in an RGB photo, [{corners, view}]: the spines shelf by shelf from the top, left to right, then the
    covers lying outside the shelves. text: the text finder's probability (0 to 1) over the photo, at any size, or
    None to find without it. [camera-roll] The photo is found turned level by its roll, and as it lies on its side
    only when it shows fewer than SHELF_ENOUGH books: then the two sideways quarter turns are tried, and a turn counts
    only when it shows at least SHELF_BOOKS books and more than twice as many as the photo as it lies."""
    boxes, M = find_rolled(rgb, text, 0)
    lying = len(boxes)
    if lying < SHELF_ENOUGH:
        best = lying
        for k in (1, 3):
            turned, Mt = find_rolled(rgb, text, k)
            if len(turned) > best and len(turned) >= SHELF_BOOKS and len(turned) > 2 * lying:
                best, boxes, M = len(turned), turned, Mt
    return boxes if np.allclose(M, np.eye(3)) else map_back(boxes, M)


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
    sides, on average; the first corner at the top left. Corners may lie outside the photo, for a book the camera cut
    off: what falls outside it is black."""
    c = np.asarray(corners, np.float64)
    side = lambda a, b: float(np.hypot(*(c[a] - c[b])))
    w = max(1, round((side(0, 1) + side(3, 2)) / 2))
    h = max(1, round((side(0, 3) + side(1, 2)) / 2))
    # pulled: each crop pixel's centre sampled where it falls in the photo
    M = homography([[0, 0], [w, 0], [w, h], [0, h]], c)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64) + 0.5
    p = M @ np.stack([xx.ravel(), yy.ravel(), np.ones(xx.size)])
    X, Y = p[0] / p[2] - 0.5, p[1] / p[2] - 0.5
    H, W = rgb.shape[:2]
    off = (X < -0.5) | (X > W - 0.5) | (Y < -0.5) | (Y > H - 0.5)
    out = np.zeros((h, w, 4), np.uint8)
    out[..., 3] = 255
    if off.all():
        return out
    # only the photo's pixels around the box, with a margin for the interpolation
    x0, y0 = max(0, int(np.floor(X[~off].min())) - 1), max(0, int(np.floor(Y[~off].min())) - 1)
    x1, y1 = min(W, int(np.ceil(X[~off].max())) + 2), min(H, int(np.ceil(Y[~off].max())) + 2)
    at = [Y - y0, X - x0]
    for k in range(3):
        v = ndi.map_coordinates(rgb[y0:y1, x0:x1, k].astype(np.float32), at, order=1, mode='nearest')
        out[..., k] = np.where(off, 0, np.clip(v, 0, 255).round()).reshape(h, w)
    return out
