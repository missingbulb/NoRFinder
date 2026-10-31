"""The vascular study's page, until the shell's 3D viewer lands: a TIFF z-stack read whole and shown flattened,
each channel the brightest value over every slice, scaled by one window over the whole stack."""
import json

import numpy as np

# A single-channel stack is a CD31 stack cut from the originals; a two-channel one is an original, DAPI then
# CD31 (data/README.md: established by looking at the four originals' max projections). Fails on a stack whose
# channels are in another order: they are shown under the wrong names.
CD31 = {'name': 'CD31', 'colour': '#ff0000'}
DAPI = {'name': 'DAPI', 'colour': '#0000ff'}


def ready():
    return json.dumps({})


def stretch(c):
    """8-bit display stretch between the 0.5% and 99.9% quantiles, as the 3D MicroViewer windows a stack."""
    c = c.astype(np.float64)
    lo, hi = np.quantile(c, 0.005), np.quantile(c, 0.999)
    if hi <= lo:
        lo, hi = c.min(), c.max()
    if hi <= lo:
        return np.zeros(c.shape, np.uint8)
    return (np.clip((c - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)


def read_stack(path):
    """(stack as [C, Z, Y, X], µm per pixel or None) from an ImageJ or plain multi-page TIFF; the first time point."""
    import tifffile
    with tifffile.TiffFile(path) as t:
        s, ij = t.series[0], t.imagej_metadata or {}
        a, axes = s.asarray(), s.axes
        p = t.pages[0]
        res = p.tags.get('XResolution')
        um = res.value[1] / res.value[0] if res and res.value[0] and str(ij.get('unit', '')).lower() in ('micron', 'um', 'µm') else None
    for ax in [x for x in axes if x not in 'CZYX']:
        a = np.take(a, 0, axis=axes.index(ax)); axes = axes.replace(ax, '')
    if 'C' not in axes:
        a, axes = a[None], 'C' + axes
    if 'Z' not in axes:
        a, axes = a[:, None], axes[0] + 'Z' + axes[1:]
    return np.transpose(a, [axes.index(x) for x in 'CZYX']), um


class Session:
    def __init__(self, path):
        stack, self.um = read_stack(path)
        C, Z, H, W = stack.shape
        self.planes = np.stack([stretch(c.max(axis=0)) for c in stack])
        self.channels = [CD31] if C == 1 else [DAPI, CD31] if C == 2 else [{} for _ in range(C)]
        x = self.um
        self.info = [['Field', f'{W * x:.1f} × {H * x:.1f} µm ({W} × {H} px)' if x else f'{W} × {H} px']]
        if x:
            self.info.append(['Pixel', f'{x:.4f} µm'])
        self.info += [['Slices', str(Z)], ['Channels', str(C)], ['Shown', f'the brightest of all {Z} slices']]

    def opened(self):
        _, H, W = self.planes.shape
        meta = dict(H=H, W=W, um=self.um, um_y=self.um, info=self.info, channels=self.channels)
        return json.dumps(meta), self.planes.tobytes()

    def call(self, action, args):
        raise ValueError(f'unknown action {action!r}')
