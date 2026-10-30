"""1.18: the Google Drive dialog selects on a click and opens on Open or a double click, and shows a study's
ready-made thumbnail or the one saved when an image was opened, never reading Drive for one
(drive_dialog_driver.mjs). The study ships no ready-made thumbnails, so the test serves stand-ins."""
import json, os
from test_memory import HERE, TIF, needs_node, needs_slide, run
import numpy as np
import pytest
from PIL import Image

pytestmark = pytest.mark.full


def stand_in_thumbnails(folder, ids):
    """A colour JPEG per Drive id and the index.json naming them, as a study's driveThumbs folder holds."""
    folder.mkdir()
    y, x = np.mgrid[0:48, 0:48]
    rgb = np.dstack([x * 5, y * 5, 240 - (x + y) * 2]).astype(np.uint8)
    for i in ids:
        Image.fromarray(rgb).save(folder / f'{i}.jpg')
    (folder / 'index.json').write_text(json.dumps(sorted(ids)))
    return str(folder)


@needs_slide
@needs_node
def test_select_then_open_and_thumbnails_without_reading_drive(tmp_path):
    named = [f for s in json.load(open(os.path.join(HERE, '..', 'data', 'sources.json')))['sources'] for f in s.get('files') or []]
    lab = {os.path.join(HERE, '..', 'data', 'raw', f['path']): f['drive_id'] for f in named}
    other = sorted(p for p in lab if os.path.exists(p) and not os.path.samefile(p, TIF))
    images = [TIF, *other[:1]]
    ids = [i for p, i in lab.items() if any(os.path.samefile(p, m) for m in images if os.path.exists(p))]
    run('drive_dialog_driver.mjs', '-', stand_in_thumbnails(tmp_path / 'thumbs', ids), *images)
