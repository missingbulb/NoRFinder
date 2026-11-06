"""req/shell/drive/credentials: signed in, the page reads Drive with the user's token alone; signed out, with the site's
API key (drive_credentials_driver.mjs, in headless Chromium)."""
import os
import shutil
import subprocess

import pytest

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')


@pytest.mark.skipif(not NODE, reason='node missing')
def test_drive_reads_as_the_signed_in_user():
    r = subprocess.run([NODE, os.path.join(HERE, 'drive_credentials_driver.mjs')], capture_output=True, text=True, timeout=90)
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stdout + r.stderr
