"""1.36: the Ruler, on the fixture study in headless Chromium with a stand-in worker (ruler_driver.mjs)."""
from test_study_runs import NODE, answers, png, run  # noqa: F401  (fixtures)
import pytest

pytestmark = pytest.mark.full


@pytest.mark.skipif(not NODE, reason='node missing')
def test_the_ruler_measures_on_each_axis_own_scale(png, answers):
    run('ruler_driver.mjs', answers[0], png, answers[1])
