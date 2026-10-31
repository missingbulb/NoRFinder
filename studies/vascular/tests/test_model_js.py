"""The vessel model's edits and the review's coverage tube, in the page's own JavaScript (web/model.js,
web/coverage.js): test_vessel_model_edits.mjs and test_microviewer_coverage.mjs, run under Node."""
import os
import shutil
import subprocess

import pytest

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')


@pytest.mark.skipif(not NODE, reason='node missing')
@pytest.mark.parametrize('script', ['test_vessel_model_edits.mjs', 'test_microviewer_coverage.mjs'])
def test_model_js(script):
    r = subprocess.run([NODE, os.path.join(HERE, script)], capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stdout + r.stderr
