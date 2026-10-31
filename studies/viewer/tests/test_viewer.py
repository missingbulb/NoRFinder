"""1.28: the Image Viewer shows any TIFF or PNG one plane per channel, with the names and colours the file
gives its channels, and says what the file says about the image.

Run: python3 -m pytest studies/viewer/tests
"""
import json
import os
import sys

import numpy as np
import pytest
import tifffile
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'py'))
import viewer

H, W = 30, 40


def lut(r, g, b):
    ramp = np.arange(256, dtype=np.uint8)
    return np.stack([ramp * r, ramp * g, ramp * b]).astype(np.uint8)


def planes(path):
    """The meta and the planes, one per channel the meta names."""
    meta, data = viewer.Session(path).opened()
    meta = json.loads(meta)
    assert (meta['H'], meta['W']) == (H, W)
    return meta, np.frombuffer(data, np.uint8).reshape(len(meta['channels']), H, W)


def spots(n=3):
    """n channels, each bright in its own square."""
    a = np.zeros((n, H, W), np.uint16)
    for k in range(n):
        a[k, 2 + 2 * k:6 + 2 * k, 2 + 3 * k:6 + 3 * k] = 4000
    return a


def bright(plane):
    """Where a plane is at its brightest: the square's top left corner."""
    ys, xs = np.nonzero(plane == 255)
    return int(ys.min()), int(xs.min())


def test_an_imagej_tiff_gives_each_channel_its_plane_and_its_colour(tmp_path):
    p = str(tmp_path / 'a.tif')
    # channel 0 shown blue, 1 red, 2 green
    tifffile.imwrite(p, spots(), imagej=True, resolution=(5.0, 5.0),
                     metadata={'axes': 'CYX', 'unit': 'micron', 'LUTs': [lut(0, 0, 1), lut(1, 0, 0), lut(0, 1, 0)]})
    meta, ps = planes(p)
    assert [c['colour'] for c in meta['channels']] == ['#0000ff', '#ff0000', '#00ff00']
    assert [bright(q) for q in ps] == [(2, 2), (4, 5), (6, 8)], 'each plane is its own channel, in the file\'s order'
    rows = dict(meta['info'])
    assert rows['Field'] == '8.0 × 6.0 µm (40 × 30 px)' and meta['um'] == pytest.approx(0.2)
    assert rows['Depth'] == '16-bit' and rows['Channels'] == '3'


def test_an_imagej_tiff_names_its_channels_by_their_labels(tmp_path):
    p = str(tmp_path / 'l.tif')
    tifffile.imwrite(p, spots(), imagej=True, metadata={'axes': 'CYX', 'Labels': ['DAPI', 'Caspr', 'Nav1.6']})
    meta, _ = planes(p)
    assert [c['name'] for c in meta['channels']] == ['DAPI', 'Caspr', 'Nav1.6']


def test_the_labels_imagej_makes_up_name_no_channel(tmp_path):
    p = str(tmp_path / 'auto.tif')
    labels = ['c:1/3 - Slice1_up - 2.2', 'c:2/3 - Slice1_up - 2.2', 'c:3/3 - Slice1_up - 2.2']
    tifffile.imwrite(p, spots(), imagej=True, metadata={'axes': 'CYX', 'Labels': labels, 'LUTs': [lut(0, 0, 1), lut(0, 1, 0), lut(1, 0, 0)]})
    meta, _ = planes(p)
    assert meta['channels'] == [{'colour': '#0000ff'}, {'colour': '#00ff00'}, {'colour': '#ff0000'}]


def test_an_ome_tiff_names_its_channels(tmp_path):
    p = str(tmp_path / 'o.ome.tif')
    tifffile.imwrite(p, spots(2), ome=True, metadata={'axes': 'CYX', 'Channel': {'Name': ['GFP', 'mCherry']}})
    meta, ps = planes(p)
    assert [c['name'] for c in meta['channels']] == ['GFP', 'mCherry'] and len(ps) == 2


def test_a_pixel_taller_than_wide_gives_both_sides(tmp_path):
    p = str(tmp_path / 't.tif')
    tifffile.imwrite(p, spots(), imagej=True, resolution=(5.0, 2.0), metadata={'axes': 'CYX', 'unit': 'micron'})
    meta, _ = planes(p)
    rows = dict(meta['info'])
    assert meta['um'] == pytest.approx(0.2) and meta['um_y'] == pytest.approx(0.5)
    assert rows['Field'] == '8.0 × 15.0 µm (40 × 30 px)' and rows['Pixel'] == '0.2000 × 0.5000 µm'


def test_a_mixed_colour_lut_gives_its_mixed_colour(tmp_path):
    p = str(tmp_path / 'm.tif')
    tifffile.imwrite(p, spots(1), imagej=True, metadata={'axes': 'CYX', 'LUTs': [lut(1, 0, 1)]})
    meta, _ = planes(p)
    assert [c['colour'] for c in meta['channels']] == ['#ff00ff']


def test_a_tiff_that_says_nothing_of_its_channels_leaves_their_names_and_colours_to_the_page(tmp_path):
    p = str(tmp_path / 'b.tif')
    tifffile.imwrite(p, spots(5), metadata={'axes': 'CYX'})
    meta, ps = planes(p)
    assert len(ps) == 5 and meta['channels'] == [{}] * 5, 'a fourth and fifth channel are kept too'
    assert 'Field' in dict(meta['info']) and meta['um'] is None and meta['um_y'] is None, 'a scale the file never states is not shown'


def test_past_eight_channels_the_first_eight_are_shown_and_the_box_says_so(tmp_path):
    p = str(tmp_path / 'many.tif')
    tifffile.imwrite(p, spots(10), metadata={'axes': 'CYX'})
    meta, ps = planes(p)
    assert len(ps) == 8 and dict(meta['info'])['Channels'] == '10, the first 8 shown'


def test_a_grey_image_is_one_grey_channel(tmp_path):
    p = str(tmp_path / 'g.png')
    a = np.zeros((H, W), np.uint8); a[5:10, 5:10] = 200
    Image.fromarray(a).save(p)
    meta, (g,) = planes(p)
    assert meta['channels'] == [{'name': 'Grey', 'colour': '#ffffff'}] and g[7, 7] == 255


def test_a_colour_png_is_red_green_and_blue(tmp_path):
    p = str(tmp_path / 'c.png')
    a = np.zeros((H, W, 3), np.uint8); a[5:10, 5:10, 0] = 200; a[20:25, 20:25, 2] = 200
    Image.fromarray(a).save(p)
    meta, (r, g, b) = planes(p)
    assert [c['name'] for c in meta['channels']] == ['Red', 'Green', 'Blue']
    assert [c['colour'] for c in meta['channels']] == ['#ff0000', '#00ff00', '#0000ff']
    assert r[7, 7] == 255 and b[7, 7] == 0 and b[22, 22] == 255 and not g.any()
    assert dict(meta['info'])['Depth'] == '8-bit RGB'


def test_it_offers_no_action(tmp_path):
    p = str(tmp_path / 'g.png')
    Image.fromarray(np.zeros((H, W), np.uint8)).save(p)
    with pytest.raises(ValueError):
        viewer.Session(p).call('detect', {})
