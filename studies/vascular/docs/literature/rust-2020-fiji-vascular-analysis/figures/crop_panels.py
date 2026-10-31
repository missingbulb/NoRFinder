#!/usr/bin/env python3
"""Regenerate panels/*.png from the full figure PNGs in this dir. Requires Pillow.

Grid geometry was located automatically from the figures' own dark image bands (the
photomicrograph panels are black-background, the page around them is white), then
frozen here so the crop is reproducible. See panels/README.md.

Panel naming: VESSEL_ prefixes the isolated vessel-channel panels (the working dataset);
the paper tag `rust20` keeps the scale-bar keys in analysis/measure_vessels.py unique
across papers.
"""
from PIL import Image
import os

OUT = 'panels'
M = 3                      # inner trim (px) to avoid edge bleed
os.makedirs(OUT, exist_ok=True)


def crop(fn, box, out):
    x0, x1, y0, y1 = box
    Image.open(fn).crop((x0 + M, y0 + M, x1 - M, y1 - M)).save(os.path.join(OUT, out))


# --- Figure 1B: 4 markers x (development / adult) x (overview / close-up) -------------
# rows = the four dark bands; cols = the four marker columns.
f1 = 'fig1_pipeline_development.png'
F1_COLS = [(80, 443), (455, 819), (844, 1203), (1224, 1587)]
F1_MARKERS = ['CD31', 'IsolectinB4', 'Perfusion-LectinDylight594', 'Cldn5-eGFP']
F1_ROWS = [((829, 1193), 'dev_overview'), ((1199, 1318), 'dev_closeup'),
           ((1331, 1699), 'adult_overview'), ((1705, 1825), 'adult_closeup')]
for (y0, y1), row in F1_ROWS:
    for (x0, x1), marker in zip(F1_COLS, F1_MARKERS):
        crop(f1, (x0, x1, y0, y1), f'VESSEL_rust20fig1_{row}_{marker}.png')

# --- Figure 2B: mouse photothrombotic stroke, 3 weeks --------------------------------
# top row = vessel channel only; bottom row = vessels (red) + pericytes (cyan) close-up.
f2 = 'fig2_stroke_periinfarct.png'
F2_COLS = [(1195, 1631), (1645, 2083)]
for (x0, x1), side in zip(F2_COLS, ['intact', 'core-ibz']):
    crop(f2, (x0, x1, 54, 491), f'VESSEL_rust20fig2_overview_{side}_vasculature.png')
for (x0, x1), side in zip(F2_COLS, ['intact', 'ibz']):
    crop(f2, (x0, x1, 505, 941), f'rust20fig2_closeup_{side}_vasculature-pericytes.png')

# --- Figure 3B: human medial frontal cortex, control vs Alzheimer's ------------------
f3 = 'fig3_human_alzheimers.png'
F3_COLS = [(1225, 1662), (1673, 2110)]
for (x0, x1), grp in zip(F3_COLS, ['Ctrl', 'AD']):
    crop(f3, (x0, x1, 16, 452), f'VESSEL_rust20fig3_overview_{grp}_vasculature.png')
for (x0, x1), grp in zip(F3_COLS, ['Ctrl', 'AD']):
    crop(f3, (x0, x1, 460, 896), f'rust20fig3_closeup_{grp}_vasculature-pericytes.png')

print('done ->', OUT)
