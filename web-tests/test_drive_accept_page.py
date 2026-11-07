"""req/shell/drive/dialog: a folder lists the images the study on show opens, by its files.accept (drive_accept_driver.mjs,
in headless Chromium)."""
import os
import shutil
import subprocess

import pytest

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')


@pytest.mark.skipif(not NODE, reason='node missing')
def test_a_folder_lists_what_the_study_opens():
    r = subprocess.run([NODE, os.path.join(HERE, 'drive_accept_driver.mjs')], capture_output=True, text=True, timeout=90)
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stdout + r.stderr
