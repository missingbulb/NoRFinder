"""Presentation render: thin, semi-transparent overlay in a hue the signal does not carry."""
import numpy as np
from PIL import Image, ImageDraw


def pick_overlay(rgb):
    """Choose an overlay colour the data itself barely uses, and prove the choice."""
    a = rgb.reshape(-1, 3).astype(float) / 255.0
    cands = {'yellow': (1, 1, 0), 'white': (1, 1, 1), 'magenta': (1, 0, 1), 'green': (0, 1, 0)}
    best, score = None, -1
    for name, c in cands.items():
        c = np.array(c)
        # How rare is a bright pixel pointing this way in colour space?
        bright = a.sum(1) > 0.25
        if bright.sum() == 0:
            sim = 0.0
        else:
            v = a[bright]
            sim = float((v @ c / (np.linalg.norm(v, axis=1) * np.linalg.norm(c) + 1e-9) > 0.93).mean())
        if 1 - sim > score:
            best, score = name, 1 - sim
    assert score > 0.97, f'no clear overlay hue: best {best} collides at {1-score:.3f}'
    return cands[best], best, 1 - score


def overlay(rgb, nodes, dim=0.55, ring=0.75, ids=True):
    col, name, collide = pick_overlay(rgb)
    base = Image.fromarray((rgb * dim).astype(np.uint8)).convert('RGB')
    lay = Image.new('RGB', base.size, (0, 0, 0))
    d = ImageDraw.Draw(lay)
    c255 = tuple(int(255 * v) for v in col)
    for k, n in enumerate(nodes):
        r = ring * n['unit']
        x, y = n['cx'], n['cy']
        d.ellipse([x - r, y - r, x + r, y + r], outline=c255, width=1)
        L = n['gap'] / 2.0
        dy, dx = np.sin(n['ang']), np.cos(n['ang'])
        d.line([x - dx * L, y - dy * L, x + dx * L, y + dy * L], fill=c255, width=1)
    out = np.maximum(np.asarray(base).astype(int), np.asarray(lay).astype(int))
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)), name, collide


def strip(panels, labels, pad=6):
    from PIL import ImageDraw
    h = max(p.height for p in panels)
    w = sum(p.width for p in panels) + pad * (len(panels) - 1)
    out = Image.new('RGB', (w, h + 18), (12, 12, 14))
    x = 0
    dr = ImageDraw.Draw(out)
    for p, l in zip(panels, labels):
        out.paste(p, (x, 18))
        dr.text((x + 3, 4), l, fill=(235, 235, 235))
        x += p.width + pad
    return out
