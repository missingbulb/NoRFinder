"""1.17, 3.4, 3.22: dragging from a label pans the image, a double click moves between a candidate on the
image and its card, and the item views draw only the cards near the view. Drives web/ in headless Chromium
with the stand-in worker of the memory test, answering from real results on a corner of the reference slide
(item_view_driver.mjs)."""
from test_memory import crop, needs_node, needs_slide, page_answers, run  # noqa: F401  (fixtures)
import pytest

pytestmark = pytest.mark.full


@needs_slide
@needs_node
def test_item_view_navigation_and_drawing(crop, page_answers):
    run('item_view_driver.mjs', page_answers, crop)
