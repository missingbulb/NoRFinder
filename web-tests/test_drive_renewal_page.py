"""req/shell/drive/renewal: any click that reads Drive renews a run-out sign-in and carries on with the new token
(drive_renewal_driver.mjs, in headless Chromium)."""
import os
import shutil
import subprocess

import pytest

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')


@pytest.mark.skipif(not NODE, reason='node missing')
def test_a_click_that_reads_drive_renews_the_sign_in():
    r = subprocess.run([NODE, os.path.join(HERE, 'drive_renewal_driver.mjs')], capture_output=True, text=True, timeout=90)
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stdout + r.stderr
