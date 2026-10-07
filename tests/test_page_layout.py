"""R8: no image on the page is ever drawn out of its proportions, whatever width the side bars and
the item views give it. Drives web/ in headless Chromium with the stand-in worker of the memory
test, answering from real results on a corner of the reference slide (page_layout_driver.mjs)."""
from test_memory import crop, needs_node, needs_slide, page_answers, run  # noqa: F401  (fixtures)
import pytest

pytestmark = pytest.mark.full


@needs_slide
@needs_node
def test_images_keep_their_proportions(crop, page_answers):
    run('page_layout_driver.mjs', page_answers, crop)
