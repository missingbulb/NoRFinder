"""req/shell/ground-truth/setup, req/shell/ground-truth/summary, req/shell/ground-truth/switch, req/shell/data/roles, req/shell/ground-truth/tagger-access, req/shell/ground-truth/submit,
req/shell/ground-truth/layout, req/shell/ground-truth/clear, req/shell/ground-truth/pending, req/shell/ground-truth/curate,
req/shell/ground-truth/view, req/shell/data/folder (Needs GT): the fixture study's ground truth, in headless Chromium against a stand-in Google
(gt_drive_driver.mjs), from Set up in Data Management through a tagger's Submit, the study manager's Accept and a
viewer's Load GT tagging."""
import os

import pytest
from PIL import Image

from test_study_runs import NODE, answers, png, run  # noqa: F401  (fixtures)

pytestmark = pytest.mark.full


def folder(path, image):
    """The study's root: two images, nothing set up."""
    os.makedirs(path)
    Image.open(image).save(path / 'acme.png')
    Image.open(image).rotate(90, expand=True).save(path / 'beta.png')


@pytest.mark.skipif(not NODE, reason='node missing')
def test_a_tagger_submits_to_the_submissions_folder(answers, png, tmp_path):
    root = tmp_path / 'drive'
    folder(root, png)
    run('gt_drive_driver.mjs', answers[0], answers[1], str(root))
