"""req/shell/image/file-info — the image box shows what the file says about the image, and nothing the file does not say.

as the page's own reader (web/image_open.js, under Node) reads it.
"""
import numpy as np
import tifffile

import pytest

from image_open import open_image

pytestmark = pytest.mark.full


def write(path, **extra):
    a = np.zeros((3, 40, 50), np.uint16)
    labels = [f'c:{k}/3 - Slice1_up - 2.2' for k in (1, 2, 3)]
    tifffile.imwrite(path, a, imagej=True, software=False, resolution=(5.727272, 5.727272),
                     metadata={'axes': 'CYX', 'unit': 'micron', 'Labels': labels}, **extra)


def test_an_imagej_export_shows_scale_series_and_no_microscope(tmp_path):
    p = str(tmp_path / 'a.tif'); write(p)
    rows = dict(open_image(tmp_path, p)[0]['info'])
    assert rows['Field'] == '8.7 × 7.0 µm (50 × 40 px)'
    assert rows['Pixel'] == '0.1746 µm'
    assert rows['Depth'] == '16-bit'
    assert rows['Series'] == 'Slice1_up - 2.2'
    assert rows['Saved by'].startswith('ImageJ ')
    assert 'Microscope' not in rows and 'Date' not in rows


def test_a_file_naming_its_microscope_shows_it(tmp_path):
    p = str(tmp_path / 'b.tif')
    write(p, extratags=[(271, 's', 0, 'Acme', True), (272, 's', 0, 'Scope 9', True), (306, 's', 0, '2026:10:01 12:00:00', True)])
    rows = dict(open_image(tmp_path, p)[0]['info'])
    assert rows['Microscope'] == 'Acme Scope 9'
    assert rows['Date'] == '2026:10:01 12:00:00'


def test_a_pixel_taller_than_wide_shows_both_sides(tmp_path):
    p = str(tmp_path / 'd.tif')
    tifffile.imwrite(p, np.zeros((3, 40, 50), np.uint16), imagej=True, resolution=(5.0, 2.0),
                     metadata={'axes': 'CYX', 'unit': 'micron'})
    rows = dict(open_image(tmp_path, p)[0]['info'])
    assert rows['Field'] == '10.0 × 20.0 µm (50 × 40 px)'
    assert rows['Pixel'] == '0.2000 × 0.5000 µm'


def test_a_png_shows_only_its_size(tmp_path):
    from PIL import Image
    p = str(tmp_path / 'c.png'); Image.new('RGB', (30, 20)).save(p)
    assert open_image(tmp_path, p)[0]['info'] == [['Field', '30 × 20 px'], ['Depth', '8-bit RGB']]

