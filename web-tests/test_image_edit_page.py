"""req/shell/data/edit, req/shell/data/edit-save: Edit Image on the fixture study in headless Chromium against a stand-in
Google (image_edit_driver.mjs), then the files it saved read back: each part the image's own pixels, 0 inside the
imperfection, and its record saying where it lay and what was left out."""
import json
import os
import shutil

import numpy as np
import pytest
import tifffile
from PIL import Image

from test_study_runs import NODE, answers, png, run  # noqa: F401  (fixtures)

pytestmark = pytest.mark.full


@pytest.mark.skipif(not NODE, reason='node missing')
def test_edit_image_and_save(answers, png, tmp_path):
    root = tmp_path / 'drive'
    (root / 'sub').mkdir(parents=True)
    shutil.copy(png, root / os.path.basename(png))
    Image.fromarray(np.zeros((8, 8), np.uint8)).save(root / 'sub' / 'other.png')
    out = tmp_path / 'saved'
    run('image_edit_driver.mjs', answers[0], answers[1], str(root), png, str(out))
    src = np.asarray(Image.open(png).convert('RGB'))[..., 0]
    stem = os.path.splitext(os.path.basename(png))[0]
    saved = sorted(p for p in os.listdir(out) if p.startswith(stem + '_'))
    assert saved == [f'{stem}_r1c1.tif', f'{stem}_r2c1.tif', f'{stem}_r2c2.tif'], saved
    for f in saved:
        with tifffile.TiffFile(out / f) as t:
            got = t.asarray()
            rec = json.loads(next(l for l in t.imagej_metadata['Info'].split('\n') if l.startswith('rauntruth.split=')).split('=', 1)[1])
        assert rec['grid']['xs'][0] == 10 and rec['grid']['xs'][-1] == 70 and rec['grid']['ys'] == [10, 30, 50], rec['grid']
        [poly] = rec['removed']
        p = rec['part']
        want = src[p['y']:p['y'] + p['height'], p['x']:p['x'] + p['width']].copy()
        xs, ys = [q[0] for q in poly], [q[1] for q in poly]
        inside = (slice(int(np.ceil(min(ys))) - p['y'] + 1, int(max(ys)) - p['y'] - 1), slice(int(np.ceil(min(xs))) - p['x'] + 1, int(max(xs)) - p['x'] - 1))
        if p['row'] == 1 and p['col'] == 1:
            assert not got[inside].any(), 'the imperfection is blank'
            outside = np.ones_like(want, bool)
            outside[int(np.floor(min(ys))) - p['y']:int(np.ceil(max(ys))) - p['y'] + 1, int(np.floor(min(xs))) - p['x']:int(np.ceil(max(xs))) - p['x'] + 1] = False
            assert np.array_equal(got[outside], want[outside]), 'the rest is the image\'s own'
        else:
            assert np.array_equal(got, want), f
