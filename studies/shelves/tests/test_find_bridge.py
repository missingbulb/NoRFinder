"""req/shelves/books/open and req/shelves/books/find in the page's Python: Pyodide with only the packages the study's
study.json names, through web/bridge.js (find_bridge_driver.mjs, under Node), on a photo saved as a phone saves a HEIC,
in tiles."""
import os
import shutil
import subprocess

import pytest
from PIL import Image

from test_books import photo

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')


@pytest.mark.skipif(not NODE, reason='node missing')
def test_the_page_finds_books_on_a_tiled_heic(tmp_path):
    import pillow_heif
    path = tmp_path / 'shelf.heic'
    tile = pillow_heif.options.GRID_TILE_SIZE
    pillow_heif.options.GRID_TILE_SIZE = 128
    try:
        pillow_heif.from_pillow(Image.fromarray(photo())).save(path, quality=-1)
    finally:
        pillow_heif.options.GRID_TILE_SIZE = tile
    assert pillow_heif.open_heif(path).info.get('tiling'), 'the photo is not saved in tiles'
    r = subprocess.run([NODE, os.path.join(HERE, 'find_bridge_driver.mjs'), str(path)], capture_output=True, text=True, timeout=300)
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stdout + r.stderr
