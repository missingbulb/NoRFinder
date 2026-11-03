"""req/shell/account/role: the role menu beside the avatar on the fixture study, in headless Chromium against a stand-in
Google (roles_driver.mjs): the roles each visitor may choose, each role's own view, and the role kept."""
import os

import pytest

from test_data_mode_page import folder
from test_study_runs import NODE, answers, png, run  # noqa: F401  (fixtures)

pytestmark = pytest.mark.full


@pytest.mark.skipif(not NODE, reason='node missing')
def test_roles(answers, png, tmp_path):
    root = tmp_path / 'drive'
    folder(root)
    run('roles_driver.mjs', answers[0], answers[1], str(root), png)
