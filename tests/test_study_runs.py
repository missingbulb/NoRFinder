"""S3, S4: the shell runs the fixture study, which shares none of the NoR study's words: its Python through
the bridge in Pyodide under Node (study_bridge_driver.mjs), and the whole page, viewer and panels included,
in headless Chromium with a stand-in worker (study_page_driver.mjs)."""
import os
import shutil
import subprocess

import numpy as np
import pytest
from PIL import Image

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')


def run(driver, *args):
    r = subprocess.run([NODE, os.path.join(HERE, driver), *args], capture_output=True, text=True, timeout=120)
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stdout + r.stderr


@pytest.fixture(scope='module')
def png(tmp_path_factory):
    """A grey image with two bright squares."""
    a = np.zeros((60, 80), np.uint8)
    a[10:20, 10:20] = 200
    a[30:45, 50:70] = 250
    path = str(tmp_path_factory.mktemp('fixture') / 'squares.png')
    Image.fromarray(a).save(path)
    return path


@pytest.mark.skipif(not NODE, reason='node missing')
def test_the_bridge_runs_a_study_it_knows_nothing_of(png):
    run('study_bridge_driver.mjs', png)


@pytest.mark.skipif(not NODE, reason='node missing')
def test_the_page_runs_the_study_it_is_asked_for(png, tmp_path):
    """The stand-in worker answers what the fixture's own Python answers about the image."""
    import base64, json, sys
    sys.path.insert(0, os.path.join(HERE, '..', 'studies', 'fixture', 'py'))
    import fixture
    s = fixture.Session(png)
    opened, images = s.opened()
    count, mask = s.call('count', {'threshold': 100})
    answers = tmp_path / 'answers.json'
    answers.write_text(json.dumps(dict(ready=dict(threshold=100), opened=json.loads(opened), count=json.loads(count),
                                       images=base64.b64encode(images).decode(), mask=base64.b64encode(mask).decode())))
    run('study_page_driver.mjs', str(answers), png)
