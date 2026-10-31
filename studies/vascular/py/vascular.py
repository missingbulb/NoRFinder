"""The vascular study's page: a TIFF z-stack read whole, every channel scaled by one window over the whole stack, never
per slice, so signal that fades with depth still looks faded; returned flattened (each pixel the brightest of every
slice), then slice by slice, for the shell's 3D viewer."""
import json

import numpy as np

# A single-channel stack is a CD31 stack cut from the originals; a two-channel one is an original, DAPI then
# CD31 (data/README.md: established by looking at the four originals' max projections), and is shown CD31 first, so
# CD31 is always the study's first channel. Fails on a stack whose channels are in another order: they are shown
# under the wrong names.
CD31 = {'name': 'CD31', 'colour': '#ff0000'}
DAPI = {'name': 'DAPI', 'colour': '#0000ff'}


def ready():
    return json.dumps({})


def window(c):
    """The 0.5% and 99.9% quantiles of a whole channel, as the 3D MicroViewer windows a stack."""
    lo, hi = np.quantile(c, 0.005), np.quantile(c, 0.999)
    if hi <= lo:
        lo, hi = float(c.min()), float(c.max())
    return float(lo), float(hi)


def stretch(c):
    """A channel [Z, Y, X] as 8 bits between its window, slice by slice so no float copy of the stack is held."""
    lo, hi = window(c)
    out = np.zeros(c.shape, np.uint8)
    if hi > lo:
        for z in range(len(c)):
            out[z] = (np.clip((c[z].astype(np.float32) - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)
    return out


def read_stack(path):
    """(stack as [C, Z, Y, X], µm per pixel, µm between slices) from an ImageJ or plain multi-page TIFF, the first
    time point; each size None when the file does not record it."""
    import tifffile
    with tifffile.TiffFile(path) as t:
        s, ij = t.series[0], t.imagej_metadata or {}
        a, axes = s.asarray(), s.axes
        p = t.pages[0]
        res = p.tags.get('XResolution')
        microns = str(ij.get('unit', '')).lower() in ('micron', 'um', 'µm')
        um = res.value[1] / res.value[0] if res and res.value[0] and microns else None
        spacing = float(ij['spacing']) if microns and ij.get('spacing') else None
    for ax in [x for x in axes if x not in 'CZYX']:
        a = np.take(a, 0, axis=axes.index(ax)); axes = axes.replace(ax, '')
    if 'C' not in axes:
        a, axes = a[None], 'C' + axes
    if 'Z' not in axes:
        a, axes = a[:, None], axes[0] + 'Z' + axes[1:]
    return np.transpose(a, [axes.index(x) for x in 'CZYX']), um, spacing


class Session:
    def __init__(self, path):
        stack, self.um, self.spacing = read_stack(path)
        C, Z, H, W = stack.shape
        order = [1, 0] if C == 2 else list(range(C))
        self.volume = np.stack([stretch(stack[k]) for k in order])
        self.planes = self.volume.max(axis=1)
        self.Z = Z
        self.channels = [CD31] if C == 1 else [CD31, DAPI] if C == 2 else [{} for _ in range(C)]
        x = self.um
        self.info = [['Field', f'{W * x:.1f} × {H * x:.1f} µm ({W} × {H} px)' if x else f'{W} × {H} px']]
        if x:
            self.info.append(['Pixel', f'{x:.4f} µm'])
        self.info += [['Slices', str(Z)], ['Channels', str(C)]]

    def opened(self):
        _, H, W = self.planes.shape
        meta = dict(H=H, W=W, Z=self.Z, spacing=self.spacing, um=self.um, um_y=self.um, info=self.info, channels=self.channels)
        return json.dumps(meta), self.planes.tobytes() + self.volume.tobytes()

    def call(self, action, args):
        raise ValueError(f'unknown action {action!r}')
