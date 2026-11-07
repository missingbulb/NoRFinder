"""The image the shell's states walk loads in this study (web-tests/test_shell_states_page.py): a shelf of eight
book spines, each a colour of its own on a pale wall, for the finder to find."""
import os

import numpy as np
from PIL import Image


def image(d):
    rng = np.random.default_rng(0)
    a = np.full((160, 240, 3), 230, np.uint8)
    for k in range(8):
        x = 10 + k * 28
        a[20:140, x:x + 22] = rng.integers(30, 200, 3)
    path = os.path.join(d, 'shelves.png')
    Image.fromarray(a).save(path)
    return path
