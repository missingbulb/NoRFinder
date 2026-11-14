"""The page's own image reader (web/image_open.js) for a test, under Node through image_open_driver.mjs: an image
file opened as the page opens it, as (meta, flattened planes [C, H, W], slices [C, Z, H, W] or None). A file the
browser or libheif would decode (a PNG, a JPEG, a HEIC) is decoded by Pillow and handed over as its pixels; order, a study's module
naming its channels' order, puts them in it as the page does."""
import json
import os
import shutil
import subprocess

import numpy as np
import pytest
from PIL import Image

import pillow_heif

pillow_heif.register_heif_opener()

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')


def open_images(tmp_path, *files, view=None, order=None):
    if not NODE:
        pytest.skip('node missing')
    jobs = []
    for k, f in enumerate(files):
        job = {'view': view or {}, 'order': order, 'planes': str(tmp_path / f'opened{k}.planes'), 'volume': str(tmp_path / f'opened{k}.volume')}
        job['file'] = f
        if not f.lower().endswith(('.tif', '.tiff')):
            with Image.open(f) as im:
                rgba = np.asarray(im.convert('RGBA'))
            job.update(rgba=str(tmp_path / f'opened{k}.rgba'), W=rgba.shape[1], H=rgba.shape[0])
            rgba.tofile(job['rgba'])
        jobs.append(job)
    spec = tmp_path / 'open_jobs.json'
    spec.write_text(json.dumps(jobs))
    r = subprocess.run([NODE, os.path.join(HERE, 'image_open_driver.mjs'), str(spec)], capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stderr
    out = []
    for job, line in zip(jobs, r.stdout.splitlines()):
        meta = json.loads(line)
        assert 'error' not in meta, meta
        C, H, W, Z = len(meta['channels']), meta['H'], meta['W'], meta['Z']
        planes = np.fromfile(job['planes'], np.uint8).reshape(C, H, W)
        volume = np.fromfile(job['volume'], np.uint8).reshape(C, Z, H, W) if meta['volume'] else None
        out.append((meta, planes, volume))
    return out


def open_image(tmp_path, f, view=None, order=None):
    return open_images(tmp_path, f, view=view, order=order)[0]
