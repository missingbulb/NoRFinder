#!/usr/bin/env python3
"""Draw an extracted vessel model over the flattened stack it came from, for review and comparison.

The stack is shown as the flattened signal in grey at full brightness; each confirmed edge is a thin
line along its curve, coloured by what the score says of it, with junctions as small hollow rings.
Edges can carry their id, so a reviewer (the owner, or a model asked to judge) can name them.

    python3 analysis/extraction/render.py STACK.tif MODEL.json OUT.png [--box X0 Y0 X1 Y1] [--scale S] [--ids]

--box is in µm. Several models side by side: pass MODEL.json more than once, each panel is labelled.
"""
import argparse, json, os, sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import score as sc
import vessel_model as vm

# Grey signal: annotations stay off the grey axis and off red (the stain is shown red elsewhere in the project).
OK = (0, 220, 255)          # cyan: a supported edge with no flag
FLAG = (255, 200, 0)        # amber: an edge the score flags (unsupported, or closing a short loop)
CAND = (150, 120, 255)      # violet: a low-confidence candidate edge
JUNCTION = (255, 0, 255)    # magenta ring
LINE_A = 0.75


def font(size):
    try:
        return ImageFont.truetype('DejaVuSans.ttf', size)
    except OSError:
        return ImageFont.load_default()


def base(flat, box_px, scale):
    x0, y0, x1, y1 = box_px
    crop = flat[y0:y1, x0:x1]
    hi = max(float(np.percentile(flat, 99.7)), 1e-6)
    g = (np.clip(crop / hi, 0, 1) ** 0.7 * 255).astype(np.uint8)
    return Image.fromarray(g).convert('RGB').resize(((x1 - x0) * scale, (y1 - y0) * scale), Image.NEAREST)


def panel(flat, model, card, box_px, scale, ids, title):
    um = model['um_per_px']
    img = base(flat, box_px, scale)
    over = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    x0, y0, x1, y1 = box_px
    nodes = {n['id']: n for n in model['nodes']}
    flags = card.get('_flags', {}) if card else {}
    bad = set(flags.get('unsupported', [])) | set(flags.get('short_loop_edges', []))
    f = font(max(9, 4 * scale + 3))
    deg = {}
    labels = []
    for e in model['edges']:
        state = e.get('state', 'vessel')
        if state == 'rejected' or e['a'] == e['b']:
            continue
        xy, _ = sc.sample_edge(e, nodes, um)
        if len(xy) < 2:
            continue
        P = (xy[:, :2] - [x0, y0] + .5) * scale
        inside = (P[:, 0] >= 0) & (P[:, 0] < img.size[0]) & (P[:, 1] >= 0) & (P[:, 1] < img.size[1])
        if not inside.any():
            continue
        confirmed = state in ('vessel', 'accepted')
        col = (FLAG if e['id'] in bad else OK) if confirmed else CAND
        d.line([tuple(p) for p in P], fill=col + (int(255 * LINE_A),), width=1)
        if confirmed:
            for k in 'ab':
                deg[e[k]] = deg.get(e[k], 0) + 1
        if ids:
            m = P[inside][len(P[inside]) // 2]
            labels.append((m, str(e['id']), col))
    for n, k in deg.items():
        if k >= 3:
            p = ((nodes[n]['x'] / um - .5 - x0 + .5) * scale, (nodes[n]['y'] / um - .5 - y0 + .5) * scale)
            r = max(3, scale * 2)
            d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], outline=JUNCTION + (200,), width=1)
    for m, t, col in labels:
        d.text((m[0] + 2, m[1] - 2), t, fill=col + (255,), font=f, stroke_width=2, stroke_fill=(0, 0, 0, 255))
    img = Image.alpha_composite(img.convert('RGBA'), over).convert('RGB')
    if title:
        bar = Image.new('RGB', (img.size[0], 22 + 4 * scale), (0, 0, 0))
        ImageDraw.Draw(bar).text((6, 4), title, fill=(255, 255, 255), font=font(14 + 2 * scale))
        out = Image.new('RGB', (img.size[0], img.size[1] + bar.size[1]))
        out.paste(bar, (0, 0)); out.paste(img, (0, bar.size[1]))
        img = out
    return img


def render(flat, models, cards, box_um=None, scale=2, ids=False, titles=None):
    um = models[0]['um_per_px']
    H, W = flat.shape
    box = [0, 0, W, H] if box_um is None else [int(np.clip(round(v / um), 0, lim)) for v, lim in zip(box_um, (W, H, W, H))]
    panels = [panel(flat, m, c, box, scale, ids, (titles or [''] * len(models))[i]) for i, (m, c) in enumerate(zip(models, cards))]
    out = Image.new('RGB', (sum(p.size[0] for p in panels) + 8 * (len(panels) - 1), max(p.size[1] for p in panels)), (40, 40, 40))
    x = 0
    for p in panels:
        out.paste(p, (x, 0)); x += p.size[0] + 8
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('stack'); ap.add_argument('models', nargs='+', help='one or more model JSON files, then the output PNG')
    ap.add_argument('--box', type=float, nargs=4); ap.add_argument('--scale', type=int, default=2); ap.add_argument('--ids', action='store_true')
    a = ap.parse_args()
    *paths, out = a.models
    vol, um, _ = vm.read_cd31(a.stack, None)
    flat = sc.flat_signal(vol, um)
    models = [json.load(open(p)) for p in paths]
    cards = [sc.score(m, flat, measure_taper=False) for m in models]
    titles = [f"{m.get('algorithm', os.path.basename(p))} · plausibility {c['plausibility']}" for p, m, c in zip(paths, models, cards)]
    render(flat, models, cards, a.box, a.scale, a.ids, titles).save(out)


if __name__ == '__main__':
    main()
