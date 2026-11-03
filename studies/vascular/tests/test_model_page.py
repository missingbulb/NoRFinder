"""req/vascular/model/correct, req/vascular/model/cards and req/vascular/model/ground-truth: the vessel model beside or over the stack, its item cards and its submission as ground truth
(model_page_driver.mjs, in headless Chromium with a stand-in worker and a draft the study ships)."""
import os
import shutil
import subprocess

import pytest

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')


@pytest.mark.skipif(not NODE, reason='node missing')
def test_model_page(tmp_path):
    # the build's list of studies, which the switcher reads: made here, not left by another test's build
    import json, sys
    sys.path.insert(0, os.path.join(HERE, '..', '..', '..', 'dev', 'tools', 'build'))
    import build
    studies = tmp_path / 'studies.json'
    studies.write_text(json.dumps(build.studies(os.path.join(HERE, '..', '..', '..'))))
    r = subprocess.run([NODE, os.path.join(HERE, 'model_page_driver.mjs'), str(studies)], capture_output=True, text=True, timeout=180)
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stdout + r.stderr
