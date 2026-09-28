"""R8 — the browser page's engine: detect once, then filter on the stored measurements.

Needs the reference slide (python3 src/fetch_data.py -m '*Slide5*Slice1_up_left2*').
Run: python3 tests/test_interactive.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'detection'))
import interactive
import nor3
import nor_lab

TIF = os.path.join(HERE, '..', 'data', 'raw', 'Left Up- Edited', 'Slide5_4AP_NoR.sld - Slice1_up_left2.tif')


class Recorder(dict):
    """Records every parameter a check reads."""
    def __init__(self):
        super().__init__(); self.read = set()

    def __getitem__(self, k):
        self.read.add(k); return 0.0

    def get(self, k, d=None):
        self.read.add(k); return 0.0


def test_every_parameter_a_check_reads_is_a_control():
    # a candidate that fails nothing, so each check reads all of its parameters
    c = dict(opp_deg=180, red_off_u=0, axis_dev=0, red_purity=0, green_purity=[0, 0], green_balance=1,
             green_bright_balance=1, aspect=10, solid=1, snr=100)
    cp = interactive.check_params()
    assert set(cp) == set(nor3.CHECKS)
    for k, fn in nor3.CHECKS.items():
        p = Recorder(); fn(c, p)
        assert p.read == set(cp[k]), (k, p.read, cp[k])


def test_each_finder_names_its_main_settings():
    # the page shows these first; each must be a real detection parameter of that finder
    for f in interactive.FINDERS:
        fn, P = nor_lab.finders()[f]
        d = interactive.describe(f)
        assert fn.MAIN and list(fn.MAIN) == d['main_params'], (f, fn.MAIN, d['main_params'])


def test_every_finder_and_setting_is_explained():
    # the page shows a finder's ABOUT under the picker and a ? with HELP beside every setting
    for f in interactive.FINDERS:
        d = interactive.describe(f)
        assert d['about'], f
        shown = set(d['detection_params']) | {n for fl in d['filters'] for n in fl['params']}
        missing = shown - set(d['help'])
        assert not missing, (f, sorted(missing))


def main():
    test_every_parameter_a_check_reads_is_a_control()
    test_every_finder_and_setting_is_explained()
    test_each_finder_names_its_main_settings()
    if not os.path.exists(TIF):
        print('reference slide missing: only the static test ran'); return
    s = interactive.Session(TIF)
    # at the finder's own values the page passes what the lab passes with the blue mask applied
    # after finding: tl_post for the traffic light, rf's own result for red-first
    for finder, lab in (('tl', 'tl_post'), ('rf', 'rf')):
        fn, P = nor_lab.finders()[lab]
        want = sorted((c['cx'], c['cy']) for c in fn(s.caspr, s.nav, s.bm, P)[0] if c['fail'] is None)
        meta = json.loads(s.detect(finder)[0])
        # the page sends every filter value, ours included
        fails = s.refilter({'values': {n: v for f in meta['filters'] for n, v in f['params'].items()}})
        assert sorted((c['cx'], c['cy']) for c, f in zip(s.cands, fails) if f is None) == want, finder
    s.detect('tl')
    # turning a filter off passes exactly the candidates it alone rejected (J aside)
    dim_only = {i for i, c in enumerate(s.cands) if c.get('fails_all') == ['dim'] and c['fail0'] is None}
    base = {i for i, f in enumerate(s.refilter({'off': ['shares a segment']})) if f is None}
    off = {i for i, f in enumerate(s.refilter({'off': ['shares a segment', 'dim']})) if f is None}
    assert dim_only and off - base == {i for i in dim_only if s.cands[i]['red_on_blue'] < 0.8}
    # a stricter value only removes passes
    strict = {i for i, f in enumerate(s.refilter({'values': {'min_snr': 6}, 'off': ['shares a segment']})) if f is None}
    assert strict < base
    print('ok')


if __name__ == '__main__':
    main()
