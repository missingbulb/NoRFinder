"""R8, R10: the page's ground-truth workflow (missing candidates, what the file holds, submitting it as a
GitHub issue, the warning for a local image). Drives web/ in headless Chromium with the stand-in worker of
the memory test (ground_truth_page_driver.mjs)."""
from test_memory import crop, needs_node, needs_slide, page_answers, run  # noqa: F401  (fixtures)


@needs_slide
@needs_node
def test_ground_truth_is_marked_and_submitted(crop, page_answers):
    run('ground_truth_page_driver.mjs', page_answers, crop)
