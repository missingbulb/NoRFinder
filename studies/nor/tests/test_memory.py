"""req/shell/memory/no-growth: using the page does not grow its memory. Each layer is checked on its own, so the whole runs
in seconds rather than driving the full page through Pyodide:

  the Python session    interactive.Session, natively: opening, every finder and filtering, over and over
  the bridge            web/bridge.js in Pyodide under Node, with a stand-in session (memory_bridge_driver.mjs)
  the page              web/ in headless Chromium, with a stand-in worker answering from real results
                        computed here (memory_page_driver.mjs)

All three work on a corner of the reference slide (python3 detection/fetch_data.py -m '*Slide5*Slice1_up_left2*').
The page's full run, Pyodide and finders included, is detection/browser/mem_growth_live.mjs.
"""
import ctypes
import gc
import json
import os
import shutil
import subprocess
import sys

import pytest
import tifffile

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'detection'))
import interactive
from synthetic_nor import nor_image

# a drawn 200-pixel image that holds candidates, passing and failing, for every finder
SIDE = 200
NODE = shutil.which('node')
KB = 1024

needs_node = pytest.mark.skipif(not NODE, reason='node missing')


@pytest.fixture(scope='module')
def crop(tmp_path_factory):
    """A drawn NoR image as its own ImageJ TIFF, channels, colours and scale as the slides have them."""
    return nor_image(str(tmp_path_factory.mktemp('crop') / 'corner.tif'), side=SIDE, n=20)


class _MallInfo2(ctypes.Structure):
    _fields_ = [(n, ctypes.c_size_t) for n in 'arena ordblks smblks hblks hblkhd usmblks fsmblks uordblks fordblks keepcost'.split()]


def held():
    """(bytes malloc has handed out and not had back, objects the collector tracks), after a collection."""
    libc = ctypes.CDLL(None)
    libc.mallinfo2.restype = _MallInfo2
    gc.collect()
    m = libc.mallinfo2()
    return m.uordblks + m.hblkhd, len(gc.get_objects())


def run(driver, *args):
    try:
        r = subprocess.run([NODE, os.path.join(HERE, driver), *args], capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired as e:
        out = lambda b: (b.decode() if isinstance(b, bytes) else b) or ''
        pytest.fail(f'{driver} still running after {e.timeout:g} s; it had got this far:\n{out(e.stdout)}{out(e.stderr)}')
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stdout + r.stderr


@pytest.mark.skipif(not sys.platform.startswith('linux'), reason='reads glibc malloc statistics')
def test_session_holds_no_more_after_repeats(crop):
    offs = {f: [k['key'] for k in interactive.describe(f)['filters']] for f in interactive.FINDERS}
    assert len(offs) == 5, offs

    def use():
        s = interactive.Session(crop)
        for f in interactive.FINDERS:
            s.detect(f)
            for spec in ({'values': {}, 'off': []}, {'values': {}, 'off': offs[f]}):
                s.refilter(spec); s.alone(spec)

    use()
    base = held()
    for _ in range(3):
        use()
    now = held()
    print('held', base, '->', now)
    # a round keeps a few kilobytes of numpy's small-object caches; an image or a candidate list kept
    # per round is hundreds
    assert now[0] - base[0] < 128 * KB, f'{(now[0] - base[0]) / KB:.0f} KB more held after 3 rounds'
    assert now[1] - base[1] < 100, f'{now[1] - base[1]} more objects after 3 rounds'


@needs_node
def test_bridge_releases_what_it_hands_out():
    run('memory_bridge_driver.mjs')


@pytest.fixture(scope='module')
def page_answers(crop, tmp_path_factory):
    """What the worker would answer about the corner: the finders, the image, and for two finders
    their candidates and the filtering with every filter on and with every filter off."""
    d = tmp_path_factory.mktemp('answers')
    s = interactive.Session(crop)
    H, W = s.caspr.shape
    (d / 'images.bin').write_bytes(s.images())
    out = dict(finders=interactive.FINDERS, about={f: interactive.describe(f) for f in interactive.FINDERS},
               H=H, W=W, um=s.um, detected={}, filtered={})
    for f in ('tl', 'rf'):
        meta, seg = s.detect(f)
        (d / f'seg_{f}.bin').write_bytes(seg)
        out['detected'][f] = json.loads(meta)
        out['filtered'][f] = [dict(fails=s.refilter(sp), alone=s.alone(sp)) for sp in
                              ({'values': {}, 'off': []}, {'values': {}, 'off': [k['key'] for k in out['about'][f]['filters']]})]
    (d / 'answers.json').write_text(json.dumps(out))
    return str(d)


@pytest.mark.chromium_only
@needs_node
def test_page_holds_no_more_after_repeats(crop, page_answers):
    run('memory_page_driver.mjs', page_answers, crop)
