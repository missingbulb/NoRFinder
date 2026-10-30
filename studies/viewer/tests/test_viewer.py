"""1.28: the Image Viewer shows any TIFF or PNG in the colours the file gives its channels, and says
what the file says about the image.

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
    meta, data = viewer.Session(path).opened()
    meta = json.loads(meta)
    assert (meta['H'], meta['W']) == (H, W)
    return meta, np.frombuffer(data, np.uint8).reshape(3, H, W)


def spots():
    """Three channels, each bright in its own square."""
    a = np.zeros((3, H, W), np.uint16)
    a[0, 2:8, 2:8] = 4000
    a[1, 12:18, 12:18] = 4000
    a[2, 22:28, 30:36] = 4000
    return a


def test_an_imagej_tiff_shows_each_channel_in_its_own_colour(tmp_path):
    p = str(tmp_path / 'a.tif')
    # channel 0 shown blue, 1 red, 2 green
    tifffile.imwrite(p, spots(), imagej=True, resolution=(5.0, 5.0),
                     metadata={'axes': 'CYX', 'unit': 'micron', 'LUTs': [lut(0, 0, 1), lut(1, 0, 0), lut(0, 1, 0)]})
    meta, (r, g, b) = planes(p)
    assert b[4, 4] == 255 and r[4, 4] == g[4, 4] == 0
    assert r[15, 15] == 255 and g[15, 15] == b[15, 15] == 0
    assert g[25, 33] == 255 and r[25, 33] == b[25, 33] == 0
    rows = dict(meta['info'])
    assert rows['Field'] == '8.0 × 6.0 µm (40 × 30 px)' and meta['um'] == pytest.approx(0.2)
    assert rows['Depth'] == '16-bit' and rows['Channels'] == '3'


def test_a_pixel_taller_than_wide_gives_both_sides(tmp_path):
    p = str(tmp_path / 't.tif')
    tifffile.imwrite(p, spots(), imagej=True, resolution=(5.0, 2.0), metadata={'axes': 'CYX', 'unit': 'micron'})
    meta, _ = planes(p)
    rows = dict(meta['info'])
    assert meta['um'] == pytest.approx(0.2) and meta['um_y'] == pytest.approx(0.5)
    assert rows['Field'] == '8.0 × 15.0 µm (40 × 30 px)' and rows['Pixel'] == '0.2000 × 0.5000 µm'


def test_a_mixed_colour_lut_lights_every_colour_it_holds(tmp_path):
    p = str(tmp_path / 'm.tif')
    tifffile.imwrite(p, spots()[:1], imagej=True, metadata={'axes': 'CYX', 'LUTs': [lut(1, 0, 1)]})
    _, (r, g, b) = planes(p)
    assert r[4, 4] == b[4, 4] == 255 and g[4, 4] == 0


def test_a_tiff_without_display_colours_shows_its_channels_red_green_blue(tmp_path):
    p = str(tmp_path / 'b.tif')
    tifffile.imwrite(p, spots()[:2], metadata={'axes': 'CYX'})
    meta, (r, g, b) = planes(p)
    assert r[4, 4] == 255 and g[15, 15] == 255 and not b.any()
    assert 'Field' in dict(meta['info']) and meta['um'] is None and meta['um_y'] is None, 'a scale the file never states is not shown'


def test_a_grey_image_is_grey(tmp_path):
    p = str(tmp_path / 'g.png')
    a = np.zeros((H, W), np.uint8); a[5:10, 5:10] = 200
    Image.fromarray(a).save(p)
    _, (r, g, b) = planes(p)
    assert (r == g).all() and (g == b).all() and r[7, 7] == 255


def test_a_colour_png_keeps_its_colours(tmp_path):
    p = str(tmp_path / 'c.png')
    a = np.zeros((H, W, 3), np.uint8); a[5:10, 5:10, 0] = 200; a[20:25, 20:25, 2] = 200
    Image.fromarray(a).save(p)
    meta, (r, g, b) = planes(p)
    assert r[7, 7] == 255 and b[7, 7] == 0 and b[22, 22] == 255 and not g.any()
    assert dict(meta['info'])['Depth'] == '8-bit RGB'


def test_it_offers_no_action(tmp_path):
    p = str(tmp_path / 'g.png')
    Image.fromarray(np.zeros((H, W), np.uint8)).save(p)
    with pytest.raises(ValueError):
        viewer.Session(p).call('detect', {})
