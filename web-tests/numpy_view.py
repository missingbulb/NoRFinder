"""The rule req/shell/image/open sets for showing an image, written with numpy, tifffile and Pillow: the reference the
page's own reader (web/image_open.js) is held to, bit for bit (test_image_open.py). Any TIFF or PNG, one plane per
channel with the name and colour the file gives it (an OME channel name or an ImageJ label, an ImageJ LUT), and what
the file says about itself, each channel's black point measured as the study or the format says; a z-stack flattened (each pixel the brightest of every slice), then slice by slice."""
import json
import re

import numpy as np
from PIL import Image


# what a robust standard deviation is in median absolute deviations, for normal noise, and how many of them a
# background-measured black point stands above the background's median
SIGMA_PER_MAD, ABOVE = 1.4826, 2.5


def triangle(h):
    """Zack's triangle on a channel's 256-step histogram: the step farthest below the line from the histogram's peak
    to its brightest filled step, where the background's fall meets the signal's tail; 0 for a peak in the bright
    half, an image whose background is light."""
    p = int(np.argmax(h))
    e = int(np.flatnonzero(h)[-1])
    if p > 127 or e <= p:
        return 0
    b = np.arange(p, e + 1)
    return p + int(np.argmax(h[p] * (e - b) - h[b] * (e - p)))


def step_at(h, q):
    """The step of a 256-step histogram at quantile q, the lower of the two ranks it falls between."""
    return int(np.searchsorted(np.cumsum(h), int(q * (h.sum() - 1)) + 1))


def background(h):
    """The background's median step and ABOVE robust standard deviations over it, at most step 254."""
    m = step_at(h, 0.5)
    d = np.bincount(np.abs(np.arange(256) - m), weights=h, minlength=256)
    return min(254, m + ABOVE * SIGMA_PER_MAD * step_at(d, 0.5))


# the share of the flattened image a flattened window leaves black and the share it leaves under full colour
FLAT_DARK, FLAT_LIGHT = 0.01, 0.987


BLACK = {'triangle': lambda h, f: (triangle(h), 255), 'background': lambda h, f: (background(h), 255),
         'flattened': lambda h, f: (step_at(f, FLAT_DARK), step_at(f, FLAT_LIGHT))}


def eight(c, lo, hi):
    out = np.zeros(c.shape, np.uint8)
    for z in range(len(c)):
        out[z] = (np.clip((c[z].astype(np.float64) - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)
    return out


def stretch(c, upper=0.998, black='quantile'):
    """8-bit display stretch of the whole channel, every slice by the one window so signal that fades with depth
    still looks faded; slice by slice so no float copy is held. The window runs from the 0.5% quantile to the upper
    one, then narrowed to the steps of it the black-point method measures on the channel's histogram there, the
    whole stack's or its flattened image's."""
    lo, hi = np.quantile(c, 0.005), np.quantile(c, upper)
    if hi <= lo:
        lo, hi = c.min(), c.max()
    if not hi > lo:
        return np.zeros(c.shape, np.uint8)
    out = eight(c, lo, hi)
    if black in BLACK:
        b, w = BLACK[black](np.bincount(out.ravel(), minlength=256), np.bincount(out.max(axis=0).ravel(), minlength=256))
        if (b or w < 255) and w > b:
            lo, hi = float(lo), float(hi)
            out = eight(c, lo + b * (hi - lo) / 255, lo + w * (hi - lo) / 255)
    return out


# the channels shown at most: each is a plane of the image's size in the page's memory
MOST = 8
RGB = [{'name': 'Red', 'colour': '#ff0000'}, {'name': 'Green', 'colour': '#00ff00'}, {'name': 'Blue', 'colour': '#0000ff'}]


def colour(lut):
    """The colour an ImageJ LUT lights at its top, as #rrggbb at full brightness; None for a dark one."""
    top = np.asarray(lut)[:, -1].astype(float)
    if top.max() <= 0:
        return None
    return '#%02x%02x%02x' % tuple(int(round(v)) for v in top / top.max() * 255)


def names(t, ij, n):
    """The file's names for its first n channels: its OME channels' names, else its ImageJ labels (channel
    by channel for the first slice); None where it names none, as in a label ImageJ makes up itself,
    "c:1/3 - <the image's title>", which names the place and not the channel."""
    found = re.findall(r'<Channel\b[^>]*\bName="([^"]*)"', t.ome_metadata or '')
    labels = ij.get('Labels')
    if len(found) < n:
        found = [str(x) for x in labels[:n]] if isinstance(labels, (list, tuple)) and len(labels) >= n else []
    found = [None if re.match(r'c:\d+/\d+\b', x.strip()) else x.strip() or None for x in found]
    return found or [None] * n


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
        bits = f'{p.bitspersample}-bit'
        spacing = float(ij['spacing']) if unit in ('micron', 'um', 'µm') and ij.get('spacing') else None
        # depth is the Z axis, else the pages of a file that names none of its axes; of every other axis (time,
        # say) the first plane is shown
        depth = 'Z' if 'Z' in axes else next((x for x in 'IQ' if x in axes), None)
        for ax in [x for x in axes if x not in 'CSYX' + (depth or '')]:
            a = np.take(a, 0, axis=axes.index(ax)); axes = axes.replace(ax, '')
        if depth:
            axes = axes.replace(depth, 'Z')
        else:
            a, axes = a[None], 'Z' + axes
        rgb = 'S' in axes
        if rgb:
            axes = axes.replace('S', 'C')
        elif 'C' not in axes:
            a, axes = a[None], 'C' + axes
        a = np.transpose(a, [axes.index(x) for x in 'CZYX'])
        if rgb:
            return [(a[k], RGB[k]) for k in range(min(3, len(a)))], um, bits, len(a), saved, spacing, 'quantile'
        n = len(a)
        luts = ij.get('LUTs')
        luts = [] if luts is None else [luts] if np.ndim(luts) == 2 else list(luts)
        said = []
        for k, name in enumerate(names(t, ij, min(n, MOST))):
            c = colour(luts[k]) if k < len(luts) else None
            said.append({**({'name': name} if name else {}), **({'colour': c} if c else {})})
    return [(a[k], said[k]) for k in range(len(said))], um, bits, n, saved, spacing, 'triangle'


def read_other(path):
    with Image.open(path) as f:
        mode = f.mode
        if mode in ('RGB', 'RGBA', 'P', 'CMYK', 'YCbCr'):
            a = np.asarray(f.convert('RGB'))
            return [(a[None, ..., k], RGB[k]) for k in range(3)], (None, None), '8-bit RGB', 3, '', None, 'quantile'
        a = np.asarray(f.convert('I') if mode not in ('L', 'I', 'I;16', 'F') else f)
        return [(a[None], {'name': 'Grey', 'colour': '#ffffff'})], (None, None), f'{16 if mode.startswith("I;16") else 8}-bit grey', 1, '', None, 'quantile'


class View:
    def __init__(self, path, upper=0.998, black=None):
        """black: the study's black-point method, else the file format's (a fluorescence TIFF's triangle, a photo's
        0.5% quantile)"""
        chans, (self.um, self.um_y), bits, n, saved, self.spacing, own = (read_tiff if path.lower().endswith(('.tif', '.tiff')) else read_other)(path)
        self.volume = np.stack([stretch(c, upper, black or own) for c, _ in chans])
        self.planes = self.volume.max(axis=1)
        self.channels = [said for _, said in chans]
        _, self.Z, H, W = self.volume.shape
        x, y = self.um, self.um_y
        field = f'{W * x:.1f} × {H * y:.1f} µm ({W} × {H} px)' if x and y else f'{W} × {H} px'
        pixel = [['Pixel', f'{x:.4f} µm' if x == y else f'{x:.4f} × {y:.4f} µm']] if x and y else []
        shown = str(n) if n == len(chans) else f'{n}, the first {len(chans)} shown'
        self.info = [['Field', field]] + pixel + [['Depth', bits]] + ([['Slices', str(self.Z)]] if self.Z > 1 else []) + [['Channels', shown]]
        if saved:
            self.info.append(['Saved by', saved])
