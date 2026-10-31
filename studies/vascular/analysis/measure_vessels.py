#!/usr/bin/env python3
"""First-pass vessel quantification for the isolated vessel-channel panels.

Runs over every references/<paper-slug>/figures/panels/VESSEL_*.png, delivering the
professor's three asks per image:
  - CATEGORIZE : each vessel as capillary vs penetrating artery, by centerline diameter
  - COUNT      : number of branch segments (junction-to-junction / junction-to-tip pieces)
  - MEASURE    : total centerline length (px, and um wherever the panel is calibrated)

Pipeline: red-dominance segmentation (ignores white panel labels, ROI boxes and dashed
annotation lines) -> bridge small gaps -> skeletonize -> prune spurs -> branch graph + width.

Run:  python3 analysis/measure_vessels.py [--overlays]
Prints a per-image table + a per-paper region rollup; with --overlays also writes annotated
3-view PNGs (original | measure+count | categorize) to analysis/overlays/.

CAVEATS (first pass, figure-resolution crops):
  * um comes from the scale bar each figure prints (SCALEBAR_PX below), measured off the
    panel itself. A panel with no bar is listed in UNCALIBRATED and reports px + area% only.
  * raw length is NOT comparable across figures (different zoom) — compare length_density
    (mm/mm2) and area %. The rollup is grouped by paper for the same reason.
  * the capillary/artery split is a single diameter threshold; borderline vessels flip.
    Directionally right, not final.
  * some fragmentation survives pruning (short breaks where the stain dims).
"""
import argparse, glob, os, re, warnings
warnings.filterwarnings('ignore')
import numpy as np
from PIL import Image
from skimage.filters import frangi, threshold_otsu, gaussian
from skimage.morphology import skeletonize, disk
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
# One panels dir per source paper: references/<paper-slug>/figures/panels/VESSEL_*.png
REFS = os.path.normpath(os.path.join(HERE, '..', 'docs', 'literature'))
SRC = os.path.join(REFS, '*', 'figures', 'panels')
OUT = os.path.join(HERE, 'overlays')

ARTERY_DIAM_PX = 9.0    # branch mean diameter >= this -> penetrating artery/arteriole

# Real calibration, measured off the scale bar each figure prints (the bar is drawn on the
# panel at the panel's own resolution, so it calibrates that panel directly).
#
# Keys are PANEL-NAME PREFIXES, matched longest-first, so a figure whose rows differ in zoom
# can calibrate each row separately. UM_PER_BAR is the bar's stated length in um; a figure
# whose bar is not 50 um carries its own length in SCALEBAR_UM.
#
#   wang-2022 (bars 50 um): fig1=61px, fig3=47px, fig4/5/6=76px  -> the incumbent panels,
#     named VESSEL_figN_... with no paper tag. Every paper added since is tagged (rust20fig1,
#     ...) so that prefixes stay unique across papers.
#   rust-2020: Fig 1 caption states one 50 um bar for panel B; the bar is drawn once per row,
#     in the right-hand column, and calibrates that whole row (one acquisition scale per row).
#     Fig 2/3 captions state 100 um (overview row) and 20 um (close-up row).
#     rust20fig2_overview is ABSENT here on purpose: that row draws no bar, so it stays
#     uncalibrated and reports px only rather than borrowing a neighbour's scale.
UM_PER_BAR = 50.0
SCALEBAR_PX = {
    'fig1': 61, 'fig3': 47, 'fig4': 76, 'fig5': 76, 'fig6': 76,     # wang-2022
    'rust20fig1_dev_overview': 73, 'rust20fig1_dev_closeup': 71,    # rust-2020, 50 um bars
    'rust20fig1_adult_overview': 37, 'rust20fig1_adult_closeup': 51,
    'rust20fig2_closeup': 75,                                       # rust-2020, 20 um bar
    'rust20fig3_overview': 84, 'rust20fig3_closeup': 83,            # rust-2020, 100/20 um bars
}
# Bars that are not UM_PER_BAR long, keyed the same way.
SCALEBAR_UM = {
    'rust20fig2_closeup': 20.0,
    'rust20fig3_overview': 100.0, 'rust20fig3_closeup': 20.0,
}

# Panels that are deliberately NOT calibrated, with the reason. A working panel belongs in
# exactly one of these two tables: measured, or declared unmeasurable and why. Declaring it
# is what stops "um n/a" from being a silent omission — these panels still report area % and
# raw px, and are excluded from every um and density number.
UNCALIBRATED = {
    'fa22': 'The freitas-andrade figures print no scale bar on any panel, and the paper gives no '
            'pixel size. These panels are kept for ranking and segmentation comparison, not for '
            'absolute or density numbers. Fig 9 is the exception worth knowing about: it prints '
            'the authors\' own mm/mm2 and mm-2 per panel, which is ground truth to compare '
            'against, not a calibration to adopt (see that folder\'s panels/README.md).',
    'rust20fig2_overview': 'Fig 2B draws no scale bar on the overview row; the caption states '
                           '100 um for it but the bar itself is absent, and the close-up bar '
                           'belongs to a different acquisition, so nothing on the figure fixes '
                           'this row\'s px->um. Promote it if the raw scale is obtained.',
}


# Panels whose um/px is known DIRECTLY, from the source image's own metadata, with no scale bar
# involved. Better evidence than a measured bar, not worse — the number is the acquisition's, not
# a ruler read off a printed figure. Record where it came from.
UMPP_DIRECT = {
    # rust-2020 supplementary Representative_Image.tif: ImageJ TIFF, unit=um, XResolution=1.650568
    # pixels per um -> 0.6058 um/px over a 1024 px field = 620 um. Cross-check: capillaries measure
    # 8-12 px across, i.e. 5-7 um, against Stefanitsch's measured 6.03 um mean CD31+ diameter.
    'rust20suppl_representative': 1.0 / 1.650568,
}


def umpp_for(name):
    """um per pixel for a panel, by longest matching prefix. None -> report px only."""
    direct = [k for k in UMPP_DIRECT if name.startswith(k)]
    if direct:
        return UMPP_DIRECT[max(direct, key=len)]
    hits = [k for k in SCALEBAR_PX if name.startswith(k)]
    if not hits:
        return None
    key = max(hits, key=len)
    return SCALEBAR_UM.get(key, UM_PER_BAR) / SCALEBAR_PX[key]

S8 = np.ones((3, 3), int)
# Region tokens looked for in a panel name, for the per-paper rollup. Rat MCAO (wang-2022)
# and mouse photothrombosis / human AD (rust-2020) name their regions differently; the rollup
# is grouped BY PAPER so a mean never mixes species, model or magnification.
REGIONS = ['ischemic', 'penumbra', 'contralateral', 'normal', 'healthy',
           'intact', 'ibz', 'core', 'ctrl', 'ad', 'dev', 'adult']


def rm_small(mask, minsz):
    lab, n = ndi.label(mask, structure=S8)
    if n == 0:
        return mask
    sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
    return np.concatenate([[False], sizes >= minsz])[lab]


def nbrs(skel):
    return ndi.convolve(skel.astype(np.uint8), np.ones((3, 3), int), mode='constant') - skel


MIN_RED_FRACTION = 0.005   # below this, the panel is not a red-channel image


def segment(rgb):
    R, G, B = [rgb[..., i].astype(float) for i in range(3)]
    reddom = (R > G + 12) & (R > B + 12)
    if reddom.mean() < MIN_RED_FRACTION:
        # Grayscale panel (white vessels on black) — e.g. the freitas-andrade set. Red-dominance
        # would return an empty mask, so fall back to plain luminance. Everything downstream is
        # unchanged; the gate keeps the red panels on exactly the path they were measured with.
        reddom = np.ones(R.shape, bool)
        inten = rgb.max(axis=2).astype(float) / 255.0
    else:
        inten = np.where(reddom, R, 0) / 255.0
    sm = gaussian(inten, 1.0)
    vals = sm[sm > 0.03]
    t = max(threshold_otsu(vals) if vals.size else 1.0, 0.13)     # floor: no noise in dim fields
    mask_int = sm > t
    fr = frangi(sm, sigmas=range(1, 7), black_ridges=False)
    fr /= (fr.max() + 1e-9)
    fv = fr[fr > 1e-4]
    mask_fr = fr > 0.6 * (threshold_otsu(fv) if fv.size else 1.0)
    mask = (mask_int | mask_fr) & reddom
    mask = ndi.binary_closing(mask, disk(2))                      # bridge <=~4px gaps
    mask = ndi.binary_fill_holes(mask)
    return rm_small(mask, 20)


def prune(skel, min_len=8):
    skel = skel.copy()
    for _ in range(40):
        nb = nbrs(skel)
        junc = skel & (nb >= 3)
        branch_lbl, n = ndi.label(skel & ~junc, structure=S8)
        if n == 0:
            break
        ends = skel & (nb == 1)
        sizes = ndi.sum(np.ones_like(branch_lbl), branch_lbl, range(1, n + 1))
        end_here = ndi.sum(ends, branch_lbl, range(1, n + 1)) > 0
        junc_adj = ndi.sum(ndi.binary_dilation(junc, S8), branch_lbl, range(1, n + 1)) > 0
        removed = False
        for lab in np.where((sizes < min_len) & end_here & junc_adj)[0] + 1:
            skel[branch_lbl == lab] = False
            removed = True
        if not removed:
            break
    return rm_small(skel, 3)


def analyze(rgb, umpp):
    mask = segment(rgb)
    skel = prune(skeletonize(mask))
    nb = nbrs(skel)
    junc = skel & (nb >= 3)
    ends = skel & (nb == 1)
    branch_lbl, nbr = ndi.label(skel & ~junc, structure=S8)
    diam = 2 * ndi.distance_transform_edt(mask)
    classmap = np.zeros(skel.shape, np.uint8)                      # 1=capillary, 2=artery
    n_cap = n_art = 0
    if nbr:
        for lab, dm in enumerate(ndi.mean(diam, branch_lbl, range(1, nbr + 1)), start=1):
            cls = 2 if dm >= ARTERY_DIAM_PX else 1
            classmap[branch_lbl == lab] = cls
            n_art += cls == 2
            n_cap += cls == 1
    widths = diam[skel]
    h, w = mask.shape
    field_mm2 = (h * umpp / 1000.0) * (w * umpp / 1000.0) if umpp else None
    length_um = skel.sum() * umpp if umpp else None
    m = dict(area=100 * mask.mean(), length_px=int(skel.sum()),
             length_um=round(length_um) if umpp else None, umpp=umpp,
             # scale-invariant, comparable across figures:
             length_density=round((length_um / 1000.0) / field_mm2, 1) if umpp else None,  # mm vessel / mm2
             count_density=round(nbr / field_mm2) if umpp else None,                       # segments / mm2
             segments=nbr, capillary=int(n_cap), artery=int(n_art),
             junctions=int(ndi.label(junc, S8)[1]), vessels=int(ndi.label(mask, S8)[1]),
             wp90=round(float(np.percentile(widths, 90)) if widths.size else 0.0, 1))
    return m, dict(mask=mask, skel=skel, junc=junc, ends=ends, classmap=classmap)


def save_overlay(name, rgb, m, aux):
    from PIL import ImageDraw, ImageFont
    try:
        FB = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15)
        FS = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 13)
    except OSError:
        FB = FS = ImageFont.load_default()
    UP = 2
    skel, junc, ends, cm = aux['skel'], aux['junc'], aux['ends'], aux['classmap']
    sk = ndi.binary_dilation(skel, iterations=1)
    v_meas = (rgb * 0.26).astype(np.uint8); v_meas[sk] = (255, 235, 40)
    cmd = ndi.grey_dilation(cm, footprint=np.ones((3, 3)))
    v_cat = (rgb * 0.20).astype(np.uint8)
    v_cat[sk & (cmd == 1)] = (0, 200, 255)
    v_cat[sk & (cmd == 2)] = (255, 60, 30)

    def up(a):
        return Image.fromarray(a).resize((a.shape[1] * UP, a.shape[0] * UP), Image.NEAREST)

    v0, v1, v2 = up(rgb), up(v_meas), up(v_cat)
    d1 = ImageDraw.Draw(v1)
    for cond, r, col in [(junc, 4, (255, 0, 255)), (ends, 3, (0, 220, 255))]:
        for y, x in zip(*np.where(cond)):
            d1.ellipse([x * UP - r, y * UP - r, x * UP + r, y * UP + r], fill=col)
    W, H, pad, cap, lab = v0.width, v0.height, 8, 54, 22
    canvas = Image.new('RGB', (W * 3 + pad * 4, H + cap + lab + pad * 2), (18, 18, 18))
    for i, im in enumerate([v0, v1, v2]):
        canvas.paste(im, (pad + i * (W + pad), cap))
    d = ImageDraw.Draw(canvas)
    d.text((pad, 8), name, font=FB, fill=(255, 255, 255))
    um = f"~{m['length_um']:.0f}um" if m['length_um'] is not None else "um n/a"
    d.text((pad, 30), f"length {m['length_px']}px ({um})   segments {m['segments']} "
                      f"(cap {m['capillary']} / artery {m['artery']})   junctions {m['junctions']}   "
                      f"area {m['area']:.1f}%", font=FS, fill=(170, 225, 170))
    for i, t in enumerate(["original",
                           f"MEASURE+COUNT: {m['segments']} segments, {m['junctions']} junctions, {m['length_px']}px",
                           f"CATEGORIZE: capillary(cyan) {m['capillary']} / artery(red) {m['artery']}"]):
        d.text((pad + i * (W + pad), cap + H + 3), t, font=FS, fill=(200, 200, 200))
    os.makedirs(OUT, exist_ok=True)
    canvas.save(os.path.join(OUT, name + '.png'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--overlays', action='store_true', help='also write annotated PNGs to analysis/overlays/')
    args = ap.parse_args()
    rows = []
    hdr = ('panel', 'len_um', 'len_dens', 'cnt_dens', 'seg', 'cap', 'art', 'area%', 'wp90')
    print(f'{hdr[0]:34s}' + ''.join(f'{h:>9s}' for h in hdr[1:]))
    print(f'{"":34s}{"um":>9s}{"mm/mm2":>9s}{"seg/mm2":>9s}')
    for fn in sorted(glob.glob(os.path.join(SRC, 'VESSEL_*.png'))):
        rgb = np.asarray(Image.open(fn).convert('RGB'))
        paper = fn.split(os.sep)[-4]        # references/<paper-slug>/figures/panels/<file>
        name = os.path.basename(fn)[len('VESSEL_'):].rsplit('.', 1)[0]
        name = name.replace('_gP-CD31_red', '')          # wang-2022 panels keep their short names
        m, aux = analyze(rgb, umpp_for(name))
        rows.append((paper, name, m))
        um = f'{m["length_um"]:9.0f}' if m['length_um'] is not None else f'{"n/a":>9s}'
        ld = f'{m["length_density"]:9.1f}' if m['length_density'] is not None else f'{"n/a":>9s}'
        cd = f'{m["count_density"]:9.0f}' if m['count_density'] is not None else f'{"n/a":>9s}'
        print(f'{name:34s}{um}{ld}{cd}'
              f'{m["segments"]:9d}{m["capillary"]:9d}{m["artery"]:9d}{m["area"]:9.1f}{m["wp90"]:9.1f}')
        if args.overlays:
            save_overlay(name, rgb, m, aux)

    from collections import defaultdict
    agg = defaultdict(lambda: defaultdict(list))
    for paper, name, m in rows:
        if m['length_density'] is None:     # uncalibrated panel: no density to average
            continue
        # whole-token match, never substring: 'ad' must not swallow 'adult'
        toks = set(re.split(r'[_\-.]', name.lower()))
        for r in REGIONS:
            if r in toks:
                for k in ('length_density', 'count_density', 'area'):
                    agg[(paper, r)][k].append(m[k])
                break
    print('\nregion means (scale-invariant; grouped BY PAPER — never average across papers,')
    print('they differ in species, injury model and magnification):')
    for paper in sorted({p for p, _ in agg}):
        print(f'\n  {paper}')
        print(f'  {"region":15s}{"len_dens":>9s}{"cnt_dens":>9s}{"area%":>7s}  n')
        print(f'  {"":15s}{"mm/mm2":>9s}{"seg/mm2":>9s}')
        for r in REGIONS:
            g = agg.get((paper, r))
            if g:
                print(f'  {r:15s}{np.mean(g["length_density"]):9.1f}{np.mean(g["count_density"]):9.0f}'
                      f'{np.mean(g["area"]):7.1f}  {len(g["length_density"])}')
    if args.overlays:
        print('\noverlays ->', OUT)


if __name__ == '__main__':
    main()
