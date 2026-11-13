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



def exif(make='Acme', model='Acme Phone 9'):
    """A phone's EXIF: its camera, when it was taken, its exposure, a location, and a maker note (a binary blob)."""
    from PIL import Image, TiffImagePlugin
    e = Image.Exif()
    e[0x010f], e[0x0110], e[0x0112] = make, model, 6
    sub = e.get_ifd(0x8769)
    sub[0x9003], sub[0x9011], sub[0x829a], sub[0x8827] = '2026:11:05 21:03:05', '+02:00', TiffImagePlugin.IFDRational(1, 8), 500
    sub[0x927c] = bytes(range(256)) * 4
    gps = e.get_ifd(0x8825)
    gps[1], gps[2] = 'N', (32.0, 4.0, 30.0)
    return e


def details(got):
    return dict(got['info']), dict(got['more'])


def test_a_heic_photo_pins_its_camera_and_when_it_was_taken(tmp_path):
    """req/shell/image/file-info: the camera and the time taken up front, the rest folded, GPS among them, no blob."""
    import numpy as np, pillow_heif
    from PIL import Image
    p = tmp_path / 'photo.heic'
    pillow_heif.from_pillow(Image.fromarray(np.full((20, 30, 3), 90, np.uint8))).save(p, exif=exif().tobytes(), quality=-1)
    got = open_image(tmp_path, str(p))[0]
    assert [k for k, _ in got['info']] == ['Field', 'Depth', 'Camera', 'Taken']
    info, more = details(got)
    assert info['Camera'] == 'Acme Phone 9'
    assert info['Taken'] == '2026-11-05 21:03:05 +02:00'
    assert info['Depth'] == '8-bit RGB'
    assert more['ExposureTime'] == '1/8' and more['ISOSpeedRatings'] == '500' and more['Orientation'] == '6'
    assert more['GPSLatitudeRef'] == 'N' and more['GPSLatitude'] == '32, 4, 30'
    assert more['Images'] == '1'
    assert 'MakerNote' not in more and not any(len(v) > 600 for v in more.values())


def test_a_jpeg_with_no_exif_shows_its_jfif_header_folded(tmp_path):
    import numpy as np
    from PIL import Image
    p = tmp_path / 'chat.jpg'
    Image.fromarray(np.full((20, 30, 3), 90, np.uint8)).save(p, progressive=True)
    got = open_image(tmp_path, str(p))[0]
    assert got['info'] == [['Field', '30 × 20 px'], ['Depth', '8-bit RGB']]
    more = dict(got['more'])
    assert more['JFIF version'] == '1.1' and more['Coding'] == 'progressive'


def test_a_jpeg_names_a_camera_its_make_spells_once(tmp_path):
    import numpy as np
    from PIL import Image
    p = tmp_path / 'cam.jpg'
    Image.fromarray(np.full((20, 30, 3), 90, np.uint8)).save(p, exif=exif(make='Acme', model='Phone 9').tobytes())
    info, more = details(open_image(tmp_path, str(p))[0])
    assert info['Camera'] == 'Acme Phone 9' and info['Taken'] == '2026-11-05 21:03:05 +02:00'
    assert more['Make'] == 'Acme' and 'MakerNote' not in more


def test_a_png_folds_its_text_and_pixel_density(tmp_path):
    from PIL import Image, PngImagePlugin
    p = str(tmp_path / 'e.png')
    meta = PngImagePlugin.PngInfo(); meta.add_text('Author', 'Lab bench 3')
    Image.new('L', (30, 20)).save(p, pnginfo=meta, dpi=(254, 254))
    got = open_image(tmp_path, p)[0]
    assert got['info'] == [['Field', '30 × 20 px'], ['Depth', '8-bit grey']]
    more = dict(got['more'])
    assert more['Author'] == 'Lab bench 3' and more['Pixel density'] == '10000 × 10000 px/m'


def test_a_tiff_folds_its_tags_and_imagej_header(tmp_path):
    p = str(tmp_path / 'f.tif'); write(p)
    more = dict(open_image(tmp_path, p)[0]['more'])
    assert more['ImageJ channels'] == '3' and more['ImageJ unit'] == 'micron'
    assert more['ImageWidth'] == '50'
    assert 'StripOffsets' not in more and not any(k.startswith('Tag 0xc6') for k in more)


def test_a_study_pins_its_own_fields(tmp_path):
    """view.details names, per format, what is pinned instead; what the format pinned is folded with the rest."""
    import numpy as np
    from PIL import Image
    p = tmp_path / 'cam.jpg'
    Image.fromarray(np.full((20, 30, 3), 90, np.uint8)).save(p, exif=exif().tobytes())
    got = open_image(tmp_path, str(p), view={'details': {'jpeg': ['Taken', 'ExposureTime']}})[0]
    assert got['info'] == [['Taken', '2026-11-05 21:03:05 +02:00'], ['ExposureTime', '1/8']]
    more = dict(got['more'])
    assert more['Field'] == '30 × 20 px' and more['Camera'] == 'Acme Phone 9' and 'ExposureTime' not in more
