"""1.31: when Google throttles the site's Drive downloads, the Drive dialog shows a notice and a countdown and
calls Drive for nothing for 15 minutes (drive_throttle_driver.mjs, in headless Chromium)."""
import os
import shutil
import subprocess

import pytest

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')


@pytest.mark.skipif(not NODE, reason='node missing')
def test_drive_throttle():
    r = subprocess.run([NODE, os.path.join(HERE, 'drive_throttle_driver.mjs')], capture_output=True, text=True, timeout=60)
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stdout + r.stderr
