"""req/shell/load/button, req/shell/image/minimap, req/shell/page-state, req/shell/channels/rows: the Image box (Load and Unload at its foot, each channel's row and levels), the
minimap over the image and the page state the shell's controls are drawn from, on the fixture study in
headless Chromium with a stand-in worker (image_box_driver.mjs); and how each channel's words and colour are
chosen (channels_driver.mjs)."""
from test_study_runs import NODE, answers, png, run  # noqa: F401  (fixtures)
import pytest

pytestmark = pytest.mark.full


@pytest.mark.skipif(not NODE, reason='node missing')
def test_how_a_channel_is_named_and_coloured():
    run('channels_driver.mjs')


@pytest.fixture
def three(png, tmp_path):
    """The fixture's image as three channels: the first named Ch1 and shown green by the file, the second named
    Nuclei and shown magenta, the third named and coloured by nothing."""
    import numpy as np, tifffile
    from PIL import Image
    a = np.asarray(Image.open(png))
    ramp = np.arange(256, dtype=np.uint8)
    luts = [np.stack([ramp * r, ramp * g, ramp * b]).astype(np.uint8) for r, g, b in ((0, 1, 0), (1, 0, 1))]
    path = str(tmp_path / 'three.tif')
    tifffile.imwrite(path, np.stack([a, a, a]), imagej=True, metadata={'axes': 'CYX', 'Labels': ['Ch1', 'Nuclei', ''], 'LUTs': luts})
    return path


@pytest.mark.skipif(not NODE, reason='node missing')
def test_the_image_box_and_the_minimap(png, answers, three):
    run('image_box_driver.mjs', answers[0], png, answers[1], three)
