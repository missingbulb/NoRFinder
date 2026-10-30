"""1.37: the Grid, on the fixture study in headless Chromium with a stand-in worker (grid_driver.mjs)."""
from test_study_runs import NODE, answers, png, run  # noqa: F401  (fixtures)
import pytest

pytestmark = pytest.mark.full


@pytest.mark.skipif(not NODE, reason='node missing')
def test_the_grid_draws_in_the_users_colour_and_spacing(png, answers):
    run('grid_driver.mjs', answers[0], png, answers[1])
