"""req/shell/processing/algorithms: the study's algorithms atop its Processing box, on the fixture study in headless
Chromium with a stand-in worker (algorithm_choice_driver.mjs)."""
from test_study_runs import NODE, answers, png, run  # noqa: F401  (fixtures)
import pytest

pytestmark = pytest.mark.full


@pytest.mark.skipif(not NODE, reason='node missing')
def test_the_study_s_algorithms_are_listed_atop_processing(png, answers):
    run('algorithm_choice_driver.mjs', answers[0], png, answers[1])
