"""Writes the Google Drive dialog's ready-made thumbnails: one small JPEG per image named in
data/sources.json, coloured as the page draws it (red Nav, green Caspr, blue DAPI), at
web/drive_thumbs/<drive id>.jpg, and index.json listing the ids that have one. The dialog shows them
instead of reading the images from Drive. Needs the images in data/raw/ (src/fetch_data.py); run it
whenever sources.json changes:
    python3 web/drive_thumbs.py
"""
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
sys.path.insert(0, os.path.join(ROOT, 'detection'))
import naive_nor  # noqa: E402

OUT = os.path.join(HERE, 'drive_thumbs')
SIDE = 96  # twice the dialog's 48 px, for sharp screens
GAIN = 2  # the most a thumbnail is brightened (web/app.js brightens the ones it saves alike)


def images(manifest):
    """[(drive id, path under data/raw/)] for every image the manifest names."""
    out = []
    for s in manifest['sources']:
        if s['kind'] == 'file':
            out.append((s['drive_id'], s['name']))
        for f in s.get('files') or []:
            out.append((f['drive_id'], f['path']))
    return out


def thumbnail(path):
    caspr, nav, _, dapi = naive_nor.load(path)
    rgb = np.dstack([naive_nor.to8(nav), naive_nor.to8(caspr), naive_nor.to8(dapi)]).astype(np.uint8)
    im = Image.fromarray(rgb)
    im.thumbnail((SIDE, SIDE), Image.BOX)
    # shrinking dims the sparse bright marks, so the thumbnail is brightened again, alike in every colour
    a = np.asarray(im).astype(float)
    return Image.fromarray(np.clip(a * min(GAIN, 255 / max(1, np.quantile(a, 0.995))), 0, 255).astype(np.uint8))


def main():
    manifest = json.load(open(os.path.join(ROOT, 'data', 'sources.json')))
    os.makedirs(OUT, exist_ok=True)
    ids = []
    for drive_id, rel in images(manifest):
        path = os.path.join(ROOT, 'data', 'raw', rel)
        if not os.path.exists(path):
            sys.exit(f'{rel} is missing: fetch it first (src/fetch_data.py)')
        thumbnail(path).save(os.path.join(OUT, drive_id + '.jpg'), quality=85, optimize=True)
        ids.append(drive_id)
    with open(os.path.join(OUT, 'index.json'), 'w') as f:
        json.dump(sorted(ids), f, indent=0)
        f.write('\n')
    print(f'{len(ids)} thumbnails in {OUT}')


if __name__ == '__main__':
    main()
