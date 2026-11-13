"""req/shell/offline/default, req/shell/site/out-of-date: a hidden tab asks whether the site answers and fetches the
published page only once shown again, in headless Chromium on the fixture study with its clock moved by the test
(background_tab_driver.mjs)."""
import pytest

from test_data_mode_page import folder
from test_study_runs import NODE, answers, png, run  # noqa: F401  (fixtures)

pytestmark = pytest.mark.full


@pytest.mark.skipif(not NODE, reason='node missing')
def test_a_hidden_tab_calls_nothing_on_its_own(answers, tmp_path):
    root = tmp_path / 'drive'
    folder(root)
    run('background_tab_driver.mjs', answers[0], answers[1], str(root))
