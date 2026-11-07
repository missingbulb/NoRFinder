"""nor_lab.load caches each image's channels: processes loading the same image at once, as pytest-xdist's workers do on
a fresh checkout, each read the whole cache or make it themselves, never a cache another is still writing."""
import multiprocessing
import os
import sys
import time

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'detection'))
import nor_lab
from synthetic_nor import nor_image

# the image every load reads, drawn once before the pool starts
IMAGE = None


def _load(delay):
    time.sleep(delay)  # waits on purpose: the loads start apart, so some read while another writes
    c, n, um, bm = nor_lab.load(IMAGE)
    return c.shape, repr(n), um, int(bm.sum()), float(c.sum())


def test_loads_at_once_share_one_whole_cache(tmp_path, monkeypatch):
    global IMAGE
    IMAGE = nor_image(str(tmp_path / 'nodes.tif'), side=400, n=64)
    monkeypatch.setenv('NOR_CACHE_DIR', str(tmp_path / 'cache'))
    # started across the time one load takes, so some find the cache while the first is still writing it
    with multiprocessing.get_context('fork').Pool(8) as pool:
        got = pool.map(_load, [k * 0.5 for k in range(8)])
    assert len(got) == 8 and all(g == got[0] for g in got), got
    assert os.listdir(tmp_path / 'cache') == [os.path.basename(nor_lab.cache_path(IMAGE))]
