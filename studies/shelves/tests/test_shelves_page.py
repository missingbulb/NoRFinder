"""req/shelves/books/find, req/shelves/read/readers, req/shelves/matcher/export and req/shelves/truth/task: the page in
headless Chromium against a stand-in worker and a stand-in Tesseract (shelves_page_driver.mjs)."""
import json
import os
import shutil
import subprocess
import sys

import pytest

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..', '..')
NODE = shutil.which('node')


@pytest.mark.skipif(not NODE, reason='node missing')
def test_shelves_page(tmp_path):
    sys.path.insert(0, os.path.join(ROOT, 'dev', 'tools', 'build'))
    import build
    studies = tmp_path / 'studies.json'
    studies.write_text(json.dumps(build.studies(ROOT)))
    r = subprocess.run([NODE, os.path.join(HERE, 'shelves_page_driver.mjs'), str(studies)], capture_output=True, text=True, timeout=180)
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stdout + r.stderr
