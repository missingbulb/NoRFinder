"""req/shell/python/on-run: the finders the NoR page offers, and each one's controls, are there before any Python
starts: web/finders.GENERATED.json says what interactive.ready() does.

Regenerate with: python3 detection/finder_list.py > web/finders.GENERATED.json
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'detection'))
import interactive


def test_the_page_lists_what_the_finders_say_now():
    listed = json.load(open(os.path.join(HERE, '..', 'web', 'finders.GENERATED.json')))
    assert listed == json.loads(interactive.ready()), 'regenerate: python3 detection/finder_list.py > web/finders.GENERATED.json'
    assert list(listed['finders']) == list(interactive.FINDERS)
