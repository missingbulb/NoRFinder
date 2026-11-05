"""req/shell/study/visibility: a study shown to named accounts alone, opened at its address by one of them, by another
account and by no one signed in, in headless Chromium against a stand-in Google (visibility_driver.mjs)."""
import pytest

from test_data_mode_page import folder
from test_study_runs import NODE, answers, png, run  # noqa: F401  (fixtures)

pytestmark = pytest.mark.full


@pytest.mark.skipif(not NODE, reason='node missing')
def test_a_study_shown_to_named_accounts_alone(answers, tmp_path):
    root = tmp_path / 'drive'
    folder(root)
    run('visibility_driver.mjs', answers[0], answers[1], str(root))
