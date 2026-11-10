"""req/shell/image/opens-fitted: the zoom each image opens at, on the fixture study in headless Chromium with a
stand-in worker (image_fit_driver.mjs)."""
from test_study_runs import NODE, answers, png, run  # noqa: F401  (fixtures)
import pytest

pytestmark = pytest.mark.full


@pytest.fixture
def large(tmp_path):
    """An image wider and taller than any view the test opens."""
    import numpy as np
    from PIL import Image
    path = str(tmp_path / 'large.png')
    Image.fromarray(np.random.default_rng(1).integers(0, 256, (1500, 2400), np.uint8)).save(path)
    return path


@pytest.mark.skipif(not NODE, reason='node missing')
def test_each_image_opens_whole_in_the_view_never_above_100_percent(answers, large, png):
    run('image_fit_driver.mjs', answers[0], answers[1], large, png)
