"""R8 — the image box shows what the file says about the image, and nothing the file does not say.

Run: python3 tests/test_file_info.py
"""
import os
import sys

import numpy as np
import tifffile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'detection'))
import naive_nor


def write(path, **extra):
    a = np.zeros((3, 40, 50), np.uint16)
    labels = [f'c:{k}/3 - Slice1_up - 2.2' for k in (1, 2, 3)]
    tifffile.imwrite(path, a, imagej=True, software=False, resolution=(5.727272, 5.727272),
                     metadata={'axes': 'CYX', 'unit': 'micron', 'Labels': labels}, **extra)


def test_an_imagej_export_shows_scale_series_and_no_microscope(tmp_path):
    p = str(tmp_path / 'a.tif'); write(p)
    rows = dict(naive_nor.file_info(p))
    assert rows['Field'] == '8.7 × 7.0 µm (50 × 40 px)'
    assert rows['Pixel'] == '0.1746 µm'
    assert rows['Depth'] == '16-bit'
    assert rows['Series'] == 'Slice1_up - 2.2'
    assert rows['Saved by'].startswith('ImageJ ')
    assert 'Microscope' not in rows and 'Date' not in rows


def test_a_file_naming_its_microscope_shows_it(tmp_path):
    p = str(tmp_path / 'b.tif')
    write(p, extratags=[(271, 's', 0, 'Zeiss', True), (272, 's', 0, 'LSM 980', True), (306, 's', 0, '2026:10:01 12:00:00', True)])
    rows = dict(naive_nor.file_info(p))
    assert rows['Microscope'] == 'Zeiss LSM 980'
    assert rows['Date'] == '2026:10:01 12:00:00'


def test_a_png_shows_only_its_size(tmp_path):
    from PIL import Image
    p = str(tmp_path / 'c.png'); Image.new('RGB', (30, 20)).save(p)
    assert naive_nor.file_info(p) == [['Field', '30 × 20 px'], ['Depth', '8-bit RGB']]


if __name__ == '__main__':
    import pytest
    sys.exit(pytest.main([__file__, '-q']))
