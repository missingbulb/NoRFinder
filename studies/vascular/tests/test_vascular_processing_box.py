"""req/vascular/model/run: what the page's Processing box is given, the study's list (web/algorithms.json) and its
numbers (web/algorithm_metrics.json). Every algorithm it offers has its icon, its name and its steps as a Markdown
outline, as its module says; a retired version is not offered; and the precision and recall the page shows were
measured on each offered version as its source stands now."""
import importlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
STUDY = os.path.join(HERE, '..')
for d in ('py', 'analysis', os.path.join('analysis', 'extraction')):
    sys.path.insert(0, os.path.join(STUDY, d))

import lab

METRICS = os.path.join(STUDY, 'web', 'algorithm_metrics.json')


def offered():
    return json.load(open(os.path.join(STUDY, 'web', 'algorithms.json')))


def test_every_offered_algorithm_has_an_icon_a_name_and_its_steps():
    algos = offered()
    keys = [a['key'] for a in algos]
    assert keys[0] == lab.DEFAULT and len(set(keys)) == len(keys) and len(keys) >= 4
    for a in algos:
        assert a['icon'] and a['title'], a
        lines = [l for l in a['about'].split('\n') if l.strip()]
        assert lines and all(l.lstrip().startswith('- ') for l in lines), a['about']
        mod = importlib.import_module(lab.VERSIONS[a['key']])
        assert (a['title'], a['icon'], a['about']) == (mod.TITLE, mod.ICON, mod.STEPS)


def test_a_retired_version_is_not_offered():
    keys = {a['key'] for a in offered()}
    assert set(lab.RETIRED) <= set(lab.VERSIONS) and lab.DEFAULT not in lab.RETIRED
    assert lab.RETIRED and keys == set(lab.VERSIONS) - set(lab.RETIRED)


def test_the_metrics_the_page_shows_are_of_each_version_as_it_stands():
    q = json.load(open(METRICS))
    assert q['curves'] > 0 and 'not the owner' in q['judge'] and str(q['curves']) in q['measured']
    for a in offered():
        v = q['versions'][a['key']]
        assert 0 <= v['precision'] <= 1 and 0 <= v['recall'] <= 1 and 'not the owner' in v['note']
        # regenerate with: python3 analysis/extraction/lab.py grade --json web/algorithm_metrics.json
        assert v['source'] == lab.source_hash(a['key']), f"{a['key']} changed since its metrics were measured"
