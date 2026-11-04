"""v1, flat skeleton: analysis/vessel_model.py as it stood when versioning began (2026-10-29).

Flatten the noise-normalised slices, threshold with hysteresis, skeletonise, clean, fit curves, and
trace a fainter threshold for low-confidence candidates. Kept unchanged as the baseline every later
version is scored against.
"""
import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import vessel_model as vm

NAME = 'v1-flat-skeleton'
TITLE, ICON = 'skeleton', '🦴'
STEPS = """\
- Put each slice in its own noise units: take away the haze, divide by the slice's own noise
  - leave out the slices with no signal above noise
- Flatten the slices: each pixel is the brightest it is in any of them, at the depth where its signal sits
- Mark the vessels twice, grown from bright seeds into the pixels around them: once with confidence, once fainter
- Thin each mark to its centrelines, a graph of junctions, tips and the paths between them
- Clean the graph
  - drop wall bumps (side branches shorter than two widths) and specks
  - merge junctions whose widths overlap, and twin paths around a hole
  - drop pieces of network that add up to under ten widths
- Keep what only the fainter mark holds as low-confidence vessels, joined to the confident ones they touch
- Draw each vessel as a smooth curve through the fewest points that stay within half its width"""


def extract(vol, um, source, z_step):
    m = vm.model(vol, um, source, z_step)
    m['algorithm'] = NAME
    return m
