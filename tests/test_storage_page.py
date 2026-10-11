"""S6: the avatar's Manage storage dialog lists, and clears, what this device keeps
(storage_driver.mjs, in headless Chromium)."""
import os
import shutil
import subprocess

import pytest

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')


@pytest.mark.skipif(not NODE, reason='node missing')
def test_manage_storage():
    r = subprocess.run([NODE, os.path.join(HERE, 'storage_driver.mjs')], capture_output=True, text=True, timeout=60)
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stdout + r.stderr
