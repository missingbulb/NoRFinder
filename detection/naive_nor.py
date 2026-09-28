"""Naive first pass: border every suspected green-red-green triplet on the red-green image.

python3 naive_nor.py INPUT OUTDIR [--blue-mask]   (INPUT: 3-channel ImageJ TIFF, or an RGB PNG with red=Nav, green=Caspr)

--blue-mask blanks bright DAPI (nuclei) out of the red and green channels before detection and
leaves those pixels out of the thresholds, so red specks inside nuclei stop reading as nodes.
"""
import sys, os, math
import numpy as np
from scipy import ndimage as ndi
from PIL import Image, ImageDraw
sys.path.insert(0, os.environ.get('NORFINDER_SRC', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src')))
import nor

def load(path):
    if path.lower().endswith(('.tif', '.tiff')):
        import tifffile
        t = tifffile.TiffFile(path)
        a = t.asarray().astype(np.float64)          # C,Y,X
        luts = (t.imagej_metadata or {}).get('LUTs')
        cols = []
        for l in luts:
            l = np.asarray(l); cols.append('rgb'[int(np.argmax(l[:, -1]))])
        # DAPI = channel of large blobs (data/README.md): mean area of top-3% components after blur
        from scipy import ndimage as ndi
        def blobby(c):
            b = ndi.gaussian_filter(c, 2); m = b > np.quantile(b, .97)
            lab, n = ndi.label(m); return m.sum() / max(n, 1)
        dapi = int(np.argmax([blobby(c) for c in a]))
        g = cols.index('g'); r = cols.index('r')
        print('display colours', cols, 'dapi ch', dapi, '-> caspr(green) ch', g, 'nav(red) ch', r)
        assert dapi not in (g, r), 'DAPI detected on a green/red channel; check by eye'
        um = 1 / t.pages[0].tags['XResolution'].value[0] * t.pages[0].tags['XResolution'].value[1]
        return a[g], a[r], um, a[dapi]
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.float64)
    return im[..., 1], im[..., 0], None, im[..., 2]

def to8(c):
    lo, hi = np.quantile(c, 0.005), np.quantile(c, 0.998)
    return (np.clip((c - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)

BLUE_FRAC_OF_OTSU = 0.45   # Otsu alone hugs only the nucleus core; this catches its dim rim too
BLUE_GROW = 2              # px dilation past the threshold edge
BLUE_MIN_AREA = 30         # px; smaller bright-blue specks are not nuclei


def blue_mask(dapi):
    """Bright-blue (nucleus) pixels: blurred DAPI above a fraction of its Otsu level, holes filled."""
    from skimage.filters import threshold_otsu
    b = ndi.gaussian_filter(dapi, 2)
    m = b > BLUE_FRAC_OF_OTSU * threshold_otsu(b)
    lab, n = ndi.label(m)
    sizes = ndi.sum(m, lab, range(1, n + 1))
    m = np.isin(lab, 1 + np.nonzero(sizes >= BLUE_MIN_AREA)[0])
    m = ndi.binary_fill_holes(m)
    return ndi.binary_dilation(m, iterations=BLUE_GROW)


SHAPE_LEVEL = 0.7          # outline threshold, as a fraction of the detection thresholds


def element_mask(caspr, nav, nodes, info, valid):
    """Union of every detected triplet's pixels: Caspr or Nav foreground, confined to a narrow
    band along the node axis, keeping only the blobs that touch the axis line itself."""
    cn, nn = nor.norm(caspr, valid), nor.norm(nav, valid)
    # a looser level than detection used, so the outline reaches each paranode's dim tail
    fg = (cn > SHAPE_LEVEL * info['c_thr']) | (nn > SHAPE_LEVEL * nor.quantile_valid(nn, 1 - nor.P['nav_frac'], valid))
    H, W = fg.shape
    yy, xx = np.mgrid[0:H, 0:W]
    out = np.zeros_like(fg)
    for n in nodes:
        u = n['unit']; half_len = n['gap'] / 2 + 3.0 * u; half_w = max(1.2 * u, 3)
        r = int(np.ceil(half_len + 2))
        y0, y1 = max(0, int(n['cy']) - r), min(H, int(n['cy']) + r + 1)
        x0, x1 = max(0, int(n['cx']) - r), min(W, int(n['cx']) + r + 1)
        dy, dx = yy[y0:y1, x0:x1] - n['cy'], xx[y0:y1, x0:x1] - n['cx']
        along = dx * np.cos(n['ang']) + dy * np.sin(n['ang'])
        perp = -dx * np.sin(n['ang']) + dy * np.cos(n['ang'])
        band = (np.abs(along) <= half_len) & (np.abs(perp) <= half_w)
        sub = fg[y0:y1, x0:x1] & band
        lab, k = ndi.label(sub)
        axis = (np.abs(along) <= n['gap'] / 2 + u) & (np.abs(perp) <= 1.0)
        keep = np.unique(lab[axis & sub])
        el = np.isin(lab, keep[keep > 0])
        if not el.any():                     # nothing thresholded: fall back to the axis itself
            el = axis & (np.abs(along) <= n['gap'] / 2 + u)
        out[y0:y1, x0:x1] |= ndi.binary_closing(el, iterations=1) | el
    return out


def main(inp, out, use_mask=False):
    os.makedirs(out, exist_ok=True)
    caspr, nav, um, dapi = load(inp)
    caspr0, nav0 = caspr, nav   # QA images always show the original pixels
    valid = None
    if use_mask:
        bm = blue_mask(dapi)
        print(f'blue mask covers {bm.mean():.1%} of the image')
        valid = ~bm
        # blank to each channel's background level, so masked pixels are neither Caspr nor Nav
        caspr = np.where(bm, np.median(caspr[valid]), caspr)
        nav = np.where(bm, np.median(nav[valid]), nav)
    nodes, info = nor.detect(caspr, nav, valid=valid)
    print('detected', len(nodes), info)
    H, W = caspr.shape
    rgb = np.zeros((H, W, 3), np.uint8); rgb[..., 0] = to8(nav0); rgb[..., 1] = to8(caspr0)
    Image.fromarray(rgb).save(f'{out}/redgreen.png')
    if use_mask:
        mv = rgb.copy(); mv[..., 2] = to8(dapi) // 2
        edge = bm & ~ndi.binary_erosion(bm); mv[edge] = (0, 255, 255)
        Image.fromarray(mv).save(f'{out}/blue_mask_outline.png')
    # region around each triplet: along the axis, the node gap plus one paranode length each side
    regs = []
    for n in nodes:
        half_len = n['gap'] / 2 + n['unit'] * 1.2
        half_w = max(n['unit'] * 0.6, 3)
        regs.append((n['cx'], n['cy'], n['ang'], half_len, half_w))
    # overlay: trace each triplet's own green+red pixels and outline just outside them.
    # Drawn on a 3x-upscaled copy so the line is a third of an image pixel wide.
    shape = element_mask(caspr, nav, nodes, info, valid)
    Z_OV = 3
    up = np.kron(shape, np.ones((Z_OV, Z_OV), bool))
    ring = ndi.binary_dilation(up) & ~up
    ov = np.repeat(np.repeat(rgb, Z_OV, 0), Z_OV, 1)
    ov[ring] = (255, 255, 0)
    Image.fromarray(ov).save(f'{out}/overlay_yellow.png', optimize=True)
    # contact sheet: fixed-size square crops centred on each detection, upscaled, numbered
    S = int(math.ceil(max([2 * r[3] for r in regs] + [10]) + 8)); Z = max(1, 96 // S)
    cols = int(math.ceil(math.sqrt(max(len(regs), 1)) * 1.3))
    rows = int(math.ceil(len(regs) / cols)) if regs else 1
    cell = S * Z; pad = 4; lab = 12
    sheet = Image.new('RGB', (cols * (cell + pad) + pad, rows * (cell + pad + lab) + pad), (40, 40, 40))
    sd = ImageDraw.Draw(sheet)
    big = np.pad(rgb, ((S, S), (S, S), (0, 0)))
    for k, (cx, cy, a, L, w) in enumerate(sorted(regs, key=lambda r: (round(r[1] / 100), r[0]))):
        y0 = int(round(cy)) + S - S // 2; x0 = int(round(cx)) + S - S // 2
        crop = Image.fromarray(big[y0:y0 + S, x0:x0 + S]).resize((cell, cell), Image.NEAREST)
        i, j = divmod(k, cols)
        X = pad + j * (cell + pad); Y = pad + i * (cell + pad + lab)
        sheet.paste(crop, (X, Y + lab)); sd.text((X + 1, Y), str(k + 1), fill=(255, 255, 0))
    sheet.save(f'{out}/contact_sheet.png')
    print('crop px', S, 'zoom', Z, 'sheet', sheet.size, 'um/px', um)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], '--blue-mask' in sys.argv[3:])
