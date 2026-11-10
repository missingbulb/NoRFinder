"""req/shell/image/scaling: what the 2D viewer shows of the image zoomed out and zoomed in, on the fixture study in
headless Chromium with a stand-in worker (image_scaling_driver.mjs)."""
from test_study_runs import NODE, answers, png, run  # noqa: F401  (fixtures)
import pytest

pytestmark = pytest.mark.full


@pytest.fixture
def checker(tmp_path):
    """A 3000 × 2000 checkerboard of black and white pixels: averaged it is grey, picked pixel by pixel it is not."""
    import numpy as np
    from PIL import Image
    y, x = np.indices((2000, 3000))
    path = str(tmp_path / 'checker.png')
    Image.fromarray((((x + y) % 2) * 255).astype(np.uint8)).save(path)
    return path


@pytest.mark.skipif(not NODE, reason='node missing')
def test_zoomed_out_the_image_is_averaged_and_zoomed_in_its_pixels_are_sharp(answers, checker):
    run('image_scaling_driver.mjs', answers[0], answers[1], checker)
