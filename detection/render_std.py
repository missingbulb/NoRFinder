"""Ariel's standard review outputs for any finder, from the cached image. Treat the format as an API:
it does not change unless Ariel asks.

  python3 render_std.py SPEC OUTDIR        e.g.  python3 render_std.py rf Slide5_Slice1_up_left2/v10_x

Writes, exactly as nor3.main() does for the traffic-light version (v8):
  overlay_all_candidates.png   every candidate, pink = pass, blue = fail + reason letter, numbered top
                               to bottom, white measuring lines on passes, legend + list side panel
  overlay_zoom_with_legend.png the same crop as v8 (x 900-2100, y 1200-2400 at 3x) + the legend
  nor_candidates.csv
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from PIL import Image
import nor3, naive_nor as nn_, nor_lab

ZOOM = (900, 1200, 2100, 2400)     # crop box on the 3x overlay (x0, y0, x1, y1), same as v8
PANEL_W = 500


def render(spec, out):
    data = nor_lab.load(); c, n, um, bm = data
    name, ov = nor_lab.parse(spec); fn, P = nor_lab.finders()[name]
    # nor3.main() loads the TIFF and builds the mask itself; hand it the cache and the chosen finder
    nn_.load = lambda _p: (c, n, um or None, None)
    nn_.blue_mask = lambda _d: bm
    nor3.segment_fill = lambda caspr, nav, bm_: fn(caspr, nav, bm_, dict(P, **ov))
    cands, info = nor3.main('cache', out, method='fill')
    full = Image.open(f'{out}/overlay_all_candidates.png')
    W = full.width - (full.width - c.shape[1] * 3)          # image part is 3x the slide
    z = Image.new('RGB', (ZOOM[2] - ZOOM[0] + PANEL_W, ZOOM[3] - ZOOM[1]))
    z.paste(full.crop(ZOOM), (0, 0)); z.paste(full.crop((W, 0, W + PANEL_W, ZOOM[3] - ZOOM[1])), (ZOOM[2] - ZOOM[0], 0))
    z.save(f'{out}/overlay_zoom_with_legend.png')
    return cands, info


if __name__ == '__main__':
    render(sys.argv[1], sys.argv[2])
