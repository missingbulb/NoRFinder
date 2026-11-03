"""req/shell/data/edit, req/shell/preprocessing/split: Edit Image's own functions (web/edit.js, and web/split.js as
Save… calls it), run under Node by edit_driver.mjs: the drawing of an edited stack (its crop, parts apart, slices
and channels kept, imperfections blank), the slices suggested, the lasso's mask, and the files saved, bit for bit
the image's own outside the imperfections."""
import json
import os
import shutil
import subprocess

import numpy as np
import pytest
import tifffile
from PIL import Image, ImageDraw

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')


def run(tmp_path, *jobs):
    if not NODE:
        pytest.skip('node missing')
    f = tmp_path / 'jobs.json'
    f.write_text(json.dumps(jobs))
    r = subprocess.run([NODE, os.path.join(HERE, 'edit_driver.mjs'), str(f)], capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def page_planes(stack):
    """The page's planes for a stack of C, Z, H, W 8-bit values: the brightest of each channel, then every slice."""
    return np.concatenate([stack.max(axis=1).ravel(), stack.ravel()]).astype(np.uint8)


def test_the_drawing_of_an_edit(tmp_path):
    C, Z, H, W = 2, 6, 40, 50
    rng = np.random.default_rng(1)
    stack = rng.integers(10, 250, (C, Z, H, W), dtype=np.uint8)
    (tmp_path / 'p').write_bytes(page_planes(stack).tobytes())
    edit = {'crop': {'x0': 4, 'y0': 2, 'x1': 44, 'y1': 38}, 'xs': [4, 20, 44], 'ys': [2, 38], 'left': ['1,2'], 'z': [1, 3], 'channels': [0]}
    square = [[10, 10], [16, 10], [16, 16], [10, 16]]
    [d] = run(tmp_path, {'op': 'derive', 'planes': str(tmp_path / 'p'), 'W': W, 'H': H, 'Z': Z, 'edit': edit, 'polygons': [square], 'out': str(tmp_path / 'd')})
    gap = max(4, round(0.06 * max(W, H)))
    assert d == {'W': 40 + gap, 'H': 36, 'Z': 3}, d
    got = np.frombuffer((tmp_path / 'd').read_bytes(), np.uint8)
    m = d['W'] * d['H']
    slices = got[C * m:].reshape(C, 3, d['H'], d['W'])
    # the first part as it was, bar the imperfection; the gap empty; the part left out a third as bright
    want = stack[0, 1:4, 2:38, 4:20].copy()
    want[:, 8:14, 6:12] = 0
    assert np.array_equal(slices[0, :, :, :16], want)
    assert not slices[0, :, :, 16:16 + gap].any()
    assert np.array_equal(slices[0, :, :, 16 + gap:], stack[0, 1:4, 2:38, 20:44] // 3)
    assert not slices[1].any(), 'a dropped channel is empty'
    flat = got[:C * m].reshape(C, d['H'], d['W'])
    assert np.array_equal(flat[0], slices[0].max(axis=0)), 'the flattened plane is the brightest of the slices kept'


def test_the_slices_suggested(tmp_path):
    Z, H, W = 20, 64, 64
    stack = np.full((1, Z, H, W), 20, np.uint8)
    for z in range(5, 15):
        stack[0, z, :8, :] = 220  # an eighth of the slice bright: its 99th percentile stands out
    stack[0, 16, 0, :20] = 220     # one row: below the 99th percentile
    stack[0, 17:19, :8, :] = 60    # faint: a fifth of the best slice's signal, short of a quarter
    (tmp_path / 'p').write_bytes(page_planes(stack).tobytes())
    [s] = run(tmp_path, {'op': 'suggest', 'planes': str(tmp_path / 'p'), 'W': W, 'H': H, 'Z': Z})
    assert s['suggested'] == [5, 14], s


def test_the_lasso_fills_what_it_encloses(tmp_path):
    poly = [[3.2, 4.1], [40.7, 8.3], [30.5, 35.9], [6.4, 28.2]]
    [r] = run(tmp_path, {'op': 'mask', 'polygons': [poly], 'W': 48, 'H': 40, 'out': str(tmp_path / 'm')})
    got = np.frombuffer((tmp_path / 'm').read_bytes(), np.uint8).reshape(40, 48)
    ref = Image.new('1', (48, 40))
    ImageDraw.Draw(ref).polygon([tuple(p) for p in poly], fill=1)
    ref = np.asarray(ref, np.uint8)
    # the same region, give or take its edge pixels
    assert abs(int(got.sum()) - int(ref.sum())) < 0.08 * ref.sum() and (got & ref).sum() > 0.9 * ref.sum()
    assert r['share'] == pytest.approx(got.mean())


def test_saving_keeps_the_images_own_pixels(tmp_path):
    C, Z, H, W = 2, 8, 60, 70
    rng = np.random.default_rng(2)
    stack = rng.integers(1, 60000, (Z, C, H, W), dtype=np.uint16)
    src = tmp_path / 'acme.tif'
    tifffile.imwrite(src, stack, imagej=True, metadata={'axes': 'ZCYX', 'spacing': 0.5, 'unit': 'micron'}, resolution=(5, 5))
    tri = [[20, 20], [40, 22], [30, 45]]
    edit = {'crop': {'x0': 10, 'y0': 5, 'x1': 60, 'y1': 55}, 'xs': [10, 35, 60], 'ys': [5, 30, 55], 'left': ['2,2'], 'z': [2, 5], 'channels': [1]}
    [files] = run(tmp_path, {'op': 'save', 'src': str(src), 'edit': edit, 'polygons': [tri], 'pattern': '_r{row}c{col}', 'out': str(tmp_path / 'out')})
    assert [f['name'] for f in files] == ['acme_r1c1.tif', 'acme_r1c2.tif', 'acme_r2c1.tif']
    mask = np.asarray(Image.new('1', (W, H)), np.uint8)
    [m] = run(tmp_path, {'op': 'mask', 'polygons': [tri], 'W': W, 'H': H, 'out': str(tmp_path / 'm')})
    mask = np.frombuffer((tmp_path / 'm').read_bytes(), np.uint8).reshape(H, W).astype(bool)
    for f in files:
        rec = f['record']
        assert rec['removed'] == [tri] and rec['slices'] == [2, 5] and rec['channels'] == [1]
        p = rec['part']
        got = tifffile.imread(tmp_path / 'out' / f['name'])
        want = stack[2:6, 1, p['y']:p['y'] + p['height'], p['x']:p['x'] + p['width']].copy()
        want[:, mask[p['y']:p['y'] + p['height'], p['x']:p['x'] + p['width']]] = 0
        assert got.shape == want.shape and np.array_equal(got, want), f['name']
    assert mask[30, 30], 'the triangle covers the middle part of the crop'
