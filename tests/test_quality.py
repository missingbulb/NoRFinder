"""R9: no finder change loses quality on the labelled spots unless the owner accepts the loss.

Every finder the page offers runs on the reference slide and is scored against the lab's labels
(detection/lab/labels_claude_v1.json, labelled by Claude's eye, not yet by the owner). The committed
detection/lab/quality_baseline.json records, per finder, which real spots it finds and which
not-NoR spots it lets through. The test fails when a finder stops finding a real spot it found, or
passes a not-NoR spot it didn't. A gain is recorded rather than enforced: run outside CI, the test
rewrites the baseline so the gain lands in the same PR and is locked from then on; in CI a baseline
behind the finders fails, since a gain nobody recorded could later be lost silently.

    python3 -m pytest tests/test_quality.py            # check, and record gains
    python3 tests/test_quality.py --accept             # record the current results, losses included

--accept is for a loss the owner agreed to; the baseline's diff in the PR shows exactly which
spots moved. Needs the reference slide (python3 src/fetch_data.py -m '*Slide5*Slice1_up_left2*').
"""
import json
import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'detection'))
import interactive
import nor_lab

BASELINE = os.path.join(HERE, '..', 'detection', 'lab', 'quality_baseline.json')
IN_CI = bool(os.environ.get('CI'))

needs_slide = pytest.mark.skipif(not os.path.exists(nor_lab.TIF), reason='reference slide missing (src/fetch_data.py)')


def spot(L):
    return [round(L['x'], 1), round(L['y'], 1)]


def result(name, data):
    """The labelled spots the finder passes: {'found': real ones, 'false': not-NoR ones}."""
    cands, _ = nor_lab.run(name, data)
    labels = [L for L in nor_lab.read_labels(nor_lab.LABELS) if L['label'] is not None]
    assert len(labels) >= 150, f'only {len(labels)} decided labels: the lock covers too little'
    hit = {'found': [], 'false': []}
    for L in labels:
        sc, _ = nor_lab.score(cands, [L])
        if sc['tp']:
            hit['found'].append(spot(L))
        elif sc['fp']:
            hit['false'].append(spot(L))
    return {k: sorted(v) for k, v in hit.items()}


def read_baseline():
    with open(BASELINE) as f:
        return json.load(f)


def write_baseline(base):
    with open(BASELINE, 'w') as f:
        json.dump(base, f, indent=1, sort_keys=True)
        f.write('\n')


def compare(old, new):
    """(losses, gains), one line per spot that moved."""
    was_found, now_found = {tuple(s) for s in old['found']}, {tuple(s) for s in new['found']}
    was_false, now_false = {tuple(s) for s in old['false']}, {tuple(s) for s in new['false']}
    losses = [f'no longer finds the real NoR at x={x} y={y}' for x, y in sorted(was_found - now_found)]
    losses += [f'now passes the not-NoR at x={x} y={y}' for x, y in sorted(now_false - was_false)]
    gains = [f'now finds the real NoR at x={x} y={y}' for x, y in sorted(now_found - was_found)]
    gains += [f'no longer passes the not-NoR at x={x} y={y}' for x, y in sorted(was_false - now_false)]
    return losses, gains


@pytest.fixture(scope='module')
def data():
    return nor_lab.load()


def test_every_finder_is_locked():
    assert len(interactive.FINDERS) >= 5
    assert sorted(read_baseline()) == sorted(interactive.FINDERS), \
        'the baseline and the page offer different finders: run python3 tests/test_quality.py --accept'


@needs_slide
@pytest.mark.parametrize('name', sorted(interactive.FINDERS))
def test_finder_keeps_its_quality(name, data):
    old = read_baseline()[name]
    new = result(name, data)
    losses, gains = compare(old, new)
    assert not losses, (f'{name} lost quality: {len(new["found"])} real found and {len(new["false"])} false, '
                        f'was {len(old["found"])} and {len(old["false"])}.\n  ' + '\n  '.join(losses)
                        + '\nIf the owner accepts this, run python3 tests/test_quality.py --accept')
    if gains and not IN_CI:
        base = read_baseline()
        base[name] = new
        write_baseline(base)
    assert not (gains and IN_CI), (f'{name} improved but the baseline was not updated; run '
                                   f'python3 -m pytest tests/test_quality.py and commit the baseline.\n  '
                                   + '\n  '.join(gains))


def accept():
    data = nor_lab.load()
    base = {name: result(name, data) for name in sorted(interactive.FINDERS)}
    write_baseline(base)
    for name, r in base.items():
        print(f'{name:6s} {len(r["found"]):3d} real found, {len(r["false"]):3d} false')


if __name__ == '__main__':
    if sys.argv[1:] == ['--accept']:
        accept()
    else:
        sys.exit(pytest.main([__file__, '-q']))
