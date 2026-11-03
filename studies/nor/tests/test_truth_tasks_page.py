"""req/nor/truth/tasks, req/nor/truth/order, req/nor/truth/marks, req/shell/views/second: while the study makes
ground truth, its tasks are in the left bar one candidate at a time, area by area, and the image shows what is
reviewed. Drives web/ in headless Chromium with the stand-in worker of the memory test, answering from real
results on a corner of the reference slide (truth_tasks_page_driver.mjs)."""
from test_memory import crop, needs_node, needs_slide, page_answers, run  # noqa: F401  (fixtures)
import pytest

pytestmark = pytest.mark.full


@needs_slide
@needs_node
def test_truth_tasks(crop, page_answers):
    run('truth_tasks_page_driver.mjs', page_answers, crop)
