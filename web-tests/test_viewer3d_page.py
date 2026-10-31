"""1.48: a study in the image3d viewer shows a z-stack in 3D, driven by its channel rows (viewer3d_driver.mjs, in
headless Chromium with a stand-in worker)."""
import os
import shutil
import subprocess

import pytest

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')


@pytest.mark.skipif(not NODE, reason='node missing')
def test_viewer3d():
    r = subprocess.run([NODE, os.path.join(HERE, 'viewer3d_driver.mjs')], capture_output=True, text=True, timeout=120)
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stdout + r.stderr
