"""req/shell/data/drive-access, req/shell/data/mode, req/shell/data/folder, req/shell/data/update-previews,
req/shell/data/preview-images: Data Management on the fixture study, in headless Chromium against a stand-in Google
(data_mode_driver.mjs): the strip for a study manager only, the tree with each folder's access, the folder's view and
sums, Update previews, the ground-truth marker, an image opened from its preview, and Load Original."""
import json
import os
import subprocess
import sys

import numpy as np
import pytest
import tifffile
from PIL import Image

from test_study_runs import NODE, answers, png, run  # noqa: F401  (fixtures)

pytestmark = pytest.mark.full
HERE = os.path.dirname(os.path.abspath(__file__))


def folder(path):
    """A flat image, a stack, a third image, a photo, and a subfolder with a PNG."""
    os.makedirs(path / 'sub')
    y, x = np.mgrid[0:120, 0:150]
    flat = np.stack([(x * 20).astype(np.uint16), (y * 20).astype(np.uint16), ((x + y) * 10).astype(np.uint16)])
    tifffile.imwrite(path / 'a flat.tif', flat, imagej=True, metadata={'axes': 'CYX'})
    stack = np.zeros((10, 2, 80, 80), np.uint16)
    for z in range(10):
        stack[z, 0, 30:50, 5 + 6 * z:15 + 6 * z] = 3000
    tifffile.imwrite(path / 'b stack.tif', stack, imagej=True, metadata={'axes': 'ZCYX'})
    subprocess.run([sys.executable, os.path.join(HERE, '..', 'dev', 'tools', 'previews', 'make_previews.py'), str(path)], check=True)
    with open(path / 'b stack.tif', 'ab') as f:  # changed since its preview was made
        f.write(b'\0')
    tifffile.imwrite(path / 'e plain.tif', flat[1:2], imagej=True, metadata={'axes': 'CYX'})  # made after the previews
    Image.fromarray(np.stack([x * 1.5, y * 2, x + y], -1).astype(np.uint8)).save(path / 'd photo.jpg')  # a kind the study opens beside TIFFs
    Image.fromarray(np.zeros((20, 20, 3), np.uint8)).save(path / 'sub' / 'c.png')


@pytest.mark.skipif(not NODE, reason='node missing')
def test_data_management(answers, tmp_path):
    root = tmp_path / 'drive'
    folder(root)
    out = tmp_path / 'written.tiff'
    run('data_mode_driver.mjs', answers[0], answers[1], str(root), str(out))
    with tifffile.TiffFile(out) as t:
        index = json.loads(t.pages[0].description)
    assert [(e['name'], e['kind']) for e in index['images']] == [('a flat.tif', 'flat'), ('b stack.tif', 'stack'), ('d photo.jpg', 'flat'), ('e plain.tif', 'flat')]
    # the preview opens as a three-channel image in the page's own reader
    with tifffile.TiffFile(str(out) + '.preview.tif') as t:
        assert t.series[0].shape == (3, 120, 150), t.series[0].shape
    from image_open import open_image
    meta, planes, _ = open_image(tmp_path, str(out) + '.preview.tif')
    assert (meta['W'], meta['H']) == (150, 120) and planes.shape == (3, 120, 150), meta


@pytest.mark.skipif(not NODE, reason='node missing')
def test_choose_folders_asks_google(answers, tmp_path):
    """Choose folders… for a user whose token lasts but lacks Drive's per-file permission asks for it, then shows the picker."""
    root = tmp_path / 'drive'
    folder(root)
    run('drive_approve_driver.mjs', answers[0], answers[1], str(root))
