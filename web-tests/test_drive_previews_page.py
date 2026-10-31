"""1.42: a folder's rauntruth-previews.tiff, made by dev/tools/previews/make_previews.py from synthetic ImageJ TIFFs,
previews the images it covers in the Google Drive dialog (drive_previews_driver.mjs, in headless Chromium)."""
import json
import os
import shutil
import subprocess
import sys

import numpy as np
import pytest
import tifffile

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, '..')
NODE = shutil.which('node')


def folder(path):
    """A flat three-channel image, a two-channel stack with a tube crossing its slices, and two more images."""
    os.makedirs(path)
    y, x = np.mgrid[0:200, 0:200]
    flat = np.stack([(x * 20).astype(np.uint16), (y * 20).astype(np.uint16), ((x + y) * 10).astype(np.uint16)])
    tifffile.imwrite(os.path.join(path, 'a flat.tif'), flat, imagej=True, metadata={'axes': 'CYX'})
    stack = np.zeros((12, 2, 200, 200), np.uint16)
    for z in range(12):
        stack[z, 0][((x - 30 - 12 * z) ** 2 + (y - 100) ** 2) < 300] = 3000
        stack[z, 1][(abs(x - 150) < 25) & (abs(y - 50) < 25)] = 3000
    tifffile.imwrite(os.path.join(path, 'b stack.tif'), stack, imagej=True, metadata={'axes': 'ZCYX'})
    for name in ('c changed.tif', 'd new.tif'):
        tifffile.imwrite(os.path.join(path, name), flat[:1], imagej=True, metadata={'axes': 'CYX'})


def test_previews_keep_the_files_colours(tmp_path):
    """Each channel in the colour its ImageJ LUT shows it in; red, green and blue in order without LUTs."""
    sys.path.insert(0, os.path.join(REPO, 'dev', 'tools', 'previews'))
    import make_previews
    images = tmp_path / 'images'
    images.mkdir()
    planes = np.zeros((3, 40, 40), np.uint16)
    planes[0, :, :20] = 3000
    ramp = np.arange(256, dtype=np.uint8)
    luts = [np.stack([ramp * 0, ramp, ramp * 0]), np.stack([ramp, ramp * 0, ramp * 0]), np.stack([ramp * 0, ramp * 0, ramp])]
    tifffile.imwrite(images / 'lut.tif', planes, imagej=True, metadata={'axes': 'CYX', 'LUTs': luts, 'mode': 'composite'})
    tifffile.imwrite(images / 'plain.tif', planes, imagej=True, metadata={'axes': 'CYX'})
    make_previews.main(str(images))
    with tifffile.TiffFile(images / 'rauntruth-previews.tiff') as t:
        index = json.loads(t.pages[0].description)
        cols = {e['name']: e['colours'] for e in index['images']}
        lit = {e['name']: t.pages[e['page']].asarray()[20, 5] for e in index['images']}
    assert cols == {'lut.tif': [[0, 1, 0], [1, 0, 0], [0, 0, 1]], 'plain.tif': [[1, 0, 0], [0, 1, 0], [0, 0, 1]]}
    # the first channel alone lit: green where its LUT is green, red without one
    assert lit['lut.tif'][1] > 200 and lit['lut.tif'][0] < 50
    assert lit['plain.tif'][0] > 200 and lit['plain.tif'][1] < 50


@pytest.mark.skipif(not NODE, reason='node missing')
def test_drive_previews(tmp_path):
    images = tmp_path / 'images'
    folder(str(images))
    subprocess.run([sys.executable, os.path.join(REPO, 'dev', 'tools', 'previews', 'make_previews.py'), str(images)], check=True)
    # made before d new.tif joined the folder, and before c changed.tif changed
    os.remove(images / 'd new.tif')
    subprocess.run([sys.executable, os.path.join(REPO, 'dev', 'tools', 'previews', 'make_previews.py'), str(images)], check=True)
    tifffile.imwrite(images / 'd new.tif', np.zeros((1, 50, 50), np.uint16), imagej=True, metadata={'axes': 'CYX'})
    with open(images / 'c changed.tif', 'ab') as f:
        f.write(b'\0')
    r = subprocess.run([NODE, os.path.join(HERE, 'drive_previews_driver.mjs'), str(images)], capture_output=True, text=True, timeout=90)
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stdout + r.stderr
