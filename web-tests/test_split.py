"""1.48: splitting an image into parts (web/split.js), run under Node (split_driver.mjs) on TIFFs written by
tifffile and Pillow, every part read back with tifffile: its pixels the crop of the image, and what the image's
file said (scale, colours, names, display ranges, slice spacing) kept, with the record of where the part lay."""
import json
import os
import shutil
import subprocess
import sys
import zipfile

import numpy as np
import pytest
import tifffile
from PIL import Image

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')
LUTS = [np.stack([np.arange(256) * k for k in rgb]).astype(np.uint8) for rgb in ((1, 0, 0), (0, 1, 0), (0, 0, 1))]


def split(tmp_path, *jobs):
    if not NODE:
        pytest.skip('node missing')
    for k, j in enumerate(jobs):
        j.setdefault('out', str(tmp_path / f'out{k}'))
        j.setdefault('source', {'name': os.path.basename(j['src']), 'sha256': 'ab' * 32})
    f = tmp_path / 'jobs.json'
    f.write_text(json.dumps(jobs))
    r = subprocess.run([NODE, os.path.join(HERE, 'split_driver.mjs'), str(f)], capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def record(t):
    line = next(l for l in t.imagej_metadata['Info'].split('\n') if l.startswith('rauntruth.split='))
    return json.loads(line.split('=', 1)[1])


def crop(a, p):
    return a[..., p['y']:p['y'] + p['height'], p['x']:p['x'] + p['width']]


@pytest.fixture
def stack(tmp_path):
    """A 16-bit ImageJ hyperstack, 5 slices of 3 channels on 70 × 90 pixels, with a scale, colours, labels,
    display ranges and an Info: (path, the pixels as Z, C, Y, X)."""
    rng = np.random.default_rng(3)
    a = rng.integers(0, 65535, (5, 3, 70, 90), dtype=np.uint16)
    path = str(tmp_path / 'stack.tif')
    labels = [f'{name} z{z}' for z in range(5) for name in ('Nav', 'Caspr', 'DAPI')]
    tifffile.imwrite(path, a, imagej=True, resolution=(1 / 0.25, 1 / 0.3),
                     metadata={'axes': 'ZCYX', 'unit': 'micron', 'spacing': 0.5, 'LUTs': LUTS, 'Labels': labels,
                               'Ranges': (10.0, 1000.0, 20.0, 2000.0, 30.0, 3000.0), 'Info': 'Acquired by hand'})
    return path, a


def test_a_part_is_the_crop_of_the_channels_and_slices_kept_and_says_where_it_lay(tmp_path, stack):
    path, a = stack
    xs, ys = [0, 25, 61, 90], [0, 30, 44, 70]
    [res] = split(tmp_path, dict(src=path, grid={'xs': xs, 'ys': ys}, left=['1,2', '3,3'], channels=[0, 2], slices=[1, 3]))
    assert res['shape'] == {'W': 90, 'H': 70, 'C': 3, 'Z': 5, 'T': 1}
    names = [f['name'] for f in res['files']]
    assert names == ['stack_r1c1.tif', 'stack_r1c3.tif', 'stack_r2c1.tif', 'stack_r2c2.tif', 'stack_r2c3.tif',
                     'stack_r3c1.tif', 'stack_r3c2.tif']
    out = tmp_path / 'out0'
    for name in names:
        with tifffile.TiffFile(out / name) as t:
            rec = record(t)
            p = rec['part']
            assert (p['x'], p['y']) == (xs[p['col'] - 1], ys[p['row'] - 1])
            assert (p['width'], p['height']) == (xs[p['col']] - p['x'], ys[p['row']] - p['y'])
            assert t.series[0].axes == 'ZCYX'
            assert np.array_equal(t.asarray(), crop(a[1:4][:, [0, 2]], p))
            ij, page = t.imagej_metadata, t.pages[0]
            assert (ij['channels'], ij['slices'], ij['unit'], ij['spacing']) == (2, 3, 'micron', 0.5)
            x, y = page.tags['XResolution'].value, page.tags['YResolution'].value
            assert (x[1] / x[0], y[1] / y[0]) == pytest.approx((0.25, 0.3))
            assert [int(np.argmax(np.asarray(l)[:, -1])) for l in ij['LUTs']] == [0, 2]
            assert ij['Labels'] == [f'{n} z{z}' for z in (1, 2, 3) for n in ('Nav', 'DAPI')]
            assert list(ij['Ranges']) == [10.0, 1000.0, 30.0, 3000.0]
            assert ij['Info'].startswith('Acquired by hand\n')
            assert rec['source'] == {'name': 'stack.tif', 'sha256': 'ab' * 32, 'width': 90, 'height': 70, 'channels': 3, 'slices': 5, 'frames': 1}
            assert (rec['channels'], rec['slices'], rec['grid']) == ([0, 2], [1, 3], {'rows': 3, 'cols': 3, 'xs': xs, 'ys': ys})
    with zipfile.ZipFile(out / 'parts.zip') as z:
        assert z.testzip() is None and z.namelist() == names
        assert z.read(names[3]) == (out / names[3]).read_bytes()


def test_the_parts_join_back_into_the_image(tmp_path, stack):
    """Every part pasted where its record says rebuilds the image: the record is enough to join the parts'
    ground truth back into the whole image's."""
    path, a = stack
    [res] = split(tmp_path, dict(src=path, grid=3))
    whole = np.zeros_like(a)
    for f in res['files']:
        with tifffile.TiffFile(tmp_path / 'out0' / f['name']) as t:
            p = record(t)['part']
            whole[:, :, p['y']:p['y'] + p['height'], p['x']:p['x'] + p['width']] = t.asarray()
    assert len(res['files']) == 9 and np.array_equal(whole, a)


def test_compressed_tiled_and_big_endian_files_split_to_the_same_parts(tmp_path, stack):
    _, a = stack
    md = {'axes': 'ZCYX', 'unit': 'micron', 'spacing': 0.5, 'LUTs': LUTS}
    zlib, big, tiled, eight = (str(tmp_path / f) for f in ('zlib.tif', 'big.tif', 'tiled.tif', 'eight.tif'))
    tifffile.imwrite(eight, (a >> 8).astype(np.uint8), imagej=True, compression='zlib', predictor=True, metadata=md)
    tifffile.imwrite(zlib, a, imagej=True, resolution=(4, 4), compression='zlib', predictor=True, rowsperstrip=7, metadata=md)
    tifffile.imwrite(big, a, byteorder='>', imagej=True, resolution=(4, 4), metadata=md)
    tifffile.imwrite(tiled, a[:, 0], tile=(32, 48), compression='zlib')
    res = split(tmp_path, dict(src=zlib, grid=2), dict(src=big, grid=2), dict(src=tiled, grid=2), dict(src=eight, grid=2))
    for k, want in ((0, a), (1, a), (2, a[:, 0]), (3, (a >> 8).astype(np.uint8))):
        assert len(res[k]['files']) == 4
        for f in res[k]['files']:
            assert np.array_equal(tifffile.imread(tmp_path / f'out{k}' / f['name']), crop(want, f['record']['part']))
    assert res[2]['shape'] == {'W': 90, 'H': 70, 'C': 1, 'Z': 5, 'T': 1}


@pytest.mark.parametrize('compression', ['tiff_lzw', 'packbits', None])
def test_an_rgb_tiff_splits_into_its_three_channels_in_the_colours_the_page_shows(tmp_path, compression):
    rng = np.random.default_rng(5)
    a = rng.integers(0, 255, (61, 83, 3), dtype=np.uint8)
    a[:30] = 7  # long runs, for the run-length and dictionary codes
    path = str(tmp_path / 'rgb.tif')
    Image.fromarray(a).save(path, compression=compression)
    look = [{'name': 'Nav1.6', 'colour': '#ff0000'}, {'name': 'Caspr', 'colour': '#00ff00'}, {'name': 'DAPI', 'colour': '#0000ff'}]
    [res] = split(tmp_path, dict(src=path, grid=2, look=look, pattern='-{n}of{rows}x{cols}'))
    assert [f['name'] for f in res['files']] == ['rgb-1of2x2.tif', 'rgb-2of2x2.tif', 'rgb-3of2x2.tif', 'rgb-4of2x2.tif']
    for f in res['files']:
        with tifffile.TiffFile(tmp_path / 'out0' / f['name']) as t:
            assert np.array_equal(t.asarray(), crop(np.moveaxis(a, -1, 0), f['record']['part']))
            ij = t.imagej_metadata
            assert ij['Labels'] == ['Nav1.6', 'Caspr', 'DAPI']
            assert [tuple(int(v) for v in np.asarray(l)[:, -1]) for l in ij['LUTs']] == [(255, 0, 0), (0, 255, 0), (0, 0, 255)]


def test_a_part_of_a_part_says_where_it_lies_in_the_first_image(tmp_path, stack):
    path, a = stack
    split(tmp_path, dict(src=path, grid={'xs': [0, 40, 90], 'ys': [0, 33, 70]}))
    [second] = split(tmp_path, dict(src=str(tmp_path / 'out0' / 'stack_r2c2.tif'), grid=2, out=str(tmp_path / 'again')))
    rec = second['files'][3]['record']
    assert rec['source']['name'] == 'stack_r2c2.tif'
    assert rec['root']['name'] == 'stack.tif' and (rec['root']['x'], rec['root']['y']) == (40 + 25, 33 + 19)
    in_root = {**rec['part'], 'x': rec['root']['x'], 'y': rec['root']['y']}
    assert np.array_equal(tifffile.imread(tmp_path / 'again' / second['files'][3]['name']), crop(a, in_root))
    [third] = split(tmp_path, dict(src=str(tmp_path / 'again' / second['files'][3]['name']), grid=2, out=str(tmp_path / 'third')))
    rec = third['files'][3]['record']
    assert rec['root']['name'] == 'stack.tif' and (rec['root']['x'], rec['root']['y']) == (65 + 13, 52 + 9)
    in_root = {**rec['part'], 'x': rec['root']['x'], 'y': rec['root']['y']}
    assert np.array_equal(tifffile.imread(tmp_path / 'third' / third['files'][3]['name']), crop(a, in_root))


def test_an_ome_tiff_and_a_float_image_split(tmp_path):
    rng = np.random.default_rng(7)
    a = rng.integers(0, 4000, (2, 4, 40, 50), dtype=np.uint16)
    ome = str(tmp_path / 'cells.ome.tif')
    tifffile.imwrite(ome, a, ome=True, metadata={'axes': 'CZYX', 'Channel': {'Name': ['Nuclei', 'Membrane']}})
    f = rng.random((40, 50)).astype(np.float32)
    flt = str(tmp_path / 'float.tif')
    tifffile.imwrite(flt, f, imagej=True)
    res = split(tmp_path, dict(src=ome, grid=2, channels=[1], slices=[2, 3]), dict(src=flt, grid=2))
    assert res[0]['shape'] == {'W': 50, 'H': 40, 'C': 2, 'Z': 4, 'T': 1}
    part = res[0]['files'][1]
    with tifffile.TiffFile(tmp_path / 'out0' / part['name']) as t:
        assert np.array_equal(t.asarray(), crop(a[1, 2:4], part['record']['part']))
        assert t.imagej_metadata['Labels'] == ['Membrane', 'Membrane']
    part = res[1]['files'][3]
    got = tifffile.imread(tmp_path / 'out1' / part['name'])
    assert got.dtype == np.float32 and np.array_equal(got, crop(f, part['record']['part']))


def test_the_split_refuses_what_it_cannot_write(tmp_path, stack):
    path, _ = stack
    res = split(tmp_path, dict(src=path, grid=2, left=['1,1', '1,2', '2,1', '2,2']), dict(src=path, grid=2, channels=[]),
                dict(src=path, grid=2, slices=[3, 5]))
    assert [r['error'] for r in res] == ['every part is left out', 'keep at least one channel', 'the slices kept must be between 1 and 5']


def test_the_nor_finder_opens_a_part(tmp_path, stack):
    path, _ = stack
    [res] = split(tmp_path, dict(src=path, grid=2, slices=[0, 0]))
    sys.path.insert(0, os.path.join(HERE, '..', 'studies', 'nor', 'detection'))
    import interactive
    meta = json.loads(interactive.Session(str(tmp_path / 'out0' / res['files'][0]['name'])).opened()[0])
    assert (meta['W'], meta['H'], meta['um']) == (45, 35, 0.25)
