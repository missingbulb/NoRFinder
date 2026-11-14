"""req/shelves/books/versions: the page's list of finders (web/algorithms.json) offers exactly the versions the study's
Python runs, and each one's numbers (web/finder_metrics.json) were recorded for it on the ground truth now on hand."""
import json
import os
import sys

STUDY = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
sys.path.insert(0, os.path.join(STUDY, 'py'))
import finders


def own(rel):
    return json.load(open(os.path.join(STUDY, 'web', rel)))


def test_the_page_lists_exactly_the_versions_python_runs():
    assert sorted(a['key'] for a in own('algorithms.json')) == sorted(finders.VERSIONS)


def test_each_listed_version_has_its_numbers_and_how_far_to_trust_them():
    q = own('finder_metrics.json')
    for a in own('algorithms.json'):
        got = q['versions'][a['key']]
        # rescored with: python3 studies/shelves/lab/finder_metrics.py
        assert got['truth'] == q['books'] and 'tuned' in got['note'], (a['key'], got)
