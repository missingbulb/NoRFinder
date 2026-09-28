"""Regenerates web/logo.svg from logo_source.png: the three marks at the top of the Sagol School
of Neuroscience logo, traced to curves and coloured red, green and blue left to right. The white
inside each mark (the emblem, the brain's circles) is left transparent.

  python3 -m pip install potracer
  python3 web/logo_trace.py
"""
import os
import numpy as np
import potrace
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
S = 4  # trace a bicubic 4x upscale, so the curves follow the marks rather than the pixel steps
MARKS_BOX = (0, 30, 447, 185)  # the row of marks above the lettering
MARKS = [(15, 152, '#e53935'), (154, 297, '#2e9e44'), (298, 440, '#2f6fe0')]  # column span of each mark, and its colour

im = Image.open(os.path.join(HERE, 'logo_source.png')).convert('L').crop(MARKS_BOX)
ink = np.array(im.resize((im.width * S, im.height * S), Image.BICUBIC)) < 128
ys, xs = np.nonzero(ink)
x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
at = lambda p: f"{(p.x - x0) / S:.2f} {(p.y - y0) / S:.2f}"


def path(mask, fill):
    d = []
    for c in potrace.Bitmap(~mask).trace(turdsize=8, alphamax=1.0, opticurve=True, opttolerance=0.2):  # potracer traces the False pixels
        d.append("M" + at(c.start_point))
        for s in c.segments:
            d.append(f"L{at(s.c)}L{at(s.end_point)}" if s.is_corner else f"C{at(s.c1)} {at(s.c2)} {at(s.end_point)}")
        d.append("Z")
    return f'<path fill="{fill}" fill-rule="evenodd" d="{"".join(d)}"/>'


paths = []
for a, b, colour in MARKS:
    m = np.zeros_like(ink); m[:, a * S:b * S] = ink[:, a * S:b * S]
    paths.append(path(m, colour))
with open(os.path.join(HERE, 'logo.svg'), 'w') as f:
    f.write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{(x1 - x0) / S:.0f}" height="{(y1 - y0) / S:.0f}" viewBox="0 0 {(x1 - x0) / S:.0f} {(y1 - y0) / S:.0f}">' + ''.join(paths) + '</svg>\n')
