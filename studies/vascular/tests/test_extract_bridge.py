"""req/vascular/model/run: Execute's algorithm runs in the page's Python, Pyodide with only the packages the study's
study.json names, through web/bridge.js (extract_bridge_driver.mjs, under Node), on a drawn stack of crossing tubes."""
import os
import shutil
import subprocess

import numpy as np
import pytest
import tifffile

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')


def stack(path):
    """Three bright tubes over noise, at different depths, in 0.5 µm pixels: one crossing the other two."""
    rng = np.random.default_rng(1)
    Z, H, W = 10, 300, 300
    v = rng.normal(100, 10, (Z, H, W)).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    for x0, y0, x1, y1, z in [(20, 150, 280, 150, 4), (150, 20, 150, 280, 6), (60, 40, 250, 260, 3)]:
        t = np.clip(((xx - x0) * (x1 - x0) + (yy - y0) * (y1 - y0)) / ((x1 - x0) ** 2 + (y1 - y0) ** 2), 0, 1)
        d = np.hypot(xx - (x0 + t * (x1 - x0)), yy - (y0 + t * (y1 - y0)))
        for k in range(Z):
            v[k] += 900 * np.exp(-(d / 3) ** 2) * np.exp(-((k - z) / 2) ** 2)
    tifffile.imwrite(path, v.astype(np.uint16), imagej=True, resolution=(2, 2), metadata={'unit': 'micron', 'axes': 'ZYX'})


@pytest.mark.skipif(not NODE, reason='node missing')
def test_the_page_runs_the_extraction(tmp_path):
    path = str(tmp_path / 'stack.tif')
    stack(path)
    r = subprocess.run([NODE, os.path.join(HERE, 'extract_bridge_driver.mjs'), path, os.path.dirname(tifffile.__file__), 'v1', 'v5'],
                       capture_output=True, text=True, timeout=300)
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stdout + r.stderr
