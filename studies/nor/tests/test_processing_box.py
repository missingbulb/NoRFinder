"""req/nor/find/settings, req/nor/layout: the Processing box before any image, its settings and algorithm note folded,
the filters in its settings after the finder's, each finder
listed with its icon, the note titled for the chosen algorithm, its steps drawn as a nested list, and its precision
and recall before any filter told apart from the list's after the filters. Drives web/ in headless Chromium with a
stand-in worker answering the study's real ready() (processing_box_driver.mjs)."""
import json
import os
import shutil
import subprocess
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')
sys.path.insert(0, os.path.join(HERE, '..', 'detection'))

pytestmark = pytest.mark.full


@pytest.mark.skipif(not NODE, reason='node missing')
def test_the_processing_box_explains_each_algorithm(tmp_path):
    import interactive
    ready = tmp_path / 'ready.json'
    ready.write_text(interactive.ready())
    r = subprocess.run([NODE, os.path.join(HERE, 'processing_box_driver.mjs'), str(ready)], capture_output=True, text=True, timeout=120)
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stdout + r.stderr
