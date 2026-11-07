"""The vascular study's Python: a TIFF z-stack's CD31 channel, as read, for the extraction lab's versions to draw a
vessel model from (analysis/extraction/lab.py); the page reads and shows the stack itself."""
import json

import numpy as np

def ready():
    """Nothing for the page: the versions it offers ship beside it (analysis/extraction/menu.py), and the lab, with
    scipy, loads at the first extraction."""
    return '{}'


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
    # a file that names none of its axes lays its slices out as pages
    if 'Z' not in axes:
        axes = next((axes.replace(x, 'Z', 1) for x in 'IQ' if x in axes), axes)
    for ax in [x for x in axes if x not in 'CZYX']:
        a = np.take(a, 0, axis=axes.index(ax)); axes = axes.replace(ax, '')
    if 'C' not in axes:
        a, axes = a[None], 'C' + axes
    if 'Z' not in axes:
        a, axes = a[:, None], axes[0] + 'Z' + axes[1:]
    return np.transpose(a, [axes.index(x) for x in 'CZYX']), um, spacing


# A single-channel stack is a CD31 stack cut from the originals; a two-channel one is an original, DAPI then CD31
# (data/README.md: established by looking at the four originals' max projections). Fails on a stack whose channels
# are in another order: the extraction runs on DAPI.
class Session:
    def __init__(self, path):
        stack, self.um, self.spacing = read_stack(path)
        cd31 = 1 if len(stack) == 2 else 0
        self.cd31 = np.ascontiguousarray(stack[cd31])

    def call(self, action, args):
        if action == 'extract':
            return self.extract(**args)
        raise ValueError(f'unknown action {action!r}')

    def extract(self, algorithm, source, z_step=None):
        """The vessel model the lab's version `algorithm` draws from the stack's CD31, as the lab runs it: scored, its
        source the stack's file name; z_step the µm between slices the page shows, None while unknown."""
        if not self.um:
            raise ValueError('The file records no pixel size in µm, which the extraction measures every vessel in.')
        import lab
        m, _ = lab.run_volume(algorithm, self.cd31, self.um, source, z_step)
        return json.dumps(m), None
