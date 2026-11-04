"""req/shell/load/from, req/shell/load/selector, req/shell/drive/offline-listing: each study loads from one place; a
study loading from Google Drive picks its image in the Image box's top line; and the Drive dialog keeps the folders it
lists, opening offline on them (image_line_driver.mjs, in headless Chromium)."""
from test_study_runs import NODE, answers, png, run  # noqa: F401  (fixtures)
import pytest

pytestmark = pytest.mark.full


@pytest.mark.skipif(not NODE, reason='node missing')
def test_the_image_line(answers):
    run('image_line_driver.mjs', answers[0], answers[1])
