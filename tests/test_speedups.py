"""Speed-ups that must not change a single output bit, each fuzzed against the call it stands for.

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


def test_grow_matches_iterated_dilation():
    rng = np.random.default_rng(2)
    for _ in range(2000):
        m = rng.random(tuple(rng.integers(1, 30, 2))) < rng.uniform(0, 0.2); r = int(rng.integers(0, 4))
        assert np.array_equal(nor3.grow(m, r), ndi.binary_dilation(m, nor3.EIGHT, iterations=r)), r


def test_median_matches_numpy():
    rng = np.random.default_rng(3)
    for t in range(5000):
        b = rng.normal(size=int(rng.integers(1, 3000))) * rng.uniform(1e-3, 1e3)
        if t % 5 == 0:
            b = np.round(b, 1)                     # ties
        if t % 97 == 0:
            b[rng.integers(b.size)] = np.nan
        a, m = np.median(b), nor3.median(b)
        assert (a == m or (np.isnan(a) and np.isnan(m))) and type(a) is type(m), t


def test_fibre_angle_matches_whole_map():
    rng = np.random.default_rng(4)
    for _ in range(5):
        S = ndi.gaussian_filter(rng.random((90, 110)), 2); w = rng.uniform(1, 12)
        gy_, gx_ = np.gradient(S)
        Jxx, Jyy, Jxy = (ndi.gaussian_filter(v, w) for v in (gx_ * gx_, gy_ * gy_, gx_ * gy_))
        full = 0.5 * np.arctan2(2 * Jxy, Jxx - Jyy) + np.pi / 2
        comb = nor3.FibreAngle(S, w)
        for y, x in zip(rng.integers(0, 90, 200), rng.integers(0, 110, 200)):
            assert comb[int(y), int(x)] == full[y, x]


if __name__ == '__main__':
    test_hmax_above_matches_h_maxima()
    test_grow_matches_iterated_dilation()
    test_median_matches_numpy()
    test_fibre_angle_matches_whole_map()
    print('ok')
