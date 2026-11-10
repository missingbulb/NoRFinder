"""req/shell/data/update-previews: the page's previews writer (web/previews_writer.js, under Node by previews_writer_driver.mjs) makes the same
file dev/tools/previews/make_previews.py makes: the same index, pages of the same sizes and nearly the same
pixels; and, given an older file, keeps the previews still valid and makes only the rest."""
import json
import os
import shutil
import subprocess
import sys

import numpy as np
import pytest
import tifffile

from test_drive_previews_page import folder

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, '..')
NODE = shutil.which('node')
TOOL = os.path.join(REPO, 'dev', 'tools', 'previews', 'make_previews.py')


def write(images, out, old=None, tiffs=None):
    r = subprocess.run([NODE, os.path.join(HERE, 'previews_writer_driver.mjs'), str(images), str(out), str(old or '-'), *([str(tiffs)] if tiffs else [])],
                       capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def read(path):
    with tifffile.TiffFile(path) as t:
        return json.loads(t.pages[0].description), [p.asarray() for p in t.pages]


@pytest.mark.skipif(not NODE, reason='node missing')
def test_the_page_writes_what_the_tool_writes(tmp_path):
    images = tmp_path / 'images'
    folder(str(images))
    big = np.zeros((40, 2, 300, 260), np.uint16)
    big[:, 0, 100:200, 50:90] = np.arange(40)[:, None, None] * 50
    tifffile.imwrite(images / 'e big stack.tif', big, imagej=True, metadata={'axes': 'ZCYX', 'spacing': 0.5})
    y, x = np.mgrid[0:300, 0:420]
    wide = np.stack([((x * 7) % 900).astype(np.uint16), ((y * 11) % 700).astype(np.uint16)])
    tifffile.imwrite(images / 'f big flat.tif', wide, imagej=True, metadata={'axes': 'CYX'})
    subprocess.run([sys.executable, TOOL, str(images)], check=True)
    tool_index, tool_pages = read(images / 'rauntruth-previews.tiff')
    os.rename(images / 'rauntruth-previews.tiff', tmp_path / 'tool.tiff')
    assert write(images, tmp_path / 'page.tiff')['made'] == [e['name'] for e in tool_index['images']]
    page_index, page_pages = read(tmp_path / 'page.tiff')
    assert page_index == tool_index
    assert [p.shape for p in page_pages] == [p.shape for p in tool_pages]
    for k, (a, b) in enumerate(zip(page_pages, tool_pages)):
        diff = np.abs(a.astype(int) - b.astype(int))
        assert diff.mean() < 1.5 and np.percentile(diff, 99) <= 6, (k, diff.mean(), diff.max())


@pytest.mark.skipif(not NODE, reason='node missing')
def test_it_keeps_the_previews_still_valid(tmp_path):
    images = tmp_path / 'images'
    folder(str(images))
    first = write(images, tmp_path / 'old.tiff')
    with open(images / 'c changed.tif', 'ab') as f:
        f.write(b'\0')
    again = write(images, tmp_path / 'new.tiff', tmp_path / 'old.tiff')
    assert again == {'kept': ['a flat.tif', 'b stack.tif', 'd new.tif'], 'made': ['c changed.tif']}, again
    old_index, old_pages = read(tmp_path / 'old.tiff')
    new_index, new_pages = read(tmp_path / 'new.tiff')
    assert [e['name'] for e in new_index['images']] == first['made']
    for e in new_index['images']:
        if e['name'] == 'c changed.tif':
            continue
        o = next(x for x in old_index['images'] if x['name'] == e['name'])
        for i in range(e['pages']):
            assert np.array_equal(new_pages[e['page'] + i], old_pages[o['page'] + i])


@pytest.mark.skipif(not NODE, reason='node missing')
def test_a_stacks_preview_opens_in_3d(tmp_path):
    """req/shell/data/preview-images: the TIFF Data Management writes for a stack's preview opens in the page's own reader
    as a stack: its mini-volume's slices and channels, the slice spacing scaled to them."""
    images, tiffs = tmp_path / 'images', tmp_path / 'tiffs'
    images.mkdir()
    tiffs.mkdir()
    stack = np.zeros((40, 2, 300, 260), np.uint16)
    stack[:, 0, 100:200, 50:90] = 3000
    tifffile.imwrite(images / 'z.tif', stack, imagej=True, metadata={'axes': 'ZCYX', 'spacing': 0.5})
    write(images, tmp_path / 'p.tiff', tiffs=tiffs)
    from image_open import open_image
    meta, _, _ = open_image(tmp_path, str(tiffs / 'z.preview.tif'))
    assert (meta['Z'], meta['W'], meta['H']) == (24, 83, 96), meta
    assert meta['spacing'] == pytest.approx(0.5 * 40 / 24), meta


@pytest.mark.skipif(not NODE, reason='node missing')
def test_a_heic_photo_gets_a_preview_whatever_its_name_says(tmp_path):
    """A phone's HEIC photo, under its own name and under a JPEG's, is read as the viewer reads it, so its preview is
    the one the same pixels make as a TIFF."""
    import pillow_heif
    from PIL import Image
    images = tmp_path / 'images'
    images.mkdir()
    rng = np.random.default_rng(3)
    a = np.repeat(np.repeat(rng.integers(0, 256, (12, 16, 3)), 8, 0), 8, 1).astype(np.uint8)
    pillow_heif.from_pillow(Image.fromarray(a)).save(images / 'a photo.heic', quality=-1)
    shutil.copy(images / 'a photo.heic', images / 'b photo.jpg')
    decoded = np.asarray(pillow_heif.open_heif(images / 'a photo.heic').to_pillow().convert('RGB'))
    tifffile.imwrite(images / 'c same pixels.tif', decoded.transpose(2, 0, 1).copy(), imagej=True, metadata={'axes': 'CYX'})
    assert write(images, tmp_path / 'p.tiff')['made'] == ['a photo.heic', 'b photo.jpg', 'c same pixels.tif']
    index, pages = read(tmp_path / 'p.tiff')
    heic, jpg, tif = (pages[e['page']] for e in index['images'])
    assert heic.shape == tif.shape == (96, 128, 3)
    assert np.array_equal(heic, jpg)
    assert np.abs(heic.astype(int) - tif.astype(int)).mean() < 2
