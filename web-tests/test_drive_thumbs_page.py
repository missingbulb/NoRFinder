"""1.18: the Google Drive dialog fetches thumbnails for the rows in view and the next 10, in order,
across fast scrolls and reopening (drive_thumbs_driver.mjs, in headless Chromium)."""
import os
import shutil
import subprocess

import pytest

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')


@pytest.mark.skipif(not NODE, reason='node missing')
def test_drive_thumbnails():
    r = subprocess.run([NODE, os.path.join(HERE, 'drive_thumbs_driver.mjs')], capture_output=True, text=True, timeout=60)
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stdout + r.stderr
