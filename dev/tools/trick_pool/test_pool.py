"""The trick pool's two halves agree, every catalog entry is usable, and every runnable trick runs on a
real image and keeps its shape."""
import os, sys

import numpy as np
import pytest
import yaml

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import tricks as T
import mutation_signal as S

POOL = yaml.safe_load(open(os.path.join(HERE, 'pool.yaml')))
KEYS = {'id', 'name', 'family', 'visual', 'how', 'canonical_uses', 'hook', 'scale', 'package', 'invoke', 'docs',
        'cost', 'verified', 'try_when'}
HOOKS = {'pre', 'map', 'candidates', 'verify', 'post', 'stats'}


def test_every_entry_is_complete_and_unique():
    ids = [e['id'] for e in POOL]
    assert len(ids) >= 250
    assert len(ids) == len(set(ids)), [i for i in ids if ids.count(i) > 1]
    for e in POOL:
        assert KEYS <= set(e), (e['id'], KEYS - set(e))
        assert e['hook'] in HOOKS, e['id']
        assert e['cost'] in ('light', 'medium', 'heavy'), e['id']
        assert str(e['docs']).startswith('http'), e['id']


def test_runnable_entries_and_functions_match_both_ways():
    runnable = {e['runnable'] for e in POOL if e.get('runnable')}
    assert len(T.TRICKS) >= 30
    assert runnable == set(T.TRICKS), dict(no_function=runnable - set(T.TRICKS), no_entry=set(T.TRICKS) - runnable)


@pytest.fixture(scope='module')
def crop():
    # a trick is checked to run and keep its shape, not for what it finds: random spots on a noisy floor will do
    rng = np.random.default_rng(0)
    a = rng.poisson(14.0, (128, 128)).astype(float)
    for y, x in rng.integers(8, 120, (12, 2)):
        a[y - 2:y + 3, x - 2:x + 3] += 150
    return a


@pytest.mark.parametrize('tid', sorted(T.TRICKS))
def test_each_runnable_trick_runs_on_a_real_crop(tid, crop):
    missing = T.available()[tid]
    if missing:   # a trick whose package is not in requirements.txt: it must name that package, and that is all
        assert isinstance(missing, str) and missing in T.NEEDS[tid]
        return
    out = T.TRICKS[tid](crop, 4.0)
    assert out.shape == crop.shape and np.isfinite(out).all()


def test_signal_counts_only_what_beats_chance():
    y = np.array([1, 1, 1, 0, 0])
    reg = {'a': np.array([1, 0, 0, 1, 0], bool), 'b': np.array([1, 0, 0, 1, 1], bool)}
    mut = np.array([1, 1, 0, 0, 0], bool)                 # rescues item 1 (never found), drops item 3 (kept by all)
    s = S.signal(y, reg, reg['a'], mut)
    assert s['rescued_never'] == [1] and s['rejected_always'] == [3] and s['signal']
    assert not S.signal(y, reg, reg['a'], mut, chance=(1, 1))['signal']   # nulls did as well: not signal
    assert S.signal(y, reg, reg['a'], mut, chance=(0, 1))['signal']


def test_stat_shift_is_unknown_without_ground_truth_measurements():
    assert S.stat_shift([None, None], [1, 2, 3], [1, 2, 3]) is None
    s = S.stat_shift([1, 2, 3, 4], [1, 1, 1, 9], [1, 2, 3, 4])
    assert s['w1_mutant'] < s['w1_base']
