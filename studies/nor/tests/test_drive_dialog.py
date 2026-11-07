"""req/shell/drive/dialog: the Google Drive dialog selects on a click and opens on Open or a double click, and shows a study's
ready-made thumbnail or the one saved when an image was opened, never reading Drive for one
(drive_dialog_driver.mjs). The study ships no ready-made thumbnails, so the test serves stand-ins."""
import json, os
from test_memory import needs_node, run
from synthetic_nor import nor_image
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


@needs_node
def test_select_then_open_and_thumbnails_without_reading_drive(tmp_path):
    images = [nor_image(str(tmp_path / f'slide {k}.tif'), seed=k) for k in range(2)]
    ids = [f'dialogfile{k:010d}' for k in range(len(images))]
    run('drive_dialog_driver.mjs', '-', stand_in_thumbnails(tmp_path / 'thumbs', ids), *images)
