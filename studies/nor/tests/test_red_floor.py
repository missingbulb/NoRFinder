"""R7 "Not the faintest of its image": tl fails the passes whose red is the dimmest tenth of the
image's passes, the page's refilter reproduces it, and switching it off brings the old passes back."""
import os, sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'detection'))
import interactive
import nor_lab

FAINT = 'faint for its image'


def passes(cands):
    return sorted((round(c['cx'], 2), round(c['cy'], 2)) for c in cands if c['fail'] is None)


def test_tl_fails_the_faintest_tenth_of_its_passes():
    data = nor_lab.load()
    on, _ = nor_lab.run('tl', data)
    off, _ = nor_lab.run('tl:red_floor_q=0', data)
    faint = [c for c in on if c['fail'] == FAINT]
    kept = [c['red_mean'] for c in off if c['fail'] is None]
    assert len(kept) >= 100
    t = np.quantile(kept, 0.1)
    assert sorted(round(c['red_mean'], 6) for c in faint) == sorted(round(v, 6) for v in kept if v < t)
    assert set(passes(on)) | {(round(c['cx'], 2), round(c['cy'], 2)) for c in faint} == set(passes(off))


def test_the_page_refilter_reproduces_it_and_can_switch_it_off():
    s = interactive.Session(nor_lab.TIF); s.detect('tl')
    own = [c['fail'] for c in s.cands]
    assert s.refilter({'values': {}}) == own and FAINT in own
    assert FAINT not in s.refilter({'values': {}, 'off': [FAINT]})
