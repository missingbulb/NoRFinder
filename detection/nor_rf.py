"""Red-first candidate finder.

Told to a child: first look only at the red picture and find every red spot. Grow each spot
outwards, a little at a time, and stop growing as soon as it stops looking like a small brick
(a rectangle): a node is a brick, not a puddle or a triangle. Then look at the green picture right
around each brick. Every green blob touching the brick is a possible paranode; colour each one in,
going away from the brick. Any two greens on opposite sides of the brick make a possible NoR, so one
red brick can give several possible NoRs. Each one goes through the usual checks, and the best
one that passes wins; no pixel can belong to two NoRs.

Only at the very end are candidates sitting on a nucleus (blue) thrown out ('in nucleus'), so the
blue mask no longer changes the thresholds or the picture the finder sees.
All sizes are in units (median half-length of a green blob)."""
import math, numpy as np
from scipy import ndimage as ndi
from skimage.segmentation import watershed
from skimage.measure import perimeter
import nor3
from nor3 import classify, finish, EIGHT

PR = dict(nor3.P3, min_green_balance=0.25, rim=2,
          red_steps=(0.9, 0.8, 0.7, 0.6, 0.5, 0.4),   # grow the red brick down to this fraction of its peak
          min_rect=0.0,       # (off: dropped by ablation 2026-09-27; 0.85 = pitched value) red area / area of a rectangle with the same spread (rectangle 1, triangle 0.85)
          max_perim=99,       # (off: dropped by ablation; 1.1 = pitched value) red outline / outline of a same-area, same-shape rectangle (ragged edges push it up)
          touch_u=1.0,        # a green counts as adjacent if it comes this close to the red
          g_reach_u=3.5,      # a paranode stops this far from where it touches the red
          min_opposite=110,   # deg: two greens must sit this far apart around the red
          g_low=1.0,          # faintest green hill that can be a paranode, in green levels
          nucleus_frac=0.8,
          red_dom=False,      # trim the grown red to pixels where red outshines green
          trim=False,         # overlap: let a NoR give up the tip of a green a stronger NoR owns
          far_u=2.0,          # rescue a paranode up to this far from the red when only one side has green (0 = off)
          far_cone=35,        # deg: half-width of the cone opposite the known green
          gap_level=0.5,      # the line red -> far green must stay above this many colour levels
          # switches kept so each change can be re-tested against its alternative (see detection/lab/ledger.md)
          blue='post',        # 'pre': blank nuclei before finding (old way)
          multi=True,         # False: first green pair found wins (old way)
          split=False,        # True (dropped by ablation): split a hill touching on two sides. False: one candidate green per green hill, even if it wraps the red
          nucleus_rule='red') # 'all': fail on 50% of all NoR pixels or the centre on the mask   # post-hoc: fail if this much of the red lies on a nucleus

nor3.REASONS.setdefault('red not rectangular', ('K', (255, 220, 0)))
nor3.REASON_TEXT.setdefault('red not rectangular', 'red spot is not brick-shaped at any size')
nor3.REASONS.setdefault('in nucleus', ('N', (90, 140, 255)))
nor3.REASON_TEXT.setdefault('in nucleus', 'red mostly on a nucleus (blue mask, applied after finding)')


def box_shape(m):
    """How brick-like a blob is, from its area, spread and outline.
    fill: area / area of the rectangle with the same spread (second moments): rectangle 1.0,
    ellipse 1.04, triangle 0.85, L or amoeba shape 0.7 or less.
    perim: outline length / outline of a rectangle with the same area and length:width
    (rectangle about 0.9-1.0, triangle 1.1+, ragged or branching shapes 1.2+)."""
    ys, xs = np.nonzero(m); a = len(ys)
    if a < 3:
        return 1.0, 1.0
    # second moments by hand (np.cov is slow for thousands of tiny blobs), sample covariance
    dy, dx = ys - ys.mean(), xs - xs.mean(); k = 1.0 / (a - 1)
    syy, sxx, sxy = (dy * dy).sum() * k, (dx * dx).sum() * k, (dy * dx).sum() * k
    tr_, dt = syy + sxx, math.sqrt(max(((syy - sxx) / 2) ** 2 + sxy * sxy, 0.0))
    l1, l2 = tr_ / 2 + dt, max(tr_ / 2 - dt, 1 / 12)
    r = math.sqrt(l1 / l2)
    crop = np.pad(m[ys.min():ys.max() + 1, xs.min():xs.max() + 1], 1)
    return a / (12 * math.sqrt(l1 * l2)), perimeter(crop) / (2 * math.sqrt(a) * (math.sqrt(r) + 1 / math.sqrt(r)))


def posthoc_blue(cands, bm, p):
    """Fail passing candidates whose node (the red) lies mostly on the blue mask. A NoR whose
    paranode brushes a nucleus edge is kept."""
    for c in cands:
        if c['fail'] is None and p.get('nucleus_rule') == 'all':
            y0, x0 = c['box']; u = c['red'].copy()
            for g in c['greens']:
                u |= g
            h, w = u.shape; onb = float(bm[y0:y0 + h, x0:x0 + w][u].mean())
            if onb >= 0.5 or bm[int(c['cy']), int(c['cx'])]:
                c['fail'] = 'in nucleus'
        elif c['fail'] is None:
            y0, x0 = c['box']; h, w = c['red'].shape
            onb = float(bm[y0:y0 + h, x0:x0 + w][c['red']].mean())
            c['nucleus_frac'] = onb
            if onb >= p.get('nucleus_frac', 0.8):
                c['fail'] = 'in nucleus'


def segment_tl_post(caspr, nav, bm, p=None):
    """The traffic-light finder with the blue mask moved to the end, for comparison."""
    import nor_tl
    p = p or nor_tl.PT
    cands, info = nor_tl.segment_tl(caspr, nav, np.zeros_like(bm), p)
    posthoc_blue(cands, bm, p)
    return cands, info


def quality(c):
    return c['snr'] * math.sqrt(c['green_bright_balance'] * c['green_balance'])


def segment_rf(caspr, nav, bm, p=PR):
    none = bm if p['blue'] == 'pre' else np.zeros_like(bm)   # the finder sees the whole image; blue comes last
    cn, rn, green, red, tg, tr = classify(caspr, nav, none, p)
    valid_ = ~none; F = (cn, rn, green, red, tg, tr, valid_)
    glab, _ = ndi.label(green, EIGHT); gsz = np.bincount(glab.ravel())
    lens = [max(sl[0].stop - sl[0].start, sl[1].stop - sl[1].start) / 2
            for i, sl in enumerate(ndi.find_objects(glab)) if sl is not None and gsz[i + 1] >= p['min_green']]
    unit = float(np.median(lens)); H, W = cn.shape
    cs_ = ndi.gaussian_filter(cn, p['smooth_u'] * unit); rs_ = ndi.gaussian_filter(rn, p['smooth_u'] * unit)
    # 1. red only: peaks and the hills around them
    rpk = nor3.hmax_above(rs_, p['valley_depth'] * tr, tr)
    rbasin = watershed(-rs_, ndi.label(rpk)[0], mask=rs_ > p['fg'] * tr)
    # greens may be fainter than the usual green level (g_low of it); a pair still needs one
    # green at full level, and the brightness checks judge the rest
    gpk = nor3.hmax_above(cs_, p['valley_depth'] * tg, p['g_low'] * tg)
    gbasin = watershed(-cs_, ndi.label(gpk)[0], mask=cs_ > p['g_low'] * tg)
    gy_, gx_ = np.gradient(ndi.gaussian_filter(cs_ + rs_, p['smooth_u'] * unit)); w_ = p['comb_u'] * unit
    Jxx, Jyy, Jxy = (ndi.gaussian_filter(v, w_) for v in (gx_ * gx_, gy_ * gy_, gx_ * gy_))
    comb = 0.5 * np.arctan2(2 * Jxy, Jxx - Jyy) + np.pi / 2
    touch = max(1, int(round(p['touch_u'] * unit))); reach = p['g_reach_u'] * unit
    pad = int(math.ceil(touch + reach + 2 * unit)) + 2
    min_red = p['min_area_u2'] * unit ** 2; min_g = p['min_green_u2'] * unit ** 2
    blobs = []                       # per red blob: list of alternative candidates
    for bi, sl in enumerate(ndi.find_objects(rbasin), start=1):
        if sl is None:
            continue
        y0, x0 = max(0, sl[0].start - pad), max(0, sl[1].start - pad)
        y1, x1 = min(H, sl[0].stop + pad), min(W, sl[1].stop + pad)
        rb = rbasin[y0:y1, x0:x1] == bi; rsw = rs_[y0:y1, x0:x1]
        py, px = np.unravel_index(np.argmax(np.where(rb, rsw, -1)), rb.shape); r0 = rsw[py, px]
        # 2. grow the red brick while it stays brick-shaped
        rmask = None; rect = None; shape_on = p['min_rect'] > 0 or p['max_perim'] < 99
        for f in p['red_steps']:
            lev = max(f * r0, p['fg'] * tr)
            lab, _ = ndi.label(rb & (rsw >= lev), EIGHT); m = lab == lab[py, px]
            # a few pixels cannot show a shape: judge the brick only once it is big enough
            if shape_on and m.sum() >= min_red:
                fill, per = box_shape(m)
                if fill < p['min_rect'] or per > p['max_perim']:
                    break
            else:
                fill, per = 1.0, 1.0
            rmask, rect = m, (fill, per)
            if lev == p['fg'] * tr:
                break
        cy, cx = float(py + y0), float(px + x0)
        base = dict(cy=cy, cx=cx, box=(y0, x0), greens=[], fail=None, unit=unit,
                    comb=float(comb[int(cy), int(cx)]), blob=bi)
        if rmask is None:
            lab, _ = ndi.label(rb & (rsw >= max(p['red_steps'][0] * r0, p['fg'] * tr)), EIGHT)
            blobs.append([dict(base, red=lab == lab[py, px], fail='red not rectangular', snr=0, red_mean=float(r0))]); continue
        if p['red_dom'] and rmask is not None:
            # found on red alone; the node's own pixels are those where red outshines green
            keep = rmask & (rsw > cs_[y0:y1, x0:x1])
            lab, _ = ndi.label(keep, EIGHT)
            rmask = lab == lab[py, px] if lab[py, px] else keep
        if rmask.sum() < min_red:
            continue
        ry, rx = np.nonzero(rmask); rcy, rcx = ry.mean(), rx.mean()
        base.update(cy=float(rcy + y0), cx=float(rcx + x0), red_fill=rect[0], red_perim=rect[1])
        # 3. greens touching the brick: each hill next to it, coloured in going away from the red
        csw, gw = cs_[y0:y1, x0:x1], gbasin[y0:y1, x0:x1]
        ring = ndi.binary_dilation(rmask, EIGHT, iterations=touch) & ~rmask & (csw >= p['green_dom'] * rsw) & (gw > 0)
        yy_, xx_ = np.mgrid[0:y1 - y0, 0:x1 - x0]
        gm = []
        # one green hill can wrap round the red and touch it on both sides: each separate touching
        # patch is its own possible paranode
        if p['split']:
            rlab, nr = ndi.label(ring, EIGHT); parts = [(rlab == q) for q in range(1, nr + 1)]
        else:
            parts = [ring & (gw == b) for b in np.unique(gw[ring])]
        csum = cs_[y0:y1, x0:x1] / tg; rsum = rsw / tr

        def colour(near):
            """Colour in the green hill that `near` touches, going away from the red."""
            b = np.bincount(gw[near]).argmax()
            # seed: brightest pixel of the patch (or, for a far patch, the one closest to the red)
            sy_, sx_ = np.unravel_index(np.argmax(np.where(near, csw, -1)), near.shape)
            dy, dx = sy_ - rcy, sx_ - rcx
            hill = (gw == b) & ~rmask & ((yy_ - rcy) * dy + (xx_ - rcx) * dx > 0) & (csw >= p['green_dom'] * rsw)
            hill &= np.hypot(yy_ - sy_, xx_ - sx_) <= reach
            g0 = csw[hill].max() if hill.any() else 0
            lab, _ = ndi.label(hill & (csw >= max(p['half'] * g0, p['g_low'] * tg)), EIGHT)
            m = lab == lab[sy_, sx_] if lab[sy_, sx_] else np.zeros_like(hill)
            return (m, math.atan2(dy, dx), float(csw[m].sum()), g0) if m.sum() >= min_g else None

        gm = [g for g in map(colour, parts) if g is not None]

        def pairs(gm):
            out = []
            for i in range(len(gm)):
                for j in range(i + 1, len(gm)):
                    opp = math.degrees(abs((gm[i][1] - gm[j][1] + math.pi) % (2 * math.pi) - math.pi))
                    if opp >= p['min_opposite'] and not (gm[i][0] & gm[j][0]).any() and max(gm[i][3], gm[j][3]) >= tg:
                        out.append((i, j))
            return out

        if p['far_u'] and gm and not pairs(gm):
            # rescue: a paranode a little away from the red, across from a green we already have.
            # Look in a cone opposite each green, out to far_u units, and accept a hill only if the
            # line from the red to it stays lit (no dark gap): the paranode is still part of the stick
            far = ndi.binary_dilation(rmask, EIGHT, iterations=max(touch + 1, int(round(p['far_u'] * unit))))
            cand = far & ~rmask & (csw >= p['green_dom'] * rsw) & (gw > 0) & (csw >= tg)
            ang_px = np.arctan2(yy_ - rcy, xx_ - rcx)
            for g in sorted(gm, key=lambda g: -g[2])[:2]:
                opp = np.abs((ang_px - g[1] + np.pi) % (2 * np.pi) - np.pi) >= math.radians(180 - p['far_cone'])
                for b in np.unique(gw[cand & opp]):
                    patch = cand & opp & (gw == b)
                    dd = np.where(patch, np.hypot(yy_ - rcy, xx_ - rcx), np.inf)
                    qy, qx = np.unravel_index(np.argmin(dd), dd.shape)
                    t = np.linspace(0, 1, 2 * int(dd[qy, qx]) + 2)
                    ly = np.round(rcy + t * (qy - rcy)).astype(int); lx = np.round(rcx + t * (qx - rcx)).astype(int)
                    if np.maximum(csum[ly, lx], rsum[ly, lx]).min() < p['gap_level']:
                        continue
                    near = np.zeros_like(patch); near[qy, qx] = True
                    ng = colour(near)
                    if ng is not None and not any((ng[0] & h[0]).any() for h in gm):
                        gm.append(ng)

        alts = []
        for i, j in pairs(gm):
            c = dict(base, red=rmask, greens=[gm[i][0], gm[j][0]])
            ang = [np.arctan2(*(np.array(np.nonzero(m)).mean(1) - (rcy, rcx))) for m in c['greens']]
            c['opp_deg'] = float(np.degrees(abs((ang[0] - ang[1] + np.pi) % (2 * np.pi) - np.pi)))
            finish(c, F, p); alts.append(c)
            if not p['multi']:
                break
        if not alts:
            c = dict(base, red=rmask)
            if gm:
                c['greens'] = [max(gm, key=lambda g: g[2])[0]]; c['fail'] = 'one green'
            else:
                c['fail'] = 'no green'
            finish(c, F, p); alts.append(c)
        blobs.append(alts)
    # 4. post-hoc blue: a NoR mostly on a nucleus is thrown out
    posthoc_blue([c for alts in blobs for c in alts], bm, p)
    # 5. choose: best passing alternatives claim their pixels first; one NoR per red, one per pixel
    claimed = np.zeros((H, W), bool); won = {}
    ok = [(quality(c), k, c) for k, alts in enumerate(blobs) for c in alts if c['fail'] is None]
    for q, k, c in sorted(ok, key=lambda t: -t[0]):
        if k in won:
            continue
        y0, x0 = c['box']; u = c['red'].copy()
        for g in c['greens']:
            u |= g
        h, w = u.shape; cl = claimed[y0:y0 + h, x0:x0 + w]
        if (cl & u).any():
            # a stronger NoR already owns some pixels. If only the tip of a green is taken, give it
            # up and judge the rest again; the red itself is never shared
            if not p['trim'] or (cl & c['red']).any():
                continue
            gs = [g & ~cl for g in c['greens']]
            if any(g2.sum() < max(min_g, 0.5 * g.sum()) for g, g2 in zip(c['greens'], gs)):
                continue
            c = dict(c, greens=gs, fail=None, trimmed=True); finish(c, F, p)
            if c['fail'] is not None:
                continue
            u = c['red'] | gs[0] | gs[1]
        cl |= u; won[k] = c
    cands = []
    for k, alts in enumerate(blobs):
        if k in won:
            c = won[k]
        else:
            c = max(alts, key=lambda c: c.get('snr', 0))
            if c['fail'] is None:
                c['fail'] = 'shares a segment'
        c['n_alts'] = len(alts); cands.append(c)
    return cands, dict(unit=unit, n_red=len(blobs), n_alts=sum(len(a) for a in blobs))


# the settings the page shows first for this finder; the rest sit under Advanced
segment_rf.MAIN = ('green_frac', 'red_frac', 'red_steps', 'touch_u', 'g_reach_u', 'far_u')



if __name__ == '__main__':
    # review outputs in Ariel's standard format (render_std.py), plus lab sheets
    import os, sys, json
    import nor_lab, render_std
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Slide5_Slice1_up_left2', 'v9_red_first')
    os.makedirs(out, exist_ok=True)
    cands, info = render_std.render('rf', out)
    sc, missed = nor_lab.score(cands, json.load(open(nor_lab.LABELS)))
    nor_lab.sheets(os.path.join(out, 'review_sheets'), cands, missed, (nor_lab.load()))
