"""req/shell/ground-truth/submit, req/nor/downloads, req/nor/submit/progress, req/nor/summary/mask, req/nor/summary/density, req/nor/candidates/numbering, R10: the page's ground-truth workflow (missing candidates, the button's colour and popup, what the
file holds, submitting it as a GitHub issue, the warning for a local image) and the summary mask. Drives
web/ in headless Chromium with the stand-in worker of the memory test (ground_truth_page_driver.mjs)."""
from test_memory import crop, needs_node, page_answers, run  # noqa: F401  (fixtures)
import pytest

pytestmark = pytest.mark.full


@needs_node
def test_ground_truth_is_marked_and_submitted(crop, page_answers):
    run('ground_truth_page_driver.mjs', page_answers, crop)
