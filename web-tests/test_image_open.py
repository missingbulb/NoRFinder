"""req/shell/image/open: the page reads and shows the image itself (web/image_open.js, under Node through
image_open_driver.mjs). On TIFFs written by tifffile in the shapes the studies meet, its 8-bit planes and slices are
the Image Viewer's Python's (studies/viewer/py/viewer.py) to the bit, and so are its channels' names and colours and
what it says of the file; a study's upper quantile and an 8-bit image kept as stored are honoured."""
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
ROOT = os.path.join(HERE, '..')
NODE = shutil.which('node')
sys.path.insert(0, os.path.join(ROOT, 'studies', 'viewer', 'py'))
sys.path.insert(0, os.path.join(ROOT, 'studies', 'nor', 'detection'))
import viewer
import naive_nor

RED, GREEN, BLUE = (np.stack([np.arange(256) * k for k in rgb]).astype(np.uint8) for rgb in ((1, 0, 0), (0, 1, 0), (0, 0, 1)))


def opened(tmp_path, *jobs):
    if not NODE:
        pytest.skip('node missing')
    for k, j in enumerate(jobs):
        j.update(planes=str(tmp_path / f'p{k}.bin'), volume=str(tmp_path / f'v{k}.bin'))
    f = tmp_path / 'jobs.json'
    f.write_text(json.dumps(jobs))
    r = subprocess.run([NODE, os.path.join(HERE, 'image_open_driver.mjs'), str(f)], capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stderr
    out = [json.loads(l) for l in r.stdout.splitlines()]
    for j, o in zip(jobs, out):
        assert 'error' not in o, o
        o['planes'] = open(j['planes'], 'rb').read()
        o['volume_bytes'] = open(j['volume'], 'rb').read() if o['volume'] else b''
    return out


def same_as_the_viewer(path, got):
    s = viewer.Session(path)
    assert (got['W'], got['H'], got['Z']) == (s.planes.shape[2], s.planes.shape[1], s.Z)
    assert got['planes'] == s.planes.tobytes(), f'{np.count_nonzero(np.frombuffer(got["planes"], np.uint8) != s.planes.ravel())} pixels differ'
    assert got['volume_bytes'] == (s.volume.tobytes() if s.Z > 1 else b'')
    assert got['channels'] == s.channels
    assert (got['um'], got['umY'], got['spacing']) == (s.um, s.um_y, s.spacing)
    assert [r for r in got['info'] if r[0] not in ('Series', 'Microscope', 'Date')] == s.info


def noise(shape, dtype, seed):
    rng = np.random.default_rng(seed)
    hi = np.iinfo(dtype).max if np.issubdtype(dtype, np.integer) else 1.0
    return (rng.gamma(2.0, hi / 12, shape)).clip(0, hi).astype(dtype)


def test_an_imagej_hyperstack_with_colours_labels_scale_and_spacing(tmp_path):
    p = str(tmp_path / 'stack.tif')
    tifffile.imwrite(p, noise((5, 2, 60, 70), np.uint16, 1), imagej=True, resolution=(1.818181, 1.818181),
                     metadata={'axes': 'ZCYX', 'unit': 'micron', 'spacing': 2.0, 'LUTs': [RED, GREEN], 'Labels': ['DAPI', 'CD31'] * 5})
    got, = opened(tmp_path, {'file': p})
    same_as_the_viewer(p, got)
    assert got['Z'] == 5 and [c['colour'] for c in got['channels']] == ['#ff0000', '#00ff00']


def test_plain_pages_are_its_slices(tmp_path):
    p = str(tmp_path / 'pages.tif')
    with tifffile.TiffWriter(p) as w:
        for k in range(4):
            w.write(noise((40, 30), np.uint8, k), metadata=None)
    got, = opened(tmp_path, {'file': p})
    same_as_the_viewer(p, got)
    assert got['Z'] == 4


def test_a_compressed_three_channel_export_and_what_it_says(tmp_path):
    p = str(tmp_path / 'nor.tif')
    labels = [f'c:{k}/3 - Slice1_up - 2.2' for k in (1, 2, 3)]
    tifffile.imwrite(p, noise((3, 50, 64), np.uint16, 2), imagej=True, compression='zlib', resolution=(5.727272, 5.727272),
                     metadata={'axes': 'CYX', 'unit': 'micron', 'Labels': labels, 'LUTs': [BLUE, GREEN, RED]},
                     extratags=[(271, 's', 0, 'Acme', True), (272, 's', 0, 'Scope 9', True), (306, 's', 0, '2026:10:01 12:00:00', True)])
    got, = opened(tmp_path, {'file': p})
    same_as_the_viewer(p, got)
    said = dict(got['info'])
    for k, v in naive_nor.file_info(p):
        assert said[k] == v, k


def test_float_samples_and_an_rgb_tiff(tmp_path):
    f, c = str(tmp_path / 'float.tif'), str(tmp_path / 'rgb.tif')
    tifffile.imwrite(f, noise((45, 55), np.float32, 3))
    tifffile.imwrite(c, noise((30, 40, 3), np.uint8, 4), photometric='rgb')
    for path, got in zip((f, c), opened(tmp_path, {'file': f}, {'file': c})):
        same_as_the_viewer(path, got)


def test_an_ome_tiff_names_its_channels(tmp_path):
    p = str(tmp_path / 'ome.ome.tif')
    tifffile.imwrite(p, noise((2, 3, 32, 32), np.uint16, 5), ome=True, metadata={'axes': 'CZYX', 'Channel': {'Name': ['Nuclei', 'Vessels']}})
    got, = opened(tmp_path, {'file': p})
    same_as_the_viewer(p, got)
    assert [c.get('name') for c in got['channels']] == ['Nuclei', 'Vessels']


def test_a_studys_upper_quantile_and_an_image_kept_as_stored(tmp_path):
    p, e = str(tmp_path / 'q.tif'), str(tmp_path / 'eight.tif')
    a, b = noise((3, 40, 50), np.uint16, 6), noise((30, 20), np.uint8, 7)
    tifffile.imwrite(p, a, imagej=True, metadata={'axes': 'ZYX'})
    tifffile.imwrite(e, b)
    upper, kept = opened(tmp_path, {'file': p, 'view': {'upper': 0.999}}, {'file': e, 'view': {'stretch': False}})
    lo, hi = np.quantile(a, 0.005), np.quantile(a, 0.999)
    want = (np.clip((a.astype(np.float64) - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)
    assert upper['volume_bytes'] == want.tobytes() and upper['planes'] == want.max(axis=0).tobytes()
    assert kept['planes'] == b.tobytes()
