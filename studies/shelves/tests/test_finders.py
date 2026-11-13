"""req/shelves/books/versions: the finders the page offers, the default first, each with how it works and its
precision and recall as recorded for it."""
import json
import os
import sys

STUDY = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
sys.path.insert(0, os.path.join(STUDY, 'py'))
sys.path.insert(0, os.path.join(STUDY, 'lab'))
import finders
import finder_menu


def listed():
    return finder_menu.menu()


def test_every_version_is_offered_the_default_first():
    keys = [a['key'] for a in listed()['algorithms']]
    assert keys[0] == finders.DEFAULT and sorted(keys) == sorted(finders.VERSIONS), keys


def test_each_version_shows_its_steps_and_the_numbers_recorded_for_it():
    q = json.load(open(os.path.join(STUDY, 'lab', 'finder_metrics.json')))
    for a in listed()['algorithms']:
        lines = [l for l in a['about'].split('\n') if l.strip()]
        assert lines and all(l.lstrip().startswith('- ') for l in lines), a['about']
        got = q['versions'][a['key']]
        # rescored with: python3 studies/shelves/lab/finder_metrics.py
        assert (a['precision'], a['recall']) == (got['precision'], got['recall']) and got['truth'] == q['books'], a
        assert 'tuned' in a['note'], a['note']

