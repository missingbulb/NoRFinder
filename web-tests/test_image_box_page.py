"""1.15, 1.17, 1.46, 1.47: the Image box (Load and Unload at its foot, each channel's row and levels), the
minimap over the image and the page state the shell's controls are drawn from, on the fixture study in
headless Chromium with a stand-in worker (image_box_driver.mjs); and how each channel's words and colour are
chosen (channels_driver.mjs)."""
from test_study_runs import NODE, answers, png, run  # noqa: F401  (fixtures)
import pytest

pytestmark = pytest.mark.full


@pytest.mark.skipif(not NODE, reason='node missing')
def test_how_a_channel_is_named_and_coloured():
    run('channels_driver.mjs')


@pytest.mark.skipif(not NODE, reason='node missing')
def test_the_image_box_and_the_minimap(png, answers):
    run('image_box_driver.mjs', answers[0], png, answers[1])
