"""R8: the Google Drive dialog selects on a click and opens on Open or a double click, and shows each lab
image's ready-made thumbnail (web/drive_thumbs.py) or the one saved when it was opened, never reading
Drive for one (drive_dialog_driver.mjs)."""
import glob, json, os, sys
from test_memory import HERE, TIF, needs_node, needs_slide, run

WEB = os.path.join(HERE, '..', 'web')
sys.path.insert(0, WEB)
import drive_thumbs  # noqa: E402


def test_every_lab_image_has_a_ready_made_thumbnail():
    """A file added to data/sources.json needs `python3 web/drive_thumbs.py` in the same change."""
    named = sorted(i for i, _ in drive_thumbs.images(json.load(open(os.path.join(HERE, '..', 'data', 'sources.json')))))
    assert json.load(open(os.path.join(drive_thumbs.OUT, 'index.json'))) == named
    assert sorted(os.path.basename(p)[:-4] for p in glob.glob(os.path.join(drive_thumbs.OUT, '*.jpg'))) == named


@needs_slide
@needs_node
def test_select_then_open_and_thumbnails_without_reading_drive():
    lab = [os.path.join(HERE, '..', 'data', 'raw', f['path']) for s in json.load(open(os.path.join(HERE, '..', 'data', 'sources.json')))['sources'] for f in s.get('files') or []]
    other = sorted(p for p in lab if os.path.exists(p) and not os.path.samefile(p, TIF))
    run('drive_dialog_driver.mjs', '-', TIF, *other[:1])
