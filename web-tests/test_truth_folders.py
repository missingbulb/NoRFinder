"""req/shell/ground-truth/folders, req/shell/ground-truth/layout, req/shell/ground-truth/submit,
req/shell/ground-truth/pending, req/shell/ground-truth/curate: the study's ground-truth folders (web/truth_folders.js,
under Node by truth_folders_driver.mjs against an in-memory Drive). The in-memory Drive stands in for Google's, so
these cases cannot catch Drive refusing a write the page sends; the page tests against the stand-in Drive do."""
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
    r = subprocess.run([NODE, os.path.join(HERE, 'truth_folders_driver.mjs')], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_an_image_has_a_subfolder_and_a_tagger_a_file(out):
    # the image's stem with its SHA's first 8 hex; the tagger's email, lower-cased
    assert out['names'] == {'sub': 'slide3_s2__a1b2c3d4', 'file': 'gt_jane@lab.org.json'}


def test_a_study_names_two_folders_or_one_twice(out):
    f = out['folders']
    assert f['two'] == {'submissions': 'SUBMISSIONS0001', 'curated': 'CURATED0000001', 'same': False}
    assert f['one'] == {'submissions': 'SAMEFOLDER0001', 'curated': 'SAMEFOLDER0001', 'same': True}
    # a folder not named yet stays unknown, never a guess
    assert f['none'] == {'submissions': None, 'curated': None, 'same': False}


def test_submitting_again_replaces_only_the_taggers_own_file_and_keeps_the_old_version(out):
    s = out['submit']
    assert s['subfolders'] == 1
    # each submission also stamps the image's subfolder with when it landed (req/shell/ground-truth/pending)
    stamp = ['mark', 'slide3_s2__a1b2c3d4']
    assert s['writes'] == [['folder', 'slide3_s2__a1b2c3d4'], ['create', 'gt_jane@lab.org.json'], stamp,
                           ['replace', 'gt_jane@lab.org.json', True], stamp, ['create', 'gt_bob@lab.org.json'], stamp]
    assert s['current'] == {'tagger': 'bob@lab.org', 'labels': 3, 'file': 'gt_bob@lab.org.json'}


def test_a_reader_takes_the_newest_created_that_is_not_rejected(out):
    # the newest is rejected, and the oldest was added to Drive last: the file's own time decides
    assert out['reader'] == {'tagger': 'mid@x.org', 'none': None}


def test_pending_is_a_submission_newer_than_its_last_acceptance_or_rejection(out):
    p = out['pending']
    # read from the two folders' listings alone: no image subfolder listed, no file read
    assert p['listed'] == ['C', 'S']
    assert p['a'] == {'curated': False, 'pending': True, 'rejected': False}
    # accepted after it was submitted: not pending
    assert p['b'] == {'curated': True, 'pending': False, 'rejected': False}
    assert p['c'] == {'curated': False, 'pending': False, 'rejected': True}
    # submitted again after the acceptance: pending again
    assert p['bAgain'] == {'curated': True, 'pending': True, 'rejected': False}
    # one folder for both: what lands is curated, nothing pending
    assert p['sameA'] == {'curated': True, 'pending': False, 'rejected': False}
    assert p['missing'] is None


def test_accepting_copies_into_curated_and_rejecting_marks_the_submission(out):
    c = out['curate']
    assert c['name'] == 'gt_jane@lab.org.json'
    assert c['accepted'] == {'by': 'dm@lab.org', 'from': 64}
    assert c['rejected'] is True and c['reason'] == 'test run'
