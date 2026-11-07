# Exploratory script, not the finder (2026-11-07): kept for the next iteration of covers; books.py does not import it.
"""python3 barcode.py OUT PHOTO...: a barcode map - where edges are dense and nearly all run one way (books packed
side by side), as a heat map over each photo."""
import sys, os; sys.path.insert(0, __import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), '..', 'py'))
import numpy as np, books
from books import ndi
from PIL import Image, ImageOps
def barcode(small, g):
    e = books.Edges(g, small)
    gx, gy = ndi.sobel(g, 1), ndi.sobel(g, 0)
    win = max(9, int(0.06 * max(e.h, e.w)))
    m = e.all.astype(np.float32)
    # orientation of each edge pixel's gradient as a doubled-angle unit vector, averaged over a window: its length is
    # how much the edges there agree on one direction
    th = 2 * np.arctan2(gy, gx)
    c, s = ndi.uniform_filter(m * np.cos(th), win), ndi.uniform_filter(m * np.sin(th), win)
    dens = ndi.uniform_filter(m, win)
    coh = np.hypot(c, s) / np.maximum(dens, 1e-6)
    return dens, coh, e
if __name__ == '__main__':
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    for p in sys.argv[2:]:
        rgb = np.asarray(ImageOps.exif_transpose(Image.open(p)).convert('RGB'))
        s = books.WORK / max(rgb.shape[:2]); small = np.stack([ndi.zoom(rgb[..., k].astype(np.float32), s, order=1) for k in range(3)], -1)
        g = ndi.gaussian_filter(books.grey(small), 1)
        dens, coh, e = barcode(small, g)
        score = dens * coh
        q = np.clip(score / np.percentile(score, 99.5), 0, 1)
        heat = np.stack([q * 255, q * 60, (1 - q) * 40], -1)
        im = (0.45 * small + 0.55 * heat).astype(np.uint8)
        Image.fromarray(im).save(f'{out}/{os.path.basename(p)[:6]}.png')
        print(os.path.basename(p)[:6], 'p50/p95/p99.5', [round(float(v), 3) for v in np.percentile(score, [50, 95, 99.5])])
