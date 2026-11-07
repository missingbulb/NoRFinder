"""The image the shell's states walk loads in this study (web-tests/test_shell_states_page.py): an RGB picture the
finders can run on, a few Caspr-green pairs with Nav red between them and a patch of DAPI blue, over noise."""
import os

import numpy as np
from PIL import Image


def image(d):
    rng = np.random.default_rng(0)
    a = (rng.random((160, 200, 3)) * 40).astype(np.uint8)
    for k in range(6):
        y, x = 20 + k * 22, 30 + k * 25
        a[y:y + 3, x:x + 14, 1] = 220
        a[y:y + 3, x + 5:x + 9, 0] = 230
    a[100:140, 20:60, 2] = 180
    path = os.path.join(d, 'nor.png')
    Image.fromarray(a).save(path)
    return path
