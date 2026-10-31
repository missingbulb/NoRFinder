#!/usr/bin/env python3
"""Regenerate panels/*.png from the full figure PNGs in this dir. Requires Pillow.

Grid coordinates were located from the figures' own dark image bands and then frozen here
so the crop is reproducible. See panels/README.md.

Paper tag `fa22` keeps calibration prefixes unique across papers. Note these panels are
GRAYSCALE (white vessels on black), unlike the red-channel panels from wang-2022/rust-2020.
"""
from PIL import Image
import os

OUT = 'panels'
M = 3
os.makedirs(OUT, exist_ok=True)


def crop(fn, box, out):
    x0, x1, y0, y1 = box
    Image.open(fn).crop((x0 + M, y0 + M, x1 - M, y1 - M)).save(os.path.join(OUT, out))


# Fig 3 — 2D maximum-intensity projection and the authors' own skeleton of it.
f3, r3 = 'fig3_2D_MIP_and_skeleton.png', (5, 575)
crop(f3, (5, 715, *r3), 'VESSEL_fa22fig3_MIP_CD31.png')
crop(f3, (745, 1456, *r3), 'fa22fig3_skeleton_reference.png')

# Fig 8 — the worked example: original -> binary -> skeleton -> graph.
f8 = 'fig8_2D_worked_example.png'
for (x0, x1), (y0, y1), name in [
        ((4, 627), (4, 505), 'VESSEL_fa22fig8_original.png'),
        ((632, 1255), (4, 505), 'fa22fig8_binary_reference.png'),
        ((4, 627), (509, 1009), 'fa22fig8_skeleton_reference.png'),
        ((632, 1255), (509, 1009), 'fa22fig8_graph_reference.png')]:
    crop(f8, (x0, x1, y0, y1), name)

# Fig 9 — three samples the paper prints its OWN measurements for. Ground truth.
f9, r9 = 'fig9_2D_samples_with_measurements.png', (1, 506)
for (x0, x1), name in [((1, 630), 'a_dense'), ((670, 1300), 'b_sparse'), ((1337, 1966), 'c_straight')]:
    crop(f9, (x0, x1, *r9), f'VESSEL_fa22fig9_{name}.png')

# Fig 13 — one original with its local-tortuosity maps at two scales.
f13, r13 = 'fig13_local_tortuosity.png', (13, 389)
crop(f13, (117, 477, *r13), 'VESSEL_fa22fig13_original.png')
crop(f13, (486, 960, *r13), 'fa22fig13_tortuosity_d10um.png')
crop(f13, (969, 1443, *r13), 'fa22fig13_tortuosity_d20um.png')

print('done ->', OUT)
