"""req/vascular/model/run: what the page's Processing box is given, by the list the build writes (menu.py). Every
algorithm it offers has its icon, its name and its steps as a Markdown outline, as its module says; a retired version
is not offered; and the precision and recall the page shows were measured on each offered version as its source
stands now."""
import importlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
STUDY = os.path.join(HERE, '..')
for d in ('py', 'analysis', os.path.join('analysis', 'extraction')):
    sys.path.insert(0, os.path.join(STUDY, d))

import lab
import menu

METRICS = os.path.join(STUDY, 'web', 'algorithm_metrics.json')


def test_every_offered_algorithm_has_an_icon_a_name_and_its_steps():
    algos = menu.algorithms()
    keys = [a['key'] for a in algos]
    assert keys[0] == lab.DEFAULT and len(set(keys)) == len(keys) and len(keys) >= 4
    for a in algos:
        assert a['icon'] and a['title'], a
        lines = [l for l in a['about'].split('\n') if l.strip()]
        assert lines and all(l.lstrip().startswith('- ') for l in lines), a['about']
        mod = importlib.import_module(lab.VERSIONS[a['key']])
        assert (a['name'], a['title'], a['icon'], a['about']) == (mod.NAME, mod.TITLE, mod.ICON, mod.STEPS)


def test_a_retired_version_is_not_offered():
    offered = {a['key'] for a in menu.algorithms()}
    assert set(lab.RETIRED) <= set(lab.VERSIONS) and lab.DEFAULT not in lab.RETIRED
    assert lab.RETIRED and offered == set(lab.VERSIONS) - set(lab.RETIRED)


def test_the_metrics_the_page_shows_are_of_each_version_as_it_stands():
    q = json.load(open(METRICS))
    assert q['curves'] > 0 and 'not the owner' in q['judge']
    for a in menu.algorithms():
        v = q['versions'][a['key']]
        assert 0 <= v['precision'] <= 1 and 0 <= v['recall'] <= 1
        # regenerate with: python3 analysis/extraction/lab.py grade --json web/algorithm_metrics.json
        assert v['source'] == lab.source_hash(a['key']), f"{a['key']} changed since its metrics were measured"
