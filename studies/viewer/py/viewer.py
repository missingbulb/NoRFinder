"""The Image Viewer: no analysis, only the image. Any TIFF or PNG, one plane per channel with the name and
colour the file gives it (an OME channel name or an ImageJ label, an ImageJ LUT), leaving the page to choose
what the file does not say, and what the file says about itself. A z-stack comes flattened (each pixel the
brightest of every slice), then slice by slice, for the shell's 3D viewer."""
import json
import re

import numpy as np
from PIL import Image


def ready():
    return json.dumps({})


def stretch(c):
    """8-bit display stretch between the 0.5% and 99.8% quantiles of the whole channel, every slice by the one
    window so signal that fades with depth still looks faded; slice by slice so no float copy is held."""
    lo, hi = np.quantile(c, 0.005), np.quantile(c, 0.998)
    if hi <= lo:
        lo, hi = c.min(), c.max()
    out = np.zeros(c.shape, np.uint8)
    if hi > lo:
        for z in range(len(c)):
            out[z] = (np.clip((c[z].astype(np.float64) - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)
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
            return [(a[k], RGB[k]) for k in range(min(3, len(a)))], um, bits, len(a), saved, spacing
        n = len(a)
        luts = ij.get('LUTs')
        luts = [] if luts is None else [luts] if np.ndim(luts) == 2 else list(luts)
        said = []
        for k, name in enumerate(names(t, ij, min(n, MOST))):
            c = colour(luts[k]) if k < len(luts) else None
            said.append({**({'name': name} if name else {}), **({'colour': c} if c else {})})
    return [(a[k], said[k]) for k in range(len(said))], um, bits, n, saved, spacing


def read_other(path):
    with Image.open(path) as f:
        mode = f.mode
        if mode in ('RGB', 'RGBA', 'P', 'CMYK', 'YCbCr'):
            a = np.asarray(f.convert('RGB'))
            return [(a[None, ..., k], RGB[k]) for k in range(3)], (None, None), '8-bit RGB', 3, '', None
        a = np.asarray(f.convert('I') if mode not in ('L', 'I', 'I;16', 'F') else f)
        return [(a[None], {'name': 'Grey', 'colour': '#ffffff'})], (None, None), f'{16 if mode.startswith("I;16") else 8}-bit grey', 1, '', None


class Session:
    def __init__(self, path):
        chans, (self.um, self.um_y), bits, n, saved, self.spacing = (read_tiff if path.lower().endswith(('.tif', '.tiff')) else read_other)(path)
        self.volume = np.stack([stretch(c) for c, _ in chans])
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

    def opened(self):
        _, H, W = self.planes.shape
        meta = dict(H=H, W=W, Z=self.Z, spacing=self.spacing, um=self.um, um_y=self.um_y, info=self.info, channels=self.channels)
        return json.dumps(meta), self.planes.tobytes() + (self.volume.tobytes() if self.Z > 1 else b'')

    def call(self, action, args):
        raise ValueError(f'unknown action {action!r}')
