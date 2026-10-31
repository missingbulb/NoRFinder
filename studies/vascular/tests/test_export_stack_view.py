"""The 3D viewer's export keeps what the owner judges a stack by: channel identity, the file's own
pixel size, and signal that fades with depth still looking faded.

A drawn stack stands in for a raw one here: this checks the export's bookkeeping, not any
detection, so no real image is needed. It cannot catch the viewer page drawing the files wrong.

Run: python3 tests/test_export_stack_view.py
"""
import json
import os
import sys
import tempfile

import numpy as np
import tifffile
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'analysis'))
import export_stack_view as ev

Z, Y, X = 6, 40, 40


def write_stack(path):
    dapi = np.full((Z, Y, X), 100, np.uint16)
    cd31 = np.full((Z, Y, X), 100, np.uint16)
    for z in range(Z):
        cd31[z, 18:22, :] = 4000 - 500 * z
    tifffile.imwrite(path, np.stack([dapi, cd31], 1), imagej=True,
                     metadata={'axes': 'ZCYX', 'unit': 'micron'}, resolution=(1 / 0.55, 1 / 0.55))


def main():
    with tempfile.TemporaryDirectory() as d:
        src, out = os.path.join(d, 's.tif'), os.path.join(d, 'view')
        write_stack(src)

        h = ev.header(src)
        assert h['axes'] == 'ZCYX' and h['shape'] == [Z, 2, Y, X], h
        assert abs(h['um_per_px'] - 0.55) < 1e-6, h['um_per_px']
        assert h['z_step_um'] is None, 'this stack records no z-step'

        m = ev.export(src, out, 2, None)
        assert m['shape'] == [Z, Y // 2, X // 2], m['shape']
        assert abs(m['um_per_px'] - 1.1) < 1e-6, 'binning must scale the pixel size'
        assert m['z_step_um'] is None and m['z_step_source'] is None, 'an unknown z-step stays unknown'
        with open(os.path.join(out, 'meta.json')) as f:
            assert json.load(f)['shape'] == m['shape']
        assert os.path.exists(os.path.join(out, 'index.html'))

        cd31 = np.asarray(Image.open(os.path.join(out, 'cd31.png'))).reshape(m['shape'])
        assert cd31[:, 9:11, :].mean() > 100 > cd31[:, :5, :].mean(), 'the vessel band is in the CD31 file'
        peaks = cd31[:, 9:11, :].mean(axis=(1, 2))
        assert all(a > b for a, b in zip(peaks, peaks[1:])), f'depth fade must survive the export: {peaks}'

        assert ev.export(src, out, 2, 2.5)['z_step_source'] == 'command line'

        r = ev.export(src, out, 1, None, region=(10, 12, 16))
        assert r['shape'] == [Z, 16, 16] and r['region_yx_px'] == [10, 12], r
        cd31 = np.asarray(Image.open(os.path.join(out, 'cd31.png'))).reshape(r['shape'])
        assert cd31[:, 8:12, :].mean() > 100 > cd31[:, :6, :].mean(), 'the region keeps the band where the stack has it'
    print('ok')


if __name__ == '__main__':
    main()
