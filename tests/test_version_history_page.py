"""R8: the page's version box opens its Version history, and after an update a bubble points at it
(version_history_driver.mjs, in headless Chromium)."""
from test_memory import needs_node, run
import pytest

pytestmark = pytest.mark.full


@needs_node
def test_version_history_popup_and_update_bubble():
    run('version_history_driver.mjs')
