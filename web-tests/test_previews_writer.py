"""1.68: the page's previews writer (web/previews_writer.js, under Node by previews_writer_driver.mjs) makes the same
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


def write(images, out, old=None):
    r = subprocess.run([NODE, os.path.join(HERE, 'previews_writer_driver.mjs'), str(images), str(out), *([str(old)] if old else [])],
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
