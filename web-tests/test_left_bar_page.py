"""1.38: the left bar's boxes fold with the steps, on the fixture study in headless Chromium with a stand-in
worker (left_bar_driver.mjs)."""
from test_study_runs import NODE, answers, png, run  # noqa: F401  (fixtures)
import pytest

pytestmark = pytest.mark.full


@pytest.mark.skipif(not NODE, reason='node missing')
def test_the_left_bar_folds_with_the_steps(png, answers):
    run('left_bar_driver.mjs', answers[0], png, answers[1])
