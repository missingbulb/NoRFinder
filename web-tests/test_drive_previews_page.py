"""req/shell/drive/previews: a folder's rauntruth-previews.tiff, made by dev/tools/previews/make_previews.py from synthetic ImageJ TIFFs,
previews the images it covers in the Google Drive dialog (drive_previews_driver.mjs, in headless Chromium)."""
import json
import os
import shutil
import subprocess
import sys

import numpy as np
import pytest
import tifffile
from PIL import Image

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, '..')
NODE = shutil.which('node')


def folder(path):
    """A flat three-channel image, a two-channel stack with a tube crossing its slices, two more TIFFs and a PNG."""
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
    Image.fromarray(np.full((40, 60, 3), 160, np.uint8)).save(os.path.join(path, 'f covered.png'))


def with_photo(previews, photo):
    """The previews file with a dark picture of the photo added, as files made before photos were left to Drive's own
    small picture carry one."""
    import hashlib
    with tifffile.TiffFile(previews) as t:
        index, pages = json.loads(t.pages[0].description), [p.asarray() for p in t.pages]
    sha = hashlib.sha256(open(photo, 'rb').read()).hexdigest()
    index['images'].append({'name': os.path.basename(photo), 'sha256': sha, 'page': len(pages), 'pages': 1, 'kind': 'flat', 'channels': 3,
                            'colours': [[1, 0, 0], [0, 1, 0], [0, 0, 1]]})
    index['images'].sort(key=lambda e: e['name'])
    pages.append(np.zeros((8, 8, 3), np.uint8))
    with tifffile.TiffWriter(previews) as w:
        for i, p in enumerate(pages):
            w.write(p, photometric='rgb' if p.ndim == 3 else 'minisblack', metadata=None, description=json.dumps(index) if i == 0 else None)


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


def test_previews_leave_photos_to_drive(tmp_path):
    """A JPEG, the photo a study may open beside TIFFs and PNGs, gets no preview, Drive's own small picture showing it; nor does
    a file no image reader opens."""
    sys.path.insert(0, os.path.join(REPO, 'dev', 'tools', 'previews'))
    import make_previews
    images = tmp_path / 'images'
    images.mkdir()
    Image.fromarray(np.zeros((30, 50, 3), np.uint8)).save(images / 'photo.jpg')
    (images / 'photo.ground_truth.json').write_text('{}')
    tifffile.imwrite(images / 'flat.tif', np.zeros((1, 20, 20), np.uint16), imagej=True, metadata={'axes': 'CYX'})
    make_previews.main(str(images))
    with tifffile.TiffFile(images / 'rauntruth-previews.tiff') as t:
        index = json.loads(t.pages[0].description)
    assert [e['name'] for e in index['images']] == ['flat.tif']


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
    Image.fromarray(np.full((40, 60, 3), 90, np.uint8)).save(images / 'e photo.jpg')
    with_photo(images / 'rauntruth-previews.tiff', images / 'e photo.jpg')
    r = subprocess.run([NODE, os.path.join(HERE, 'drive_previews_driver.mjs'), str(images)], capture_output=True, text=True, timeout=90)
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stdout + r.stderr
