"""req/shell/image-viewer: a TIFF compressed the ways ImageJ, bfconvert and Pillow compress it opens in the page's
Python as its uncompressed twin does, through the bridge in Pyodide under Node (compressed_tiff_driver.mjs)."""
import json
import os
import subprocess
import sys

import numpy as np
import pytest
from PIL import Image

from test_study_runs import NODE, run

pytestmark = pytest.mark.full
HERE = os.path.dirname(os.path.abspath(__file__))
COMPRESSIONS = ('tiff_lzw', 'tiff_adobe_deflate', 'packbits')


@pytest.fixture(scope='module')
def wheels(tmp_path_factory):
    """The Image Viewer's wheels, at the versions its study.json pins."""
    d = tmp_path_factory.mktemp('wheels')
    pins = json.load(open(os.path.join(HERE, '..', 'studies', 'viewer', 'study.json')))['python']['wheels']
    subprocess.run([sys.executable, '-m', 'pip', 'download', '-q', '--no-deps', '--only-binary', ':all:', '-d', str(d), *pins], check=True)
    return str(d)


def images():
    """Large enough for many strips and for LZW's table to fill and reset: smooth ramps, which compress well, and
    noise, which does not."""
    rng = np.random.default_rng(560)
    y, x = np.mgrid[0:300, 0:420]
    grey16 = ((x * 97 + y * 13) % 4096 + rng.integers(0, 40, x.shape)).astype(np.uint16)
    rgb = np.stack([(x % 256), (y % 256), rng.integers(0, 256, x.shape)], -1).astype(np.uint8)
    return {'grey16': Image.fromarray(grey16), 'rgb': Image.fromarray(rgb)}


@pytest.fixture(scope='module')
def pairs(tmp_path_factory):
    d = tmp_path_factory.mktemp('tiffs')
    out = []
    for name, im in images().items():
        twin = str(d / f'{name}.tif')
        im.save(twin)
        for compression in COMPRESSIONS:
            f = str(d / f'{name}-{compression}.tif')
            im.save(f, compression=compression)
            out.append(f + ':' + twin)
    assert len(out) == len(images()) * len(COMPRESSIONS)
    return out


@pytest.mark.skipif(not NODE, reason='node missing')
def test_compressed_tiffs_open_as_their_twins(wheels, pairs):
    run('compressed_tiff_driver.mjs', wheels, *pairs)
