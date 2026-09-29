"""Traffic-light candidate finder.

Told to a child: cut a little stamp out of card with three windows in a row, green, red,
green, like a traffic light lying on its side. Slide the stamp over the whole picture, turn it
every way, and pull the green windows a bit closer or further apart. Wherever each window
shows its own colour (green in the green windows, red in the red one), put a pin. The pins
where the fit is best are the nodes. Then colour in the three blobs under the windows.

The old finder started from a red dot and went looking for greens afterwards, so it often came
back with one green (reason A). Here a spot only becomes a candidate if both greens are already
under the stamp, so a one-green candidate can only happen if colouring in a green fails.
All sizes are in units (median half-length of a green blob)."""
import math, numpy as np
from scipy import ndimage as ndi
import nor3
from nor3 import classify, finish, resolve_overlaps, EIGHT

PT = dict(nor3.P3, min_green_balance=0.25, rim=2, win_u=0.5, d_u=(1.25, 1.75, 2.25, 2.75, 3.25), n_ang=16, s_min=1.0, nms_u=1.5,
          dip=0.0, g_reach_u=2.0, g_weak=1.0)


def segment_tl(caspr, nav, bm, p=PT):
    cn, rn, green, red, tg, tr = classify(caspr, nav, bm, p)
    valid_ = ~bm; F = (cn, rn, green, red, tg, tr, valid_)
    glab, _ = ndi.label(green, EIGHT); gsz = np.bincount(glab.ravel())
    lens = [max(sl[0].stop - sl[0].start, sl[1].stop - sl[1].start) / 2
            for i, sl in enumerate(ndi.find_objects(glab)) if sl is not None and gsz[i + 1] >= p['min_green']]
    unit = float(np.median(lens)); H, W = cn.shape
    cs_ = ndi.gaussian_filter(cn, p['smooth_u'] * unit); rs_ = ndi.gaussian_filter(rn, p['smooth_u'] * unit)
    # what each window sees: colour averaged over a small patch, in units of its own threshold,
    # and only if that colour wins there
    cw = ndi.gaussian_filter(cn, p['win_u'] * unit) / tg; rw = ndi.gaussian_filter(rn, p['win_u'] * unit) / tr
    gwin = np.where(cw * tg >= rw * tr, cw, 0); rwin = np.where(rw * tr > cw * tg, rw, 0)
    gwin[bm] = 0; rwin[bm] = 0
    # s <= rwin, so only pixels whose red window reaches s_min can become a peak: score only those.
    # The rest keep best = 0, which changes no peak since their true score is below s_min anyway.
    sup = rwin >= p['s_min'] if p['s_min'] > 0 else np.ones((H, W), bool)
    sy_, sx_ = np.nonzero(sup); rs1 = rwin[sy_, sx_]; n1 = len(sy_)
    best1 = np.zeros(n1); bang1 = np.zeros(n1); bd1 = np.zeros(n1)
    at = lambda img, oy, ox: ndi.map_coordinates(img, [sy_ + oy, sx_ + ox], order=1, cval=0)
    for a in np.arange(p['n_ang']) * np.pi / p['n_ang']:
        for du in p['d_u']:
            d = du * unit; dy, dx = d * np.sin(a), d * np.cos(a)
            gA = at(gwin, dy, dx)       # green seen at p + d
            gB = at(gwin, -dy, -dx)     # green seen at p - d
            # the weaker green window may be dimmer than the others (g_weak of the threshold)
            s = np.minimum(np.minimum(np.maximum(gA, gB), np.minimum(gA, gB) / p['g_weak']), rs1)
            if p['dip']:
                # between node and paranode there must be no dark gap: mid-points still lit
                mA = at(gwin + rwin, dy / 2, dx / 2); mB = at(gwin + rwin, -dy / 2, -dx / 2)
                s = np.minimum(s, np.minimum(mA, mB) / p['dip'])
            up = s > best1; best1[up] = s[up]; bang1[up] = a; bd1[up] = d
    best = np.zeros((H, W)); bang = np.zeros((H, W)); bd = np.zeros((H, W))
    best[sy_, sx_] = best1; bang[sy_, sx_] = bang1; bd[sy_, sx_] = bd1
    nms = max(3, 2 * int(round(p['nms_u'] * unit / 2)) + 1)
    peak = (best == ndi.maximum_filter(best, size=nms)) & (best >= p['s_min']) & valid_
    sy, sx = np.nonzero(peak); order = np.argsort(-best[sy, sx])
    # fibre direction from the structure tensor, only for the 'along the fibre' check
    comb = nor3.FibreAngle(ndi.gaussian_filter(cs_ + rs_, p['smooth_u'] * unit), p['comb_u'] * unit)
    from skimage.segmentation import watershed
    gpk = nor3.hmax_above(cs_, p['valley_depth'] * tg, tg) & valid_
    gbasin = watershed(-cs_, ndi.label(gpk)[0], mask=(cs_ > p['fg'] * tg) & valid_)
    used = np.zeros((H, W), bool); cands = []
    snap = max(1.0, p['snap_u'] * unit)
    for k in order:
        cy, cx = float(sy[k]), float(sx[k])
        if used[int(cy), int(cx)]:
            continue
        a, d = bang[int(cy), int(cx)], bd[int(cy), int(cx)]
        pad = int(math.ceil(d + 3 * unit)) + 2
        y0, y1 = max(0, int(cy) - pad), min(H, int(cy) + pad + 1); x0, x1 = max(0, int(cx) - pad), min(W, int(cx) + pad + 1)
        csw, rsw, vw = cs_[y0:y1, x0:x1], rs_[y0:y1, x0:x1], valid_[y0:y1, x0:x1]
        yy_, xx_ = np.mgrid[0:y1 - y0, 0:x1 - x0]

        def colour_in(mask, py, px, bright):
            near = mask & (np.hypot(yy_ - (py - y0), xx_ - (px - x0)) <= snap)
            if not near.any():
                return np.zeros_like(mask), None
            sy_, sx_ = np.unravel_index(np.argmax(np.where(near, bright, -1)), near.shape)
            lab, _ = ndi.label(mask, EIGHT)
            return lab == lab[sy_, sx_], (sy_, sx_)
        # red: from the brightest red pixel under the red window, down to half of it
        near = vw & (np.hypot(yy_ - (cy - y0), xx_ - (cx - x0)) <= snap) & (rsw > csw)
        if not near.any():
            continue
        ry_, rx_ = np.unravel_index(np.argmax(np.where(near, rsw, -1)), near.shape); r0 = rsw[ry_, rx_]
        rmask, _ = colour_in((rsw >= max(p['half'] * r0, p['fg'] * tr)) & (rsw > csw) & vw, ry_ + y0, rx_ + x0, rsw)
        if rmask.sum() < p['min_area_u2'] * unit ** 2:
            continue
        used[y0:y1, x0:x1] |= rmask
        c = dict(cy=cy, cx=cx, box=(y0, x0), red=rmask, greens=[], fail=None, unit=unit, walk_ang=a,
                 comb=float(comb[int(cy), int(cx)]), tl_score=float(best[int(cy), int(cx)]), tl_d_u=d / unit)
        along = (yy_ + y0 - cy) * np.sin(a) + (xx_ + x0 - cx) * np.cos(a)
        gm = []
        for sg in (1, -1):
            ly, lx = cy + sg * d * np.sin(a), cx + sg * d * np.cos(a)
            li, lj = min(max(int(round(ly)), 0), H - 1), min(max(int(round(lx)), 0), W - 1)
            gw = gbasin[y0:y1, x0:x1]
            dd = np.where(gw > 0, np.hypot(yy_ - (ly - y0), xx_ - (lx - x0)), np.inf)
            b = gw.flat[np.argmin(dd)] if np.isfinite(dd.min()) and dd.min() <= snap else 0
            if b == 0:
                continue
            # the green hill under this window: its own peak sets the half-way edge
            hill = (gw == b) & vw & ~rmask & (sg * along > 0) & (csw >= p['green_dom'] * rsw)
            # a paranode is about as long as a node: the green stops within g_reach_u of its window
            hill &= np.hypot(yy_ - (ly - y0), xx_ - (lx - x0)) <= p['g_reach_u'] * unit
            if not hill.any():
                continue
            g0 = csw[hill].max()
            m, _ = colour_in(hill & (csw >= max(p['half'] * g0, p['fg'] * tg)), ly, lx, csw)
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
            ry, rx = np.nonzero(rmask); rcy, rcx = ry.mean(), rx.mean()
            ang = [np.arctan2(*(np.array(np.nonzero(m)).mean(1) - (rcy, rcx))) for m in gm]
            c['opp_deg'] = float(np.degrees(abs((ang[0] - ang[1] + np.pi) % (2 * np.pi) - np.pi)))
        finish(c, F, p)
        cands.append(c)
    resolve_overlaps(cands, cn.shape)
    return cands, dict(unit=unit, n_red=len(sy))


# the settings the page shows first for this finder; the rest sit under Advanced
segment_tl.MAIN = ('green_frac', 'red_frac', 'win_u', 'd_u', 'half', 'g_reach_u')
