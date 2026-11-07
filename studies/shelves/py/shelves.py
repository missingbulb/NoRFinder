"""The Bookshelf Reader's Python: a photo of shelves opened, its books found, and each book straightened for the
page's readers (reading.js) to read. Any single 2D image Pillow opens: JPEG, PNG, WebP, a one-page TIFF."""
import json

import numpy as np
from PIL import Image, ImageOps

import books


def ready():
    return json.dumps(dict())


def load(path):
    """The photo as 8-bit RGB, turned as the camera said it was held."""
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode in ('I;16', 'I;16B', 'I;16L', 'I', 'F'):
            a = np.asarray(im, np.float64)
            lo, hi = a.min(), a.max()
            im = Image.fromarray(((a - lo) / ((hi - lo) or 1) * 255).astype(np.uint8))
        return np.asarray(im.convert('RGB'))


class Session:
    def __init__(self, path):
        self.rgb = load(path)

    def call(self, action, args):
        if action == 'find':
            return json.dumps(dict(books=books.find(self.rgb))), b''
        if action == 'straighten':
            # each book's crop, RGBA, one after the other in the order asked
            crops = [books.straighten(self.rgb, c) for c in args['corners']]
            return json.dumps(dict(sizes=[[int(c.shape[1]), int(c.shape[0])] for c in crops])), b''.join(c.tobytes() for c in crops)
        raise ValueError(f'unknown action {action!r}')
