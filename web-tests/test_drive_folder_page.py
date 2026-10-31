"""1.18: the Google Drive dialog opens on the link last pasted in this study, else on the folder the study's
own study.json names, else on the link last pasted anywhere (drive_folder_driver.mjs, in headless Chromium)."""
import os
import shutil
import subprocess

import pytest

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')


@pytest.mark.skipif(not NODE, reason='node missing')
def test_drive_folder_per_study():
    r = subprocess.run([NODE, os.path.join(HERE, 'drive_folder_driver.mjs')], capture_output=True, text=True, timeout=90)
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stdout + r.stderr
