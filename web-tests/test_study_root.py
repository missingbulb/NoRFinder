"""req/shell/data/roles, req/shell/ground-truth/folders, req/shell/ground-truth/setup: a study's root and its settings
file (web/study_root.js, under Node by study_root_driver.mjs against an in-memory store). The store stands in for
Google's, so these cases cannot catch Drive refusing a write; the page test against the stand-in Drive does."""
import json
import os
import shutil
import subprocess

import pytest

pytestmark = pytest.mark.full
HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')


@pytest.fixture(scope='module')
def out():
    if not NODE:
        pytest.skip('node missing')
    r = subprocess.run([NODE, os.path.join(HERE, 'study_root_driver.mjs')], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_a_root_with_only_its_data_is_not_set_up(out):
    # one listing of the root, and nothing downloaded
    assert out['bare'] == {'data': True, 'curated': None, 'submissions': None, 'set': False, 'calls': 1}


def test_set_up_with_review_makes_two_folders_shares_curated_and_writes_the_file(out):
    r = out['review']
    assert r['writes'] == [['folder', 'GT curated'], ['folder', 'GT submissions'], ['share', 'GT curated'], ['create', 'rauntruth-study.json']]
    assert r['doc'] == {'format': 'rauntruth-study/1', 'data': True, 'curated': True, 'submissions': True, 'review': True,
                        'set_by': 'dm@acme.example', 'set_at': '2026-11-07T10:00:00.000Z'}
    assert r['same'] is False and r['readBack'] is True


def test_set_up_again_makes_nothing_twice(out):
    assert out['rerun'] == {'folders': 0, 'writes': [['share', 'GT curated'], ['replace', 'rauntruth-study.json']]}


def test_set_up_without_review_makes_one_folder_for_both(out):
    f = out['free']
    assert f['writes'] == [['folder', 'GT'], ['share', 'GT'], ['create', 'rauntruth-study.json']]
    assert f['same'] is True and f['one'] is True


def test_folders_made_by_hand_are_found_by_name(out):
    # any case: the names a person would type
    assert out['byName'] == {'curated': True, 'submissions': True, 'same': False, 'set': False}


def test_the_settings_file_names_folders_by_id(out):
    assert out['byFile'] == {'curated': True, 'same': True}


def test_a_second_read_within_the_minute_lists_nothing(out):
    assert out['cache'] == {'cached': 1, 'fresh': 1}
