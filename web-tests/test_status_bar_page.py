"""1.13, 1.30–1.33: the status bar, its stage, its breadcrumbs and the buttons they make shine, its memory
popup and its disk, on the fixture study in headless Chromium with a stand-in worker (status_bar_driver.mjs)."""
from test_study_runs import NODE, answers, png, run  # noqa: F401  (fixtures)
import pytest

pytestmark = pytest.mark.full


@pytest.mark.skipif(not NODE, reason='node missing')
def test_the_status_bar_follows_the_steps(png, answers):
    run('status_bar_driver.mjs', answers[0], png, answers[1])
