"""4.3 to 4.5: the vessel model beside or over the stack, its item cards and its submission as ground truth
(model_page_driver.mjs, in headless Chromium with a stand-in worker and a draft the study ships)."""
import os
import shutil
import subprocess

import pytest

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')


@pytest.mark.skipif(not NODE, reason='node missing')
def test_model_page():
    r = subprocess.run([NODE, os.path.join(HERE, 'model_page_driver.mjs')], capture_output=True, text=True, timeout=180)
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stdout + r.stderr
