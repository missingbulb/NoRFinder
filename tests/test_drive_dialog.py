"""R8: the Google Drive dialog selects on a click and opens on Open or a double click, and draws each lab
image's thumbnail in colour from a few of its rows, never the whole file (drive_dialog_driver.mjs)."""
import glob, os
from test_memory import HERE, TIF, needs_node, needs_slide, run


@needs_slide
@needs_node
def test_select_then_open_and_colour_thumbnails_from_a_few_rows():
    other = sorted(p for p in glob.glob(os.path.join(HERE, '..', 'data', 'raw', '**', '*.tif'), recursive=True) if not os.path.samefile(p, TIF))
    run('drive_dialog_driver.mjs', '-', TIF, *other[:1])
