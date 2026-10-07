"""R8: the page is kind to slow computers. Buttons whose action takes a while are held, with a spinner,
until it is done, and a low-memory popup asks the user to close other tabs. Drives web/ in headless Chromium
with the stand-in worker of the memory test, answering late (slow_machine_page_driver.mjs)."""
from test_memory import crop, needs_node, needs_slide, page_answers, run  # noqa: F401  (fixtures)


@needs_slide
@needs_node
def test_slow_buttons_are_held_and_low_memory_is_flagged(crop, page_answers):
    run('slow_machine_page_driver.mjs', page_answers, crop)
