"""R11: every finder's precision and recall on the ground truth, at each filter preset, are on record
and current. detection/lab/finder_metrics.json is written by detection/finder_metrics.py; it is
current while it was measured against the quality baseline (R9) now committed, since any change to a
finder's results on the labelled spots or to the ground truth rewrites that baseline."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'detection'))
import finder_metrics as fm
import ground_truth
import interactive

REGENERATE = 'run python3 detection/finder_metrics.py and commit detection/lab/finder_metrics.json'


def doc():
    with open(fm.OUT) as f:
        return json.load(f)


def test_metrics_are_current():
    d = doc()
    assert d['format'] == fm.FORMAT
    assert d['baseline_sha256'] == fm.baseline_sha(), f'the quality baseline changed since the metrics were measured: {REGENERATE}'
    assert d['images'] == fm.corpus_summary(ground_truth.corpus()), f'the ground truth changed: {REGENERATE}'
    assert d['presets'] == fm.PRESETS, f'the presets changed: {REGENERATE}'
    assert sorted(d['finders']) == sorted(interactive.FINDERS), f'the page offers other finders: {REGENERATE}'
    for f, per in d['finders'].items():
        assert sorted(per['filtered']) == sorted(fm.PRESETS)
        for p, r in per['filtered'].items():
            assert r['values'] == fm.preset_values(f, p), f'{f} {p}: the filter values changed: {REGENERATE}'


def test_counts_cover_the_labels():
    d = doc(); real = sum(im['real'] for im in d['images'])
    for per in d['finders'].values():
        for r in [per['finder'], *per['filtered'].values()]:
            assert r['tp'] + r['fn'] == real
            assert r['precision'] == round(r['tp'] / max(1, r['tp'] + r['fp']), 4)
            assert r['recall'] == round(r['tp'] / real, 4)


def test_balanced_is_the_finders_own_filters():
    for f in interactive.FINDERS:
        assert fm.preset_values(f, 'balanced') == fm.own_values(f)


def test_precise_is_stricter_and_sensitive_looser_in_every_filter():
    for f in interactive.FINDERS:
        own, hi, lo = fm.own_values(f), fm.preset_values(f, 'precise'), fm.preset_values(f, 'sensitive')
        for k, v in own.items():
            if k in fm.OFF and v == fm.OFF[k]:
                assert hi[k] == lo[k] == v, f'{f} {k}: a filter the finder leaves off stays off'
                continue
            up = fm.STRICT[k] > fm.LOOSE[k]
            assert (hi[k] > v > lo[k]) if up else (hi[k] < v < lo[k]), f'{f} {k}: {lo[k]} {v} {hi[k]}'


def test_recall_falls_from_sensitive_to_precise():
    for f, d in doc()['finders'].items():
        per = d['filtered']
        assert per['sensitive']['recall'] >= per['balanced']['recall'] >= per['precise']['recall'], f


def test_filters_only_remove():
    """A filter can only reject what the finder proposed, so no preset finds a real spot the finder did not."""
    for f, d in doc()['finders'].items():
        assert all(r['tp'] <= d['finder']['tp'] for r in d['filtered'].values()), f
