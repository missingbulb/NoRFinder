"""R9, R10: no finder change loses quality on the ground truth unless the owner accepts the loss.

Every finder the page offers runs on every image of the ground truth (detection/ground_truth.py: the
reference slide, scored against the submitted labels over the lab's own, and every image a submission
was marked on) and is scored spot by spot. The committed detection/lab/quality_baseline.json records,
per finder and image, which real spots it finds, which not-NoR spots it lets through, and which
missing-candidate marks it now proposes a candidate on. The test fails when a finder stops finding a
real spot it found, passes a not-NoR spot it didn't, or stops proposing a candidate at a missing mark.
A gain is recorded rather than enforced: run outside CI, the test rewrites the baseline so the gain
lands in the same PR and is locked from then on; in CI a baseline behind the finders fails, since a
gain nobody recorded could later be lost silently.

    python3 -m pytest tests/test_quality.py            # check, and record gains
    python3 tests/test_quality.py --accept             # record the current results, losses included

--accept is for a loss the owner agreed to, and for a new reference (the intake records the
submissions it adds); the baseline's diff in the PR shows exactly which spots moved. Needs the
images: python3 detection/ground_truth.py fetch.
"""
import json
import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'detection'))
import finder_metrics
import ground_truth
import interactive
import nor_lab

BASELINE = ground_truth.BASELINE
IN_CI = bool(os.environ.get('CI'))

CORPUS = ground_truth.corpus()
needs_images = pytest.mark.skipif(not all(os.path.exists(im['path']) for im in CORPUS),
                                  reason='ground-truth images missing (src/fetch_data.py, detection/ground_truth.py fetch)')


def read_baseline():
    with open(BASELINE) as f:
        return json.load(f)


def write_baseline(base):
    with open(BASELINE, 'w') as f:
        json.dump(base, f, indent=1, sort_keys=True)
        f.write('\n')
    finder_metrics.write()   # measured against this baseline (R11)


@pytest.fixture(scope='module')
def images():
    return [dict(im, data=nor_lab.load(im['path'])) for im in CORPUS]


def test_every_finder_and_image_is_locked():
    assert len(interactive.FINDERS) >= 5
    base = read_baseline()
    assert sorted(base) == sorted(interactive.FINDERS), \
        'the baseline and the page offer different finders: run python3 tests/test_quality.py --accept'
    for name in base:
        assert sorted(base[name]) == sorted(im['name'] for im in CORPUS), \
            'the baseline and the ground truth name different images: run python3 tests/test_quality.py --accept'


def test_the_reference_covers_enough():
    assert len(CORPUS[0]['labels']) >= 150, f'only {len(CORPUS[0]["labels"])} decided labels on the reference slide'


@needs_images
@pytest.mark.parametrize('name', sorted(interactive.FINDERS))
def test_finder_keeps_its_quality(name, images):
    record = read_baseline()[name]
    report, gained = [], {}
    for im in images:
        old, new = record.get(im['name'], {}), ground_truth.result(name, im['data'], im['labels'])
        losses, gains = ground_truth.compare(old, new)
        if losses:
            report.append(f'{im["name"]}: {len(new["found"])} real found and {len(new["false"])} false, '
                          f'was {len(old.get("found", []))} and {len(old.get("false", []))}.\n  ' + '\n  '.join(losses))
        if gains:
            gained[im['name']] = (new, gains)
    assert not report, (f'{name} lost quality.\n' + '\n'.join(report)
                        + '\nIf the owner accepts this, run python3 tests/test_quality.py --accept')
    if gained and not IN_CI:
        base = read_baseline()
        for image, (new, _) in gained.items():
            base[name][image] = new
        write_baseline(base)
    assert not (gained and IN_CI), (f'{name} improved but the baseline was not updated; run '
                                    f'python3 -m pytest tests/test_quality.py and commit the baseline.\n  '
                                    + '\n  '.join(g for _, gs in gained.values() for g in gs))


def accept():
    base = {name: {} for name in sorted(interactive.FINDERS)}
    for im in CORPUS:
        data = nor_lab.load(im['path'])
        for name in base:
            base[name][im['name']] = ground_truth.result(name, data, im['labels'])
    write_baseline(base)
    for name, per in base.items():
        for image, r in per.items():
            print(f'{name:6s} {image}: {len(r["found"]):3d} real found, {len(r["false"]):3d} false, {len(r["missing"])} missing marks proposed')


if __name__ == '__main__':
    if sys.argv[1:] == ['--accept']:
        accept()
    else:
        sys.exit(pytest.main([__file__, '-q']))
