"""R7 "Not the faintest of its image": tl fails the passes whose red is the dimmest tenth of the
image's passes, the page's refilter reproduces it, and switching it off brings the old passes back."""
import os, sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'detection'))
import interactive
import nor_lab
import pytest
from synthetic_nor import nor_image

FAINT = 'faint for its image'


def passes(cands):
    return sorted((round(c['cx'], 2), round(c['cy'], 2)) for c in cands if c['fail'] is None)


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    return nor_image(str(tmp_path_factory.mktemp('red_floor') / 'nodes.tif'))


def test_tl_fails_the_faintest_tenth_of_its_passes(image):
    data = nor_lab.load(image)
    on, _ = nor_lab.run('tl', data)
    off, _ = nor_lab.run('tl:red_floor_q=0', data)
    faint = [c for c in on if c['fail'] == FAINT]
    kept = [c['red_mean'] for c in off if c['fail'] is None]
    assert len(kept) >= 10
    t = np.quantile(kept, 0.1)
    assert sorted(round(c['red_mean'], 6) for c in faint) == sorted(round(v, 6) for v in kept if v < t)
    assert set(passes(on)) | {(round(c['cx'], 2), round(c['cy'], 2)) for c in faint} == set(passes(off))


def test_the_page_refilter_applies_it_last_and_can_switch_it_off(image):
    s = interactive.Session(image); s.detect('tl')
    off = s.refilter({'values': {}, 'off': [FAINT]})
    assert FAINT not in off
    reds = [c['red_mean'] for c, f in zip(s.cands, off) if f is None]
    t = np.quantile(reds, 0.1)
    on = s.refilter({'values': {}})
    assert [i for i, f in enumerate(on) if f == FAINT] == [i for i, (c, f) in enumerate(zip(s.cands, off)) if f is None and c['red_mean'] < t]
    assert [f for f in on if f != FAINT] == [f for f, g in zip(off, on) if g != FAINT]
