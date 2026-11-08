"""req/shell/image/open: the page reads and shows the image itself (web/image_open.js, under Node through
image_open_driver.mjs). On TIFFs written by tifffile in the shapes the studies meet, its 8-bit planes and slices are
the rule's own in numpy (numpy_view.py) to the bit, and so are its channels' names and colours and what it says of
the file; a study's upper quantile, its black-point method and an 8-bit image kept as stored are honoured."""
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
from numpy_view import View

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


def same_as_the_viewer(path, got, black=None):
    s = View(path, black=black)
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
    assert (said['Series'], said['Microscope'], said['Date']) == ('Slice1_up - 2.2', 'Acme Scope 9', '2026:10:01 12:00:00')


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
    upper, kept = opened(tmp_path, {'file': p, 'view': {'upper': 0.999, 'blackPoint': 'quantile'}}, {'file': e, 'view': {'stretch': False}})
    lo, hi = np.quantile(a, 0.005), np.quantile(a, 0.999)
    want = (np.clip((a.astype(np.float64) - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)
    assert upper['volume_bytes'] == want.tobytes() and upper['planes'] == want.max(axis=0).tobytes()
    assert kept['planes'] == b.tobytes()


def vessels(seed):
    """A confocal-like stack: dim noisy background over most of the field, a few bright lines through it."""
    rng = np.random.default_rng(seed)
    a = rng.normal(900, 120, (4, 80, 90))
    a[:, 20:23, :] += 6000
    a[:, :, 40:42] += 3000
    return a.clip(0, 65535).astype(np.uint16)


def test_a_fluorescence_tiff_puts_its_black_point_at_the_triangle_knee(tmp_path):
    p, q = str(tmp_path / 'cd31.tif'), str(tmp_path / 'cd31_q.tif')
    tifffile.imwrite(p, vessels(8), imagej=True, metadata={'axes': 'ZYX'})
    tifffile.imwrite(q, vessels(8), imagej=True, metadata={'axes': 'ZYX'})
    got, old = opened(tmp_path, {'file': p}, {'file': q, 'view': {'blackPoint': 'quantile'}})
    same_as_the_viewer(p, got)
    dark = lambda o: np.mean(np.frombuffer(o['volume_bytes'], np.uint8) == 0)
    # the background goes black, the vessels stay lit; the 0.5% quantile alone left the background grey
    assert dark(got) > 0.5 and dark(old) < 0.05
    v = np.frombuffer(got['volume_bytes'], np.uint8).reshape(4, 80, 90)
    assert v[:, 20:23, :].min() > 0 and v[:, :, 40:42].min() > 0


def test_a_studys_background_black_point(tmp_path):
    p = str(tmp_path / 'vascular.tif')
    a = vessels(9)
    tifffile.imwrite(p, a, imagej=True, metadata={'axes': 'ZYX'})
    got, = opened(tmp_path, {'file': p, 'view': {'upper': 0.999, 'blackPoint': 'background'}})
    s = View(p, upper=0.999, black='background')
    assert got['volume_bytes'] == s.volume.tobytes() and got['planes'] == s.planes.tobytes()
    # about 2.5 standard deviations of noise over the median: all but about 0.6% of the background is black
    bg = np.frombuffer(got['volume_bytes'], np.uint8).reshape(4, 80, 90)[:, 30:, 50:]
    assert 0.98 < np.mean(bg == 0) < 1.0


def test_a_photo_keeps_the_low_quantile(tmp_path):
    p = str(tmp_path / 'photo.tif')
    a = vessels(10)
    tifffile.imwrite(p, np.stack([(a[0] // 16).clip(0, 255).astype(np.uint8)] * 3, axis=-1), photometric='rgb')
    got, = opened(tmp_path, {'file': p})
    same_as_the_viewer(p, got)
    assert np.mean(np.frombuffer(got['planes'], np.uint8) == 0) < 0.05


def test_a_studys_flattened_window(tmp_path):
    p = str(tmp_path / 'vascular.tif')
    tifffile.imwrite(p, vessels(11), imagej=True, metadata={'axes': 'ZYX'})
    got, = opened(tmp_path, {'file': p, 'view': {'upper': 0.999, 'blackPoint': 'flattened'}})
    s = View(p, upper=0.999, black='flattened')
    assert got['volume_bytes'] == s.volume.tobytes() and got['planes'] == s.planes.tobytes()
    # the flattened image runs from black at its 1% point to full colour at its 98.7% one
    flat = np.frombuffer(got['planes'], np.uint8)
    assert 0.005 < np.mean(flat == 0) < 0.03 and 0.005 < np.mean(flat == 255) < 0.03
