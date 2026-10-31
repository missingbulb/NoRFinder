"""1.48: the shell's Preprocessing drawer and its Split into parts, on the Image Viewer, a study with nothing of its
own, in headless Chromium with a stand-in worker
(split_page_driver.mjs): the dialog's grid, lines, parts left out, channels, slices and file names, then the ZIP
it downloads, each part read back with tifffile as the crop of the image the dialog showed."""
import json
import os
import shutil
import subprocess
import zipfile

import numpy as np
import pytest
import tifffile

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')
LUTS = [np.stack([np.arange(256) * k for k in rgb]).astype(np.uint8) for rgb in ((1, 0, 0), (0, 1, 0), (0, 0, 1))]


@pytest.mark.skipif(not NODE, reason='node missing')
def test_the_dialog_splits_the_image_into_the_parts_chosen(tmp_path):
    ready = tmp_path / 'ready.json'
    ready.write_text('{}')
    rng = np.random.default_rng(11)
    a = rng.integers(0, 4095, (4, 3, 60, 80), dtype=np.uint16)
    image = str(tmp_path / 'stack.tif')
    tifffile.imwrite(image, a, imagej=True, resolution=(4, 4), metadata={'axes': 'ZCYX', 'unit': 'micron', 'LUTs': LUTS})
    out = tmp_path / 'out'
    shots = os.environ.get('SPLIT_SHOTS')
    r = subprocess.run([NODE, os.path.join(HERE, 'split_page_driver.mjs'), str(ready), image, '80', '60', str(out), *([shots] if shots else [])],
                       capture_output=True, text=True, timeout=180)
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stderr
    cuts = dict(c.split('=') for c in json.loads(r.stdout)['cuts'])
    with zipfile.ZipFile(out / 'parts.zip') as z:
        names = z.namelist()
        assert names == [f'stack_part{n}.tif' for n in (1, 2, 3, 4, 6, 7, 8, 9)]
        z.extractall(out)
    for name in names:
        with tifffile.TiffFile(out / name) as t:
            rec = json.loads(t.imagej_metadata['Info'].split('rauntruth.split=', 1)[1])
            p = rec['part']
            assert (rec['channels'], rec['slices'], rec['source']['name']) == ([0, 1], [1, 2], 'stack.tif')
            assert rec['grid']['xs'][1] == int(cuts['x1']) > 80 / 3
            assert np.array_equal(t.asarray(), a[1:3, :2, p['y']:p['y'] + p['height'], p['x']:p['x'] + p['width']])
