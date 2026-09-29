"""Speed-ups that must not change a single output pixel: the fast h-maxima against scikit-image's.

Fuzzed over smooth random images (with and without plateaus, where ties decide), thresholds from
below the image to above it (both the piecewise path and the whole-image fallback) and heights.
Run: python3 tests/test_speedups.py
"""
import os
import sys

import numpy as np
from scipy import ndimage as ndi
from skimage.morphology import h_maxima

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'detection'))
import nor3


def test_hmax_above_matches_h_maxima():
    rng = np.random.default_rng(1)
    paths = set()
    for trial in range(60):
        img = ndi.gaussian_filter(rng.random((120, 150)), rng.uniform(1, 5)) * rng.uniform(0.5, 50)
        if trial % 3 == 0:
            img = np.round(img * 20) / 20          # plateaus
        lo, hi = float(img.min()), float(img.max())
        for q in (0.05, 0.5, 0.8, 0.95, 1.0):
            T = lo + q * (hi - lo)
            for h in ((hi - lo) * f for f in (0.01, 0.1, 0.3, 2.0)):
                ref = h_maxima(img, h).astype(bool) & (img > T)
                assert np.array_equal(nor3.hmax_above(img, h, T), ref), (trial, q, h)
                paths.add((img > T - h).mean() > 0.5)
    assert paths == {True, False}   # both branches ran


if __name__ == '__main__':
    test_hmax_above_matches_h_maxima()
    print('ok')
