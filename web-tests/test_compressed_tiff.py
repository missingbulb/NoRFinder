"""req/shell/image-viewer, req/shell/image/open: a TIFF compressed the ways ImageJ, bfconvert and Pillow compress it
opens in the page's own reader (web/image_open.js, under Node) as its uncompressed twin does."""
import os

import numpy as np
import pytest
from PIL import Image

from image_open import open_images

pytestmark = pytest.mark.full
HERE = os.path.dirname(os.path.abspath(__file__))
COMPRESSIONS = ('tiff_lzw', 'tiff_adobe_deflate', 'packbits')


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


def test_compressed_tiffs_open_as_their_twins(pairs, tmp_path):
    files = [f for pair in pairs for f in pair.split(':')]
    got = open_images(tmp_path, *files)
    for (meta, planes, _), (twin_meta, twin, _), pair in zip(got[0::2], got[1::2], pairs):
        assert (meta['W'], meta['H'], len(meta['channels'])) == (twin_meta['W'], twin_meta['H'], len(twin_meta['channels'])), pair
        assert np.array_equal(planes, twin), pair
