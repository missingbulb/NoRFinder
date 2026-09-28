"""Three-segment NoR detection: every node is a red (Nav) segment with a separate green (Caspr)
segment on each side, and each candidate is scored by an explicit validation.

python3 nor3.py INPUT.tif OUTDIR [--tl (default) | --fill | --walk | --blobs]

Validation (Ariel, 2026-09-25), all must hold:
  V1  three segments exist: one red, two green
  V2  order green-red-green: the greens sit on opposite sides of the red
  V3  the two greens are separate (not one connected green blob)
  V5  balance: the smaller green has at least a third of the larger green's area
  V5b the two greens' total brightness also within a factor of 3 of each other
  V7  bright: every segment stands >= 3.5 noise-sd above its local background
  V6  stick: length (green end to green end, along the green-to-green axis) / mean width >= 3
  V4  purity: under 20% of a green segment's pixels are red foreground, and vice versa. Measured
      on each segment's core (its 1-px rim next to the other colour is left out), because
      optical blur mixes the colours right at every green-red boundary.
"""
import sys, os, math
import numpy as np
from scipy import ndimage as ndi
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import naive_nor as nn_  # load(), blue_mask(), to8()
nor = nn_.nor

P = dict(
    smooth=0.0,        # px gaussian before classifying pixels (smoothing smears red into green)
    green_frac=0.09,   # fraction of unmasked pixels that may be green foreground
    red_frac=0.04,     # same for red
    min_red=4,         # px
    min_green=4,       # px
    touch=4,           # px: a green must come this close to the red to belong to it
    reach_u=7.0,       # green segment is clipped to this many units from the red centre
    min_opposite=100,  # deg: angle green-red-green must be at least this straight
    min_green_balance=0.33,  # smaller green area / larger green area
    min_snr=3.5,       # dimmest segment's (mean - local background) / background noise
    min_aspect=3.0,    # stick: length / mean width
    rim=1,             # px of each segment next to the other colour left out of V4
    purity=0.20,       # max fraction of a segment's core pixels lit in the other colour
)
EIGHT = np.ones((3, 3), bool)


def classify(caspr, nav, bm, p):
    valid = ~bm
    cn = ndi.gaussian_filter(nor.norm(caspr, valid), p['smooth'])
    rn = ndi.gaussian_filter(nor.norm(nav, valid), p['smooth'])
    cn[bm] = 0; rn[bm] = 0
    tg = np.quantile(cn[valid], 1 - p['green_frac'])
    tr = np.quantile(rn[valid], 1 - p['red_frac'])
    green = (cn > tg) & (cn >= rn) & valid
    red = (rn > tr) & (rn > cn) & valid
    return cn, rn, green, red, tg, tr


def segment(caspr, nav, bm, p=P):
    cn, rn, green, red, tg, tr = classify(caspr, nav, bm, p)
    valid_ = ~bm
    F = (cn, rn, green, red, tg, tr, valid_)
    glab, _ = ndi.label(green, EIGHT)
    rlab, nr = ndi.label(red, EIGHT)
    gsz = np.bincount(glab.ravel())
    # unit: median half-length of green blobs, as in nor.detect
    gobj = ndi.find_objects(glab)
    lens = [max(s[0].stop - s[0].start, s[1].stop - s[1].start) / 2 for i, s in enumerate(gobj)
            if s is not None and gsz[i + 1] >= p['min_green']]
    unit = float(np.median(lens)); reach = p['reach_u'] * unit
    H, W = red.shape
    cands = []
    for i, sl in enumerate(ndi.find_objects(rlab), start=1):
        pad = int(math.ceil(reach)) + 2
        y0, y1 = max(0, sl[0].start - pad), min(H, sl[0].stop + pad)
        x0, x1 = max(0, sl[1].start - pad), min(W, sl[1].stop + pad)
        rs = rlab[y0:y1, x0:x1] == i
        if rs.sum() < p['min_red']:
            continue
        ys, xs = np.nonzero(rs); cy, cx = ys.mean(), xs.mean()
        gl = glab[y0:y1, x0:x1]
        yy, xx = np.mgrid[0:y1 - y0, 0:x1 - x0]
        near = np.hypot(yy - cy, xx - cx) <= reach
        ring = ndi.binary_dilation(rs, EIGHT, iterations=p['touch']) & ~rs
        adj = [g for g in np.unique(gl[ring]) if g > 0]
        c = dict(cy=cy + y0, cx=cx + x0, box=(y0, x0), red=rs, greens=[], fail=None, unit=unit)
        segs = []
        for g in adj:
            m = (gl == g) & near
            if m.sum() >= p['min_green']:
                gy, gx = np.nonzero(m)
                segs.append((g, m, np.arctan2(gy.mean() - cy, gx.mean() - cx)))
        # V1/V3: need two separate green blobs
        if len(segs) == 0:
            c['fail'] = 'no green'
        elif len(segs) == 1:
            # one blob: either one-sided, or both paranodes merged into one (V3)
            g, m, _ = segs[0]
            gy, gx = np.nonzero(m)
            ang = np.arctan2(gy - cy, gx - cx)
            spread = np.degrees(np.ptp(np.unwrap(np.sort(ang))))
            c['fail'] = 'greens joined' if spread > 200 else 'one green'
            c['greens'] = [m]
        else:
            # V2: most opposite pair
            best = None
            for a in range(len(segs)):
                for b in range(a + 1, len(segs)):
                    d = abs((segs[a][2] - segs[b][2] + np.pi) % (2 * np.pi) - np.pi)
                    if best is None or d > best[0]:
                        best = (d, a, b)
            d, a, b = best
            c['greens'] = [segs[a][1], segs[b][1]]
            c['opp_deg'] = float(np.degrees(d))
        finish(c, F, p)
        cands.append(c)
    resolve_overlaps(cands, red.shape)
    return cands, dict(unit=unit, n_red=nr)


# the settings the page shows first for this finder; the rest sit under Advanced
segment.MAIN = ('green_frac', 'red_frac', 'touch', 'reach_u')


# Checks that need two greens; each returns True when the candidate FAILS it.
CHECKS = {
    'not in a line':  lambda c, p: (c['opp_deg'] < p['min_opposite']
                                    or c.get('red_off_u', 0) > p.get('max_off_u', 99)
                                    or c.get('axis_dev', 0) > p.get('max_axis_dev', 180)),
    'red impure':     lambda c, p: c['red_purity'] >= p['purity'],
    'green impure':   lambda c, p: max(c['green_purity']) >= p['purity'],
    'greens unequal': lambda c, p: c['green_balance'] < p['min_green_balance'],
    'greens unequal brightness': lambda c, p: c['green_bright_balance'] < p['min_green_balance'],
    'not stick-like': lambda c, p: c['aspect'] < p['min_aspect'] or c.get('solid', 1) < p.get('min_solid', 0),
    'dim':            lambda c, p: c['snr'] < p['min_snr'],
}
# toughest judge first: ordered by how many two-green candidates each check rejects on its own
ORDER = ['greens unequal brightness', 'greens unequal', 'dim', 'red impure',
         'not in a line', 'not stick-like', 'green impure']


def judge(c, p, order=None):
    """Structural failures (no/one/joined green) are set while segmenting; the rest run in order."""
    if c['fail'] is not None or len(c['greens']) != 2:
        return
    c['fails_all'] = [k for k in CHECKS if CHECKS[k](c, p)]
    for k in (order or ORDER):
        if k in c['fails_all']:
            c['fail'] = k
            return


def finish(c, F, p):
    """All per-candidate measurements, then the checks. F holds the image-wide maps."""
    cn, rn, green, red, tg, tr, valid_ = F
    y0, x0 = c['box']; rs = c['red']; y1, x1 = y0 + rs.shape[0], x0 + rs.shape[1]
    # V4: purity on segment cores
    sub_c, sub_r = cn[y0:y1, x0:x1], rn[y0:y1, x0:x1]
    allg = np.zeros_like(rs)
    for m in c['greens']:
        allg |= m
    rc = rs & ~ndi.binary_dilation(allg, EIGHT, iterations=p["rim"])
    gcs = [m & ~ndi.binary_dilation(rs, EIGHT, iterations=p["rim"]) for m in c["greens"]]
    c['red_purity'] = float((sub_c[rc] > tg).mean()) if rc.any() else 1.0
    c['green_purity'] = [float((sub_r[m] > tr).mean()) if m.any() else 1.0 for m in gcs]
    c['red_mean'] = float(sub_r[rs].mean())
    c['green_sums'] = [float(sub_c[m].sum()) for m in c['greens']]
    c['green_means'] = [float(sub_c[m].mean()) for m in c['greens']]
    # brightness of the node as a whole: its dimmest segment, each in its own colour
    c['brightness'] = min([c['red_mean']] + c['green_means']) if c['greens'] else c['red_mean']
    # contrast against local background (Rose criterion): (segment mean - background) / noise,
    # background = pixels in this window that are neither green nor red foreground
    bgpix = ~(green[y0:y1, x0:x1] | red[y0:y1, x0:x1]) & valid_[y0:y1, x0:x1]
    snr = []
    for img_, segs_ in ((sub_r, [rs]), (sub_c, c['greens'])):
        b = img_[bgpix]
        if b.size < 20:
            snr.append(0.0); continue
        med = np.median(b); sd = 1.4826 * np.median(np.abs(b - med)) + 1e-6
        snr += [float((img_[m].mean() - med) / sd) for m in segs_]
    c['snr'] = min(snr)
    if len(c['greens']) == 2:
        measure(c)
        c['green_bright_balance'] = min(c['green_sums']) / max(max(c['green_sums']), 1e-9)
        g1, g2 = c['greens']
        p1 = np.array(np.nonzero(g1)).mean(1); p2 = np.array(np.nonzero(g2)).mean(1)
        pr = np.array(np.nonzero(rs)).mean(1); ax = (p2 - p1) / max(np.hypot(*(p2 - p1)), 1e-9)
        c['red_off_u'] = float(abs((pr - p1)[0] * ax[1] - (pr - p1)[1] * ax[0]) / c['unit'])
        if 'comb' in c:
            d = abs((np.arctan2(ax[0], ax[1]) - c['comb'] + np.pi / 2) % np.pi - np.pi / 2)
            c['axis_dev'] = float(np.degrees(d))
    judge(c, p)


def resolve_overlaps(cands, shape, max_shared=0.3):
    """A pixel can belong to one NoR only. Passing candidates claim their pixels strongest first
    (by the brightness of their red, the node itself); one whose red is already claimed, or whose
    green is more than `max_shared` claimed, is a duplicate of a stronger NoR and fails with
    'shares a segment'."""
    H, W = shape
    claimed = np.zeros((H, W), bool)
    for c in sorted([c for c in cands if c['fail'] is None], key=lambda c: -c['red_mean']):
        y0, x0 = c['box']; h, w = c['red'].shape; cl = claimed[y0:y0 + h, x0:x0 + w]
        if (cl & c['red']).any() or any((cl & g).sum() > max_shared * g.sum() for g in c['greens']):
            c['fail'] = 'shares a segment'; continue
        cl |= c['red']
        for g in c['greens']:
            cl |= g


def measure(c):
    """Geometry along the stick axis, which runs from one green's centroid to the other's.
    length: extent of green+red+green along the axis; width: its area / length (mean width,
    so a ragged pixel on the edge does not count as the width)."""
    g1, g2, r = c['greens'][0], c['greens'][1], c['red']
    a1, a2 = g1.sum(), g2.sum()
    c['green_balance'] = float(min(a1, a2) / max(a1, a2))
    p1 = np.array(np.nonzero(g1)).mean(1); p2 = np.array(np.nonzero(g2)).mean(1)
    ax = p2 - p1; ax = ax / max(np.hypot(*ax), 1e-9)          # (dy, dx)
    union = g1 | g2 | r
    ys, xs = np.nonzero(union); t = ys * ax[0] + xs * ax[1]
    length = float(t.max() - t.min() + 1)
    ry, rx = np.nonzero(r); tr_ = ry * ax[0] + rx * ax[1]
    c['length_px'] = length
    c['red_len_px'] = float(tr_.max() - tr_.min() + 1)
    c['width_px'] = float(union.sum() / length)
    c['aspect'] = length / c['width_px']
    c['axis'] = ax
    # the measuring lines, in box pixel coordinates (y, x): the length line runs along the axis
    # through the stick's middle; the width line crosses it at the red's centre
    nv = np.array([ax[1], -ax[0]])
    sc = float((ys * nv[0] + xs * nv[1]).mean())
    pt = lambda t, s_: (t * ax[0] + s_ * nv[0], t * ax[1] + s_ * nv[1])
    t0, t1 = t.min() - 0.5, t.max() + 0.5
    r0, r1 = tr_.min() - 0.5, tr_.max() + 0.5
    tm = float(tr_.mean()); hw = c['width_px'] / 2
    c['lines'] = dict(length=(pt(t0, sc), pt(t1, sc)), red=(pt(r0, sc), pt(r1, sc)),
                      width=(pt(tm, sc - hw), pt(tm, sc + hw)))
    # a stick is solid along its length: how much of the length line runs over its own pixels
    ts_ = np.arange(t0, t1 + 0.01, 0.5)
    py = np.round(ts_ * ax[0] + sc * nv[0]).astype(int); px = np.round(ts_ * ax[1] + sc * nv[1]).astype(int)
    inside = (py >= 0) & (py < union.shape[0]) & (px >= 0) & (px < union.shape[1])
    fat = ndi.binary_dilation(union, EIGHT)
    c['solid'] = float(fat[py[inside], px[inside]].sum() / max(len(ts_), 1))


def paint(canvas_mask_list, shape, Z):
    """1-px (at zoom Z) rings just outside each mask."""
    ring = np.zeros((shape[0] * Z, shape[1] * Z), bool)
    for (y0, x0), m in canvas_mask_list:
        up = np.kron(m, np.ones((Z, Z), bool))
        r = ndi.binary_dilation(up) & ~up
        Y0, X0 = y0 * Z, x0 * Z
        ring[Y0:Y0 + r.shape[0], X0:X0 + r.shape[1]] |= r
    return ring


def seg_masks(c):
    return [(c['box'], c['red'])] + [(c['box'], g) for g in c['greens']]


def contact(rgb_up, cands, Z, S, title_fn, path, color):
    if not cands:
        Image.new('RGB', (200, 40), (40, 40, 40)).save(path); return
    cols = int(math.ceil(math.sqrt(len(cands)) * 1.3)); rows = int(math.ceil(len(cands) / cols))
    cell = S * Z; pad = 4; lab = 12
    sheet = Image.new('RGB', (cols * (cell + pad) + pad, rows * (cell + pad + lab) + pad), (40, 40, 40))
    sd = ImageDraw.Draw(sheet)
    Hh, Ww = rgb_up.shape[:2]
    for k, c in enumerate(cands):
        cy, cx = int(round(c['cy'] * Z)), int(round(c['cx'] * Z))
        y0, x0 = cy - cell // 2, cx - cell // 2
        tile = np.zeros((cell, cell, 3), np.uint8)
        ys0, xs0 = max(0, y0), max(0, x0); ys1, xs1 = min(Hh, y0 + cell), min(Ww, x0 + cell)
        tile[ys0 - y0:ys1 - y0, xs0 - x0:xs1 - x0] = rgb_up[ys0:ys1, xs0:xs1]
        i, j = divmod(k, cols)
        X = pad + j * (cell + pad); Y = pad + i * (cell + pad + lab)
        sheet.paste(Image.fromarray(tile), (X, Y + lab)); sd.text((X + 1, Y), title_fn(k, c), fill=color)
    sheet.save(path)


# ---------------------------------------------------------------- "walk along the fibre" candidates
P2 = dict(P, touch=6, strip=1.5, bend=30, max_green_u=4, seed_smooth=0.7, seed_nms=5, angle_step=7.5, band_u=1.2, hyst=0.8)


def segment_walk(caspr, nav, bm, p=P2):
    """Find a red dot, find which way its fibre runs (the direction with green on BOTH sides),
    then walk out both ways along that line: red first, then green on each side.

    One candidate per red peak; the axis comes from the greens, so a paranode broken into
    speckles by pixel noise is still found as one green segment along the line."""
    cn, rn, green, red, tg, tr = classify(caspr, nav, bm, p)
    valid_ = ~bm
    F = (cn, rn, green, red, tg, tr, valid_)
    s = p['seed_smooth']
    cs_, rs_ = ndi.gaussian_filter(cn, s), ndi.gaussian_filter(rn, s)
    gS = (cs_ > tg) & (cs_ >= rs_) & valid_          # smoothed colour classes: segment shapes
    rS = (rs_ > tr) & (rs_ > cs_) & valid_
    # unit, as in segment()
    glab, _ = ndi.label(green, EIGHT); gsz = np.bincount(glab.ravel())
    lens = [max(sl[0].stop - sl[0].start, sl[1].stop - sl[1].start) / 2
            for i, sl in enumerate(ndi.find_objects(glab)) if sl is not None and gsz[i + 1] >= p['min_green']]
    unit = float(np.median(lens)); reach = p['reach_u'] * unit; half_w = p['band_u'] * unit
    # seeds: red peaks
    peak = (rs_ == ndi.maximum_filter(rs_, size=p['seed_nms'])) & rS
    sy, sx = np.nonzero(peak)
    order = np.argsort(-rs_[sy, sx])
    H, W = cn.shape
    ts = np.arange(1.0, reach, 0.5)
    angs = np.radians(np.arange(0, 180, p['angle_step']))
    used = np.zeros((H, W), bool)
    cands = []
    for k in order:
        cy, cx = float(sy[k]), float(sx[k])
        if used[int(cy), int(cx)]:
            continue
        # 1. fibre direction: the angle whose weaker side still has the most green
        best = None
        for a in angs:
            dy, dx = np.sin(a), np.cos(a)
            sides = [nor._bilinear(cs_, cy + sg * dy * ts, cx + sg * dx * ts).max() for sg in (1, -1)]
            if best is None or min(sides) > best[0]:
                best = (min(sides), a)
        a = best[1]; dy, dx = np.sin(a), np.cos(a)
        # 2. walk out each way from the red dot. Each side may bend a little (axons curve), so
        # each side tries a few directions near the axis and keeps the one that reaches green.
        tt = np.arange(0.0, reach + 0.25, 0.5)
        offs = np.arange(-p['strip'], p['strip'] + 0.01, 0.5)
        bends = np.radians([0] + [b for d in range(10, p['bend'] + 1, 10) for b in (d, -d)])
        def walk(ang):
            ddy, ddx = np.sin(ang), np.cos(ang)
            # a strip, not a hairline: the strongest green across the fibre's width at each step
            gp = np.max([nor._bilinear(cs_, cy + ddy * tt - ddx * o, cx + ddx * tt + ddy * o) for o in offs], 0)
            rp = nor._bilinear(rs_, cy + ddy * tt, cx + ddx * tt)
            i = 0
            while i + 1 < len(tt) and rp[i + 1] > p['hyst'] * tr and rp[i + 1] >= gp[i + 1]:
                i += 1
            red_end = tt[i]; j = i; found = None
            while j + 1 < len(tt) and tt[j + 1] - red_end <= p['touch'] + 0.5:
                j += 1
                if gp[j] > tg and gp[j] >= rp[j]:
                    found = j; break
            if found is None:
                return red_end, None, 0.0
            e = found
            while (e + 1 < len(tt) and gp[e + 1] > p['hyst'] * tg and gp[e + 1] >= rp[e + 1]
                   and tt[e + 1] - tt[found] <= p['max_green_u'] * unit):
                e += 1
            return red_end, (tt[found], tt[e]), float(gp[found:e + 1].sum())
        sides = []
        for base in (a, a + np.pi):
            best_s = None
            for bnd in bends:
                red_end, gint, score = walk(base + bnd)
                if best_s is None or score > best_s[3] + 1e-9:
                    best_s = (base + bnd, red_end, gint, score)
            sides.append(best_s)
        # 3. cut the segments out of the image: colour class, inside a strip, in the interval
        pad = int(math.ceil(reach)) + 2
        y0, y1 = max(0, int(cy) - pad), min(H, int(cy) + pad + 1)
        x0, x1 = max(0, int(cx) - pad), min(W, int(cx) + pad + 1)
        yy, xx = np.mgrid[y0:y1, x0:x1]
        def frame(ang):
            ddy, ddx = np.sin(ang), np.cos(ang)
            return (yy - cy) * ddy + (xx - cx) * ddx, -(yy - cy) * ddx + (xx - cx) * ddy
        def piece(cls, along, perp, lo, hi, anchor_px):
            m = cls[y0:y1, x0:x1] & (np.abs(perp) <= half_w) & (along >= lo - 0.5) & (along <= hi + 0.5)
            lab, n = ndi.label(m, EIGHT)
            keep = np.unique(lab[anchor_px & m]); keep = keep[keep > 0]
            return np.isin(lab, keep) if keep.size else np.zeros_like(m)
        along, perp = frame(a)
        rs_mask = piece(rS, along, perp, -sides[1][1], sides[0][1], (np.abs(perp) <= 1.0) & (np.abs(along) <= 1.0))
        if rs_mask.sum() < p['min_red']:
            continue
        used[y0:y1, x0:x1] |= ndi.binary_dilation(rs_mask, EIGHT)
        c = dict(cy=cy, cx=cx, box=(y0, x0), red=rs_mask, greens=[], fail=None, unit=unit, walk_ang=a)
        gm = []
        for ang, red_end, gint, score in sides:
            if gint is None:
                continue
            al, pe = frame(ang)
            gm.append(piece(gS, al, pe, gint[0], gint[1], np.abs(pe) <= 1.0) & ~rs_mask)
        gm = [m for m in gm if m is not None and m.sum() >= p['min_green']]
        if len(gm) == 0:
            c['fail'] = 'no green'
        elif len(gm) == 1:
            c['fail'] = 'one green'; c['greens'] = gm
        else:
            c['greens'] = gm
            u = gm[0] | gm[1]
            if ndi.label(u, EIGHT)[1] < 2 or (gm[0] & gm[1]).any():
                c['fail'] = 'greens joined'
            ry, rx = np.nonzero(rs_mask); rcy, rcx = ry.mean(), rx.mean()
            ang = [np.arctan2(*(np.array(np.nonzero(m)).mean(1) - (rcy, rcx))) for m in gm]
            c['opp_deg'] = float(np.degrees(abs((ang[0] - ang[1] + np.pi) % (2 * np.pi) - np.pi)))
        finish(c, F, p)
        cands.append(c)
    resolve_overlaps(cands, cn.shape)
    return cands, dict(unit=unit, n_red=len(sy))


segment_walk.MAIN = ('green_frac', 'red_frac', 'seed_smooth', 'strip', 'bend', 'max_green_u')


# ---------------------------------------------------------------- "walk, land, colour in" candidates
# Every size here is in units of the image's own green length (`unit`), never in pixels.
P3 = dict(P, smooth_u=0.25, nms_u=1.7, strip_u=0.5, touch_u=2.0, reach_u=7.0,
          angle_step=7.5, bend=10, half=0.35, own_side=True,
          comb_u=3.0, comb_window=15, fg=1.0, valleys=True,
          min_area_u2=1.0, valley_depth=0.25, max_off_u=1.0, max_axis_dev=25, snap_u=0.5, min_green_u2=1.0, green_dom=1.0, min_solid=0.8)


def segment_fill(caspr, nav, bm, p=P3):
    """How to find a node, told to a child:
      1. Find a bright red dot.
      2. Turn around until you are looking along the fibre: that is the way with green on
         BOTH sides of the dot.
      3. Walk out each way (a gentle bend is fine). You leave the red and step onto green.
         Keep walking while the green gets brighter; you stop once it has faded to half of
         the brightest green you saw. The brightest spot is where you "landed".
      4. Colour in each of the three blobs like a colouring book, starting from the red dot
         and from each landing spot: colour a neighbouring pixel if it is still mostly that
         colour and at least half as bright as where you started. Where it gets dimmer than
         half, that is the blob's edge.
    Stops are relative (half of each blob's own peak), and every distance is in units."""
    cn, rn, green, red, tg, tr = classify(caspr, nav, bm, p)
    valid_ = ~bm
    F = (cn, rn, green, red, tg, tr, valid_)
    glab, _ = ndi.label(green, EIGHT); gsz = np.bincount(glab.ravel())
    lens = [max(sl[0].stop - sl[0].start, sl[1].stop - sl[1].start) / 2
            for i, sl in enumerate(ndi.find_objects(glab)) if sl is not None and gsz[i + 1] >= p['min_green']]
    unit = float(np.median(lens))
    reach = p['reach_u'] * unit; touch = p['touch_u'] * unit; strip = p['strip_u'] * unit
    cs_ = ndi.gaussian_filter(cn, p['smooth_u'] * unit); rs_ = ndi.gaussian_filter(rn, p['smooth_u'] * unit)
    nms = max(3, 2 * int(round(p['nms_u'] * unit / 2)) + 1)
    # the way the fibres are combed around each point: structure tensor of green+red,
    # averaged over `comb_u` units; fibres run along the tensor's weak direction
    S = cs_ + rs_
    gy_, gx_ = np.gradient(ndi.gaussian_filter(S, p['smooth_u'] * unit))
    w = p['comb_u'] * unit
    Jxx, Jyy, Jxy = (ndi.gaussian_filter(v, w) for v in (gx_ * gx_, gy_ * gy_, gx_ * gy_))
    comb = 0.5 * np.arctan2(2 * Jxy, Jxx - Jyy) + np.pi / 2      # along-fibre angle
    # hills of green: each green peak owns the pixels that run downhill to it, so colouring in
    # stops in the valley where one green piece ends and the next begins
    from skimage.segmentation import watershed
    # a valley only counts if it dips at least `valley_depth` x the foreground level below
    # both hills; shallower dips inside one paranode do not split it
    from skimage.morphology import h_maxima
    gpk = h_maxima(cs_, p['valley_depth'] * tg).astype(bool) & (cs_ > tg) & valid_
    gmk, _ = ndi.label(gpk)
    gbasin = watershed(-cs_, gmk, mask=(cs_ > p['fg'] * tg) & valid_) if p['valleys'] else None
    peak = (rs_ == ndi.maximum_filter(rs_, size=nms)) & (rs_ > tr) & (rs_ > cs_) & valid_
    sy, sx = np.nonzero(peak)
    order = np.argsort(-rs_[sy, sx])
    H, W = cn.shape
    step = 0.5
    tt = np.arange(0.0, reach + step / 2, step)
    offs = np.linspace(-strip, strip, 5)
    angs = np.radians(np.arange(0, 180, p['angle_step']))
    bends = np.radians([0] + [b for d in range(10, p['bend'] + 1, 10) for b in (d, -d)])
    used = np.zeros((H, W), bool)
    cands = []
    for k in order:
        cy, cx = float(sy[k]), float(sx[k])
        if used[int(cy), int(cx)]:
            continue
        r0 = rs_[int(cy), int(cx)]
        # 2. look along the fibre: the direction whose weaker side has the most green
        best = None
        c0 = comb[int(cy), int(cx)]
        cand_angs = angs if p['comb_window'] >= 90 else c0 + np.radians(
            np.arange(-p['comb_window'], p['comb_window'] + 0.1, p['angle_step']))
        for a in cand_angs:
            dy, dx = np.sin(a), np.cos(a)
            sides = [nor._bilinear(cs_, cy + sg * dy * tt, cx + sg * dx * tt).max() for sg in (1, -1)]
            if best is None or min(sides) > best[0]:
                best = (min(sides), a)
        a = best[1]

        # 3. walk out: leave the red, step onto green, keep going until green halves; land at its peak
        def walk(ang):
            ddy, ddx = np.sin(ang), np.cos(ang)
            gp = np.max([nor._bilinear(cs_, cy + ddy * tt - ddx * o, cx + ddx * tt + ddy * o) for o in offs], 0)
            rp = nor._bilinear(rs_, cy + ddy * tt, cx + ddx * tt)
            i = 0
            while i + 1 < len(tt) and rp[i + 1] >= p['half'] * r0 and rp[i + 1] >= gp[i + 1]:
                i += 1
            red_end = tt[i]; j = i; start = None
            while j + 1 < len(tt) and tt[j + 1] - red_end <= touch:
                j += 1
                if gp[j] > tg and gp[j] >= rp[j]:
                    start = j; break
            if start is None:
                return None
            top = start; e = start
            while e + 1 < len(tt) and gp[e + 1] >= rp[e + 1] and gp[e + 1] >= p['half'] * gp[top]:
                e += 1
                if gp[e] > gp[top]:
                    top = e
            # landing spot: the brightest green pixel across the strip at the peak step
            o = offs[int(np.argmax([nor._bilinear(cs_, np.array([cy + ddy * tt[top] - ddx * o]),
                                                  np.array([cx + ddx * tt[top] + ddy * o]))[0] for o in offs]))]
            return (cy + ddy * tt[top] - ddx * o, cx + ddx * tt[top] + ddy * o, float(gp[top]), ang)
        lands = []
        for base in (a, a + np.pi):
            hits = [h for h in (walk(base + b) for b in bends) if h is not None]
            lands.append(max(hits, key=lambda h: h[2]) if hits else None)

        # 4. colour in each blob from its starting spot, down to half its own brightness
        pad = int(math.ceil(reach)) + 2
        y0, y1 = max(0, int(cy) - pad), min(H, int(cy) + pad + 1)
        x0, x1 = max(0, int(cx) - pad), min(W, int(cx) + pad + 1)
        csw, rsw, vw = cs_[y0:y1, x0:x1], rs_[y0:y1, x0:x1], valid_[y0:y1, x0:x1]
        snap = max(1.0, p['snap_u'] * unit)
        def colour_in(mask, py, px, bright=None):
            # start from the brightest qualifying pixel within `snap` of the landing spot, so a
            # landing that falls one pixel off the blob (or on its yellow rim) still colours it in
            yy_, xx_ = np.mgrid[0:mask.shape[0], 0:mask.shape[1]]
            near = mask & (np.hypot(yy_ - (py - y0), xx_ - (px - x0)) <= snap)
            if not near.any():
                return np.zeros_like(mask)
            val = np.where(near, bright if bright is not None else 1.0, -1)
            sy_, sx_ = np.unravel_index(np.argmax(val), val.shape)
            lab, _ = ndi.label(mask, EIGHT)
            return lab == lab[sy_, sx_]
        # edge = where it gets dimmer than half its own peak, or drops out of the foreground
        rs_mask = colour_in((rsw >= max(p['half'] * r0, p['fg'] * tr)) & (rsw > csw) & vw, cy, cx, rsw)
        if rs_mask.sum() < p['min_area_u2'] * unit ** 2:
            continue
        used[y0:y1, x0:x1] |= rs_mask
        c = dict(cy=cy, cx=cx, box=(y0, x0), red=rs_mask, greens=[], fail=None, unit=unit, walk_ang=a,
                 comb=float(comb[int(cy), int(cx)]))
        gm = []
        yyw, xxw = np.mgrid[y0:y1, x0:x1]
        along_a = (yyw - cy) * np.sin(a) + (xxw - cx) * np.cos(a)
        for sg, h in zip((1, -1), lands):
            if h is None:
                continue
            ly, lx, gpk, _ = h
            ly, lx = min(max(ly, 0), H - 1), min(max(lx, 0), W - 1)
            g0 = cs_[int(round(ly)), int(round(lx))]
            side = (sg * along_a > 0) if p['own_side'] else True
            # a green pixel may carry some red (the yellow rim where paranode meets node)
            gcl = (csw >= max(p['half'] * g0, p['fg'] * tg)) & (csw >= p['green_dom'] * rsw) & vw & ~rs_mask & side
            if gbasin is not None:
                # the hill the landing spot belongs to (nearest labelled pixel if it sits on a rim)
                gw = gbasin[y0:y1, x0:x1]
                yy_, xx_ = np.mgrid[0:gw.shape[0], 0:gw.shape[1]]
                dd = np.where(gw > 0, np.hypot(yy_ - (ly - y0), xx_ - (lx - x0)), np.inf)
                b = gw.flat[np.argmin(dd)] if np.isfinite(dd.min()) and dd.min() <= snap else 0
                gcl &= (gw == b) if b > 0 else False
            m = colour_in(gcl, ly, lx, csw)
            c.setdefault('dbg', []).append((sg, round(ly, 1), round(lx, 1), round(float(g0), 3), int(m.sum()),
                                            int(gbasin[int(round(ly)), int(round(lx))]) if gbasin is not None else -1))
            if m.sum() >= p['min_green_u2'] * unit ** 2:
                gm.append(m)
        if len(gm) == 2 and (gm[0] & gm[1]).any():
            c['fail'] = 'greens joined'; c['greens'] = [gm[0]]
        elif len(gm) == 0:
            c['fail'] = 'no green'
        elif len(gm) == 1:
            c['fail'] = 'one green'; c['greens'] = gm
        else:
            c['greens'] = gm
            ry, rx = np.nonzero(rs_mask); rcy, rcx = ry.mean(), rx.mean()
            ang = [np.arctan2(*(np.array(np.nonzero(m)).mean(1) - (rcy, rcx))) for m in gm]
            c['opp_deg'] = float(np.degrees(abs((ang[0] - ang[1] + np.pi) % (2 * np.pi) - np.pi)))
        finish(c, F, p)
        cands.append(c)
    resolve_overlaps(cands, cn.shape)
    return cands, dict(unit=unit, n_red=len(sy))


segment_fill.MAIN = ('green_frac', 'red_frac', 'smooth_u', 'half', 'bend', 'reach_u')


PINK, BLUE = (255, 105, 200), (0, 140, 255)
A_GREEN = A_RED = 0.6          # outline opacity (40% transparent)
# rejection reason -> (letter, colour of the letter)
REASONS = {
    'one green':      ('A', (255, 255, 0)),
    'greens joined':  ('B', (255, 150, 0)),
    'not in a line':  ('C', (0, 255, 255)),
    'red impure':     ('D', (255, 255, 255)),
    'green impure':   ('E', (160, 255, 120)),
    'greens unequal': ('F', (200, 160, 255)),
    'not stick-like': ('G', (255, 200, 150)),
    'greens unequal brightness': ('H', (255, 120, 120)),
    'dim':            ('I', (170, 170, 170)),
    'shares a segment': ('J', (120, 220, 255)),
}
REASON_TEXT = {
    'one green': 'only one green touches the red',
    'greens joined': 'the two greens touch (one blob)',
    'not in a line': 'not along the fibre (bent, red off-line, or axis off)',
    'red impure': 'red segment >20% green pixels',
    'green impure': 'a green segment >20% red pixels',
    'greens unequal': 'smaller green < 1/4 of larger',
    'not stick-like': 'length/width < 3, or gaps along its length',
    'greens unequal brightness': 'dimmer green < 1/4 of brighter (total)',
    'dim': 'a segment < 3.5 noise-sd over background',
    'shares a segment': 'overlaps a stronger NoR (duplicate)',
}


def blend(img, mask, color, alpha):
    img[mask] = (img[mask] * (1 - alpha) + np.array(color) * alpha).astype(np.uint8)


def main(inp, out, method='fill'):
    os.makedirs(out, exist_ok=True)
    caspr, nav, um, dapi = nn_.load(inp)
    bm = nn_.blue_mask(dapi)
    finders = {'fill': segment_fill, 'walk': segment_walk, 'blobs': segment}
    if method == 'tl':
        import nor_tl; finders['tl'] = nor_tl.segment_tl
    cands, info = finders[method](caspr, nav, bm)
    from collections import Counter
    fails = Counter(c['fail'] for c in cands if c['fail'])
    # every candidate with at least one green; bare red specks ('no green') are left off
    shown = sorted([c for c in cands if c['fail'] is None or c['fail'] in REASONS],
                   key=lambda c: (c['cy'], c['cx']))
    ok = [c for c in shown if c['fail'] is None]
    print('unit', round(info['unit'], 2), 'red blobs', len(cands), 'shown', len(shown), 'pass', len(ok), dict(fails))
    H, W = caspr.shape; Z = 3
    rgb = np.zeros((H, W, 3), np.uint8); rgb[..., 0] = nn_.to8(nav); rgb[..., 1] = nn_.to8(caspr)
    base = np.repeat(np.repeat(rgb, Z, 0), Z, 1)
    ov = base.copy()
    for group, col in ((ok, PINK), ([c for c in shown if c['fail']], BLUE)):
        blend(ov, paint([(c['box'], g) for c in group for g in c['greens']], (H, W), Z), col, A_GREEN)
        blend(ov, paint([(c['box'], c['red']) for c in group], (H, W), Z), col, A_RED)
    from PIL import ImageFont
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 12)
    bold = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 12)
    mono = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 15)
    img = Image.fromarray(ov); d = ImageDraw.Draw(img)
    # measuring lines on every accepted NoR: length and width in white, the red stretch thicker
    for c in ok:
        y0, x0 = c['box']
        z = lambda q: ((x0 + q[1] + 0.5) * Z, (y0 + q[0] + 0.5) * Z)
        L = c['lines']
        d.line([z(L['length'][0]), z(L['length'][1])], fill=(255, 255, 255), width=1)
        d.line([z(L['width'][0]), z(L['width'][1])], fill=(255, 255, 255), width=1)
        d.line([z(L['red'][0]), z(L['red'][1])], fill=(255, 255, 255), width=2)
    rows = []; f = um or 1.0
    for k, c in enumerate(shown, start=1):
        y0, x0 = c['box']; u = c['red'].copy()
        for g in c['greens']:
            u |= g
        ys, xs = np.nonzero(u)
        X, Y = (x0 + xs.max() + 1) * Z, (y0 + ys.min()) * Z - 13
        num = str(k)
        d.text((X, Y), num, fill=PINK if c['fail'] is None else BLUE, font=font)
        letter = ''
        if c['fail']:
            letter, lc = REASONS[c['fail']]
            d.text((X + d.textlength(num, font=font) + 1, Y), letter, fill=lc, font=bold)
        m = 'length_px' in c
        rows.append((k, letter or 'pass', round(c['cx']), round(c['cy']),
                     c['length_px'] * f if m else None, c['red_len_px'] * f if m else None,
                     c['red_len_px'] / c['length_px'] if m else None, c['aspect'] if m else None))
    unit = 'um' if um else 'px'
    import csv
    fmt = lambda v, s: '' if v is None else format(v, s)
    with open(f'{out}/nor_candidates.csv', 'w', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['n', 'result', 'reason', 'x_px', 'y_px', f'length_{unit}', f'red_length_{unit}', 'red_over_length', 'length_over_width'])
        inv = {v[0]: k for k, v in REASONS.items()}
        for r in rows:
            w.writerow([r[0], r[1], inv.get(r[1], ''), r[2], r[3], fmt(r[4], '.2f'), fmt(r[5], '.2f'), fmt(r[6], '.2f'), fmt(r[7], '.1f')])
    # side panel: legend, then the list of every shown candidate
    lh = 19; top = 36 + lh * (len(REASONS) + 4)
    per_col = (img.height - top - 10) // lh - 1
    ncol = max(1, math.ceil(len(rows) / per_col)); colw = 360
    panel = Image.new('RGB', (max(ncol * colw + 20, 700), img.height), (20, 20, 20)); pd = ImageDraw.Draw(panel)
    pd.text((10, 8), f'{len(shown)} candidates top to bottom: {len(ok)} pass (pink), {len(shown) - len(ok)} fail (blue)', fill=(230, 230, 230), font=mono)
    pd.text((10, 8 + lh), f'Not drawn: {fails["no green"]} red specks with no green next to them', fill=(150, 150, 150), font=mono)
    for i, (reason, (L, col)) in enumerate(REASONS.items()):
        pd.text((10, 8 + lh * (i + 3)), L, fill=col, font=mono)
        pd.text((30, 8 + lh * (i + 3)), f'{REASON_TEXT[reason]}  ({fails[reason]})', fill=(230, 230, 230), font=mono)
    head = '   #  res   length  red  red/len  L/W'
    for j in range(ncol):
        X = 10 + j * colw; pd.text((X, top), head, fill=(150, 150, 150), font=mono)
        for i, r in enumerate(rows[j * per_col:(j + 1) * per_col]):
            Y = top + (i + 1) * lh
            nums = '' if r[4] is None else f'{r[4]:6.2f} {r[5]:5.2f}  {r[6]:5.2f} {r[7]:5.1f}'
            ok_ = r[1] == 'pass'
            pd.text((X, Y), f'{r[0]:4d}', fill=PINK if ok_ else BLUE, font=mono)
            lab = 'pass' if ok_ else f'  {r[1]} '
            lcol = PINK if ok_ else REASONS[[k for k, v in REASONS.items() if v[0] == r[1]][0]][1]
            pd.text((X + 45, Y), lab, fill=lcol, font=mono)
            pd.text((X + 90, Y), nums, fill=(230, 230, 230), font=mono)
    full = Image.new('RGB', (img.width + panel.width, img.height)); full.paste(img, (0, 0)); full.paste(panel, (img.width, 0))
    full.save(f'{out}/overlay_all_candidates.png', optimize=True)
    return cands, info


if __name__ == '__main__':
    m = [a[2:] for a in sys.argv[3:] if a in ('--blobs', '--walk', '--fill', '--tl')]
    main(sys.argv[1], sys.argv[2], m[0] if m else 'tl')
