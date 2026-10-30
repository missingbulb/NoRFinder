"""The Image Viewer: no analysis, only the image. Any TIFF or PNG, each channel in the colour the file
displays it in (an ImageJ LUT), else red, green and blue in order, and what the file says about itself."""
import json

import numpy as np
from PIL import Image


def ready():
    return json.dumps({})


def stretch(c):
    """8-bit display stretch between the 0.5% and 99.8% quantiles."""
    c = c.astype(np.float64)
    lo, hi = np.quantile(c, 0.005), np.quantile(c, 0.998)
    if hi <= lo:
        lo, hi = c.min(), c.max()
    if hi <= lo:
        return np.zeros(c.shape, np.uint8)
    return (np.clip((c - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)


def colours(lut):
    """Which of red, green and blue an ImageJ LUT lights at its top: grey lights all three."""
    top = np.asarray(lut)[:, -1].astype(float)
    return [k for k in range(3) if top[k] > 0.5 * top.max()] if top.max() > 0 else [0, 1, 2]


def read_tiff(path):
    import tifffile
    with tifffile.TiffFile(path) as t:
        s, ij = t.series[0], t.imagej_metadata or {}
        a, axes = s.asarray(), s.axes
        p = t.pages[0]
        unit = str(ij.get('unit', '')).lower()

        def side(name):
            res = p.tags.get(name)
            return res.value[1] / res.value[0] if res and res.value[0] and unit in ('micron', 'um', 'µm') else None
        um = side('XResolution'), side('YResolution')
        tag = lambda name: str(p.tags[name].value).strip() if name in p.tags else ''
        saved = tag('Software') or (f"ImageJ {ij['ImageJ']}" if ij.get('ImageJ') else '')
        depth = f'{p.bitspersample}-bit'
    # one plane of every other axis (the first time point, the first slice): channels by their colours
    for ax in [x for x in axes if x not in 'CSYX']:
        a = np.take(a, 0, axis=axes.index(ax)); axes = axes.replace(ax, '')
    if 'S' in axes:
        a = np.moveaxis(a, axes.index('S'), 0); axes = 'S' + axes.replace('S', '')
    elif 'C' in axes:
        a = np.moveaxis(a, axes.index('C'), 0)
    else:
        a = a[None]
    luts = ij.get('LUTs')
    luts = [] if luts is None else [luts] if np.ndim(luts) == 2 else list(luts)
    if 'S' in axes:
        cols = [[k] for k in range(min(3, len(a)))]
    elif len(a) == 1 and not luts:
        cols = [[0, 1, 2]]
    else:
        cols = [colours(luts[k]) if k < len(luts) else [k] for k in range(min(len(a), 3 if not luts else len(a)))]
    return [(a[k], c) for k, c in enumerate(cols)], um, depth, len(a), saved


def read_other(path):
    with Image.open(path) as f:
        mode = f.mode
        if mode in ('RGB', 'RGBA', 'P', 'CMYK', 'YCbCr'):
            a = np.asarray(f.convert('RGB'))
            return [(a[..., k], [k]) for k in range(3)], (None, None), '8-bit RGB', 3, ''
        a = np.asarray(f.convert('I') if mode not in ('L', 'I', 'I;16', 'F') else f)
        return [(a, [0, 1, 2])], (None, None), f'{16 if mode.startswith("I;16") else 8}-bit grey', 1, ''


class Session:
    def __init__(self, path):
        chans, (self.um, self.um_y), depth, n, saved = (read_tiff if path.lower().endswith(('.tif', '.tiff')) else read_other)(path)
        H, W = chans[0][0].shape
        rgb = np.zeros((3, H, W), np.uint8)
        for plane, cols in chans:
            s = stretch(plane)
            for k in cols:
                np.maximum(rgb[k], s, out=rgb[k])
        self.rgb = rgb
        x, y = self.um, self.um_y
        field = f'{W * x:.1f} × {H * y:.1f} µm ({W} × {H} px)' if x and y else f'{W} × {H} px'
        pixel = [['Pixel', f'{x:.4f} µm' if x == y else f'{x:.4f} × {y:.4f} µm']] if x and y else []
        self.info = [['Field', field]] + pixel + [['Depth', depth], ['Channels', str(n)]]
        if saved:
            self.info.append(['Saved by', saved])

    def opened(self):
        _, H, W = self.rgb.shape
        return json.dumps(dict(H=H, W=W, um=self.um, um_y=self.um_y, info=self.info)), self.rgb.tobytes()

    def call(self, action, args):
        raise ValueError(f'unknown action {action!r}')
