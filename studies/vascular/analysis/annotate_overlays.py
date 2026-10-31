#!/usr/bin/env python3
"""Presentation-style annotated overlays for the gP-CD31 vessel panels.

Per panel: category-colored skeleton (cyan capillary / red artery / magenta
junction), yellow arrows labelling the longest measured vessels (um), a red
arrow labelling an example artery's diameter, a drawn 50 um scale bar, and a
totals banner (segment count, length + density, junctions, area%).

Reuses the extraction in measure_vessels.py.
Run:  python3 analysis/annotate_overlays.py [name-substring ...]
      (no args = all 16). Writes PNGs to analysis/annotated/ (gitignored).
"""
import warnings, os, sys, glob, math
warnings.filterwarnings('ignore')
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi
from skimage.morphology import skeletonize
from measure_vessels import (segment, prune, nbrs, S8, umpp_for,
                             ARTERY_DIAM_PX, SCALEBAR_PX, SCALEBAR_UM, UM_PER_BAR, SRC)


def panel_name(fn):
    """Panel name as the results tables spell it: VESSEL_ and the extension stripped."""
    name = os.path.basename(fn)[len('VESSEL_'):].rsplit('.', 1)[0]
    return name.replace('_gP-CD31_red', '')


def bar_key(name):
    """Longest matching SCALEBAR_PX prefix, or None if the panel is uncalibrated."""
    hits = [k for k in SCALEBAR_PX if name.startswith(k)]
    return max(hits, key=len) if hits else None

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'annotated')
SC = 3
# mask overlay colors chosen to contrast with the red original: cyan + green + magenta
CAP_COL, ART_COL, JUN_COL = (0, 200, 255), (40, 235, 90), (255, 0, 255)


def font(sz, bold=True):
    name = 'DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'
    try:
        return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/' + name, sz)
    except OSError:
        return ImageFont.load_default()


F_TITLE, F_LAB, F_BAN = font(26), font(20), font(19)


def branch_table(rgb, umpp):
    mask = segment(rgb)
    skel = prune(skeletonize(mask))
    nb = nbrs(skel)
    junc = skel & (nb >= 3)
    branch_lbl, n = ndi.label(skel & ~junc, structure=S8)
    diam = 2 * ndi.distance_transform_edt(mask)
    brs = []
    for lab in range(1, n + 1):
        ys, xs = np.where(branch_lbl == lab)
        dm = float(diam[ys, xs].mean())
        cy, cx = ys.mean(), xs.mean()
        k = np.argmin((ys - cy) ** 2 + (xs - cx) ** 2)
        brs.append(dict(lab=lab, L=len(xs), um=len(xs) * umpp, diam=dm,
                        cls=2 if dm >= ARTERY_DIAM_PX else 1, py=int(ys[k]), px=int(xs[k])))
    h, w = mask.shape
    tot = dict(length_um=skel.sum() * umpp, seg=n,
               cap=sum(b['cls'] == 1 for b in brs), art=sum(b['cls'] == 2 for b in brs),
               junc=int(ndi.label(junc, S8)[1]), area=100 * mask.mean(),
               dens=(skel.sum() * umpp / 1000.0) / ((h * umpp / 1000) * (w * umpp / 1000)))
    return mask, skel, junc, branch_lbl, brs, tot


def arrow(d, x0, y0, x1, y1, col, wd=3):
    d.line([x0, y0, x1, y1], fill=col, width=wd)
    a = math.atan2(y1 - y0, x1 - x0)
    for s in (0.5, -0.5):
        d.line([x1, y1, x1 - 16 * math.cos(a - s), y1 - 16 * math.sin(a - s)], fill=col, width=wd)


def annotate(fn):
    rgb = np.asarray(Image.open(fn).convert('RGB'))
    name = panel_name(fn)
    fig = bar_key(name)
    umpp = umpp_for(name)
    mask, skel, junc, branch_lbl, brs, tot = branch_table(rgb, umpp)

    # class per skeleton pixel, propagated to the whole mask (nearest centerline)
    classmap = np.zeros(skel.shape, np.uint8)
    for b in brs:
        classmap[branch_lbl == b['lab']] = b['cls']
    idx = ndi.distance_transform_edt(classmap == 0, return_indices=True)[1]
    cls_full = classmap[tuple(idx)]
    cls_full[~mask] = 0

    # Upscale first, THEN outline, so the contour is 1 px at display resolution (not SC px).
    # Blend it semi-transparently so the original signal reads through the line.
    big = np.asarray(Image.fromarray(rgb).resize(
        (rgb.shape[1] * SC, rgb.shape[0] * SC), Image.NEAREST)).astype(float)
    cls_big = np.asarray(Image.fromarray(cls_full).resize(
        (cls_full.shape[1] * SC, cls_full.shape[0] * SC), Image.NEAREST))
    CONTOUR_A = 0.5
    for c, color in ((1, CAP_COL), (2, ART_COL)):
        reg = cls_big == c
        bnd = reg & ~ndi.binary_erosion(reg)
        big[bnd] = (1 - CONTOUR_A) * big[bnd] + CONTOUR_A * np.array(color)
    img = Image.fromarray(big.astype(np.uint8))
    IW, IH = img.size

    ML, MR, MT, MB = 210, 210, 60, 132
    W, H = IW + ML + MR, IH + MT + MB
    cv = Image.new('RGB', (W, H), (16, 16, 18))
    cv.paste(img, (ML, MT))
    d = ImageDraw.Draw(cv)
    to_c = lambda px, py: (ML + px * SC, MT + py * SC)
    d.text((ML, 18), name, font=F_TITLE, fill=(255, 255, 255))
    d.text((ML + 260, 26), f"scale {umpp:.3f} um/px", font=F_LAB, fill=(150, 150, 150))

    order = sorted(brs, key=lambda b: -b['L'])
    picks = [b for b in order if b['L'] >= 15][:3]
    arts = [b for b in order if b['cls'] == 2 and b['L'] >= 10]
    thick = max(arts, key=lambda b: b['diam']) if arts else None
    if thick and thick not in picks:
        picks.append(thick)

    # thin, semi-transparent arrows + junction rings on an RGBA overlay
    ov = Image.new('RGBA', cv.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    ARROW_A, RING_A = 170, 110
    left = [MT + 60, MT + 190, MT + 320, MT + 450, MT + 560]
    right = list(left)
    for b in picks:
        tx, ty = to_c(b['px'], b['py'])
        is_art = (b is thick)
        lab = (f"artery  Ø {b['diam']*umpp:.0f} um\nlen {b['um']:.0f} um"
               if is_art else f"vessel {b['um']:.0f} um")
        col = ART_COL if is_art else (255, 235, 60)
        if b['px'] < cls_full.shape[1] / 2:
            ly, lx, ax = left.pop(0), 16, ML - 6
        else:
            ly, lx, ax = right.pop(0), ML + IW + 16, ML + IW + 6
        d.multiline_text((lx, ly), lab, font=F_LAB, fill=col, spacing=3)   # label stays opaque/readable
        arrow(od, ax, ly + 12, tx, ty, col + (ARROW_A,), 1)
        od.ellipse([tx - 4, ty - 4, tx + 4, ty + 4], outline=col + (ARROW_A,), width=1)

    for y, x in zip(*np.where(junc)):            # branch points as small hollow rings
        cx, cy = to_c(x, y)
        od.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], outline=JUN_COL + (RING_A,), width=1)
    cv = Image.alpha_composite(cv.convert('RGBA'), ov).convert('RGB')
    d = ImageDraw.Draw(cv)

    barpx = SCALEBAR_PX[fig] * SC
    barum = SCALEBAR_UM.get(fig, UM_PER_BAR)
    bx1, by = ML + IW - 20, MT + IH - 22
    d.rectangle([bx1 - barpx, by, bx1, by + 7], fill=(255, 255, 255))
    d.text((bx1 - barpx, by - 26), f"{barum:.0f} um", font=F_LAB, fill=(255, 255, 255))

    d.text((ML, MT + IH + 10), "● capillary", font=F_LAB, fill=CAP_COL)
    d.text((ML + 150, MT + IH + 10), "● artery", font=F_LAB, fill=ART_COL)
    d.text((ML + 280, MT + IH + 10), "● junction", font=F_LAB, fill=JUN_COL)
    ban = (f"TOTAL   {tot['seg']} segments ({tot['cap']} cap + {tot['art']} art)   |   "
           f"length {tot['length_um']:.0f} um ({tot['dens']:.1f} mm/mm²)   |   "
           f"{tot['junc']} junctions   |   area {tot['area']:.1f}%")
    d.rectangle([0, H - 44, W, H], fill=(30, 30, 34))
    d.text((16, H - 36), ban, font=F_BAN, fill=(220, 235, 220))

    os.makedirs(OUT, exist_ok=True)
    cv.save(os.path.join(OUT, name + '.png'))
    return name


def main():
    targets = sys.argv[1:] or ['*']
    files = set()
    for t in targets:
        pat = 'VESSEL_*.png' if t == '*' else f'VESSEL_*{t}*.png'
        files.update(glob.glob(os.path.join(SRC, pat)))
    for fn in sorted(files):
        # The banner and the drawn bar are both in um; an uncalibrated panel has neither,
        # and a made-up scale is worse than no overlay. Say so and skip.
        if umpp_for(panel_name(fn)) is None:
            print('skipped (no scale-bar calibration):', panel_name(fn))
            continue
        print('annotated', annotate(fn))
    print('->', OUT)


if __name__ == '__main__':
    main()
