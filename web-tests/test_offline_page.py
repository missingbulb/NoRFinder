"""req/shell/offline/default, req/shell/offline/per-study: the built site opens and runs offline, and Prepare for offline keeps the app, the studies' Python
and their data the user chooses (offline_driver.mjs, in headless Chromium with the real worker and the real
Pyodide from its CDN, which a stand-in could not prove kept: what is cached is what the worker really fetched)."""
import os
import shutil
import subprocess
import sys

import numpy as np
import pytest
import tifffile

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
NODE = shutil.which('node')


@pytest.mark.skipif(not NODE, reason='node missing')
def test_the_site_runs_offline(tmp_path):
    subprocess.run([sys.executable, os.path.join(ROOT, 'dev', 'tools', 'build', 'build.py')], check=True, timeout=300,
                   env={**os.environ, 'GOOGLE_API_KEY': 'stand-in'})
    stack = str(tmp_path / 'stack.tif')
    tifffile.imwrite(stack, np.random.default_rng(1).integers(0, 255, (4, 32, 32), dtype=np.uint8), photometric='minisblack')
    r = subprocess.run([NODE, os.path.join(HERE, 'offline_driver.mjs'), os.path.join(ROOT, 'dev', 'build', 'site'), stack],
                       capture_output=True, text=True, timeout=600)
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stdout + r.stderr
