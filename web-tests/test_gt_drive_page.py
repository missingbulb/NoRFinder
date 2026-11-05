"""req/shell/ground-truth/tagger-access, req/shell/ground-truth/submit, req/shell/ground-truth/layout,
req/shell/ground-truth/clear: a Ground Truth Tagger on the fixture study, in headless Chromium against a stand-in
Google (gt_drive_driver.mjs): the box's line saying whether they may write to the submissions folder, Submit writing
their file into the image's subfolder there and replacing it the next time, and Clear progress."""
import os

import pytest
from PIL import Image

from test_study_runs import NODE, answers, png, run  # noqa: F401  (fixtures)

pytestmark = pytest.mark.full


def folder(path, image):
    """The study's folder: the image, and the two ground-truth folders, empty."""
    os.makedirs(path / 'curated')
    os.makedirs(path / 'submissions')
    Image.open(image).save(path / 'acme.png')


@pytest.mark.skipif(not NODE, reason='node missing')
def test_a_tagger_submits_to_the_submissions_folder(answers, png, tmp_path):
    root = tmp_path / 'drive'
    folder(root, png)
    run('gt_drive_driver.mjs', answers[0], answers[1], str(root))
