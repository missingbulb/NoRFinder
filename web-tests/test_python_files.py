"""req/shell/python/background-load: Python's importer asks the site only for a module the study's folders hold on the
release, as its offline list names them (studyModules, web/python_files.js), run under Node."""
import json
import os
import shutil
import subprocess

import pytest

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')
MODULE = os.path.join(HERE, '..', 'web', 'python_files.js')


def modules(listing, bases, app):
    if not NODE:
        pytest.skip('node missing')
    code = (f'import {{ studyModules }} from {json.dumps("file://" + os.path.abspath(MODULE))};'
            f'console.log(JSON.stringify(studyModules({json.dumps(listing)}, {json.dumps(bases)}, {json.dumps(app)})))')
    r = subprocess.run([NODE, '--input-type=module', '-e', code], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


APP = 'https://acme.example/app/'
BASES = ['https://acme.example/studies/acme/py/', 'https://acme.example/studies/acme/analysis/']


def test_each_module_directly_in_a_folder_is_found_there():
    listing = {'files': [{'path': '../studies/acme/py/entry.py'}, {'path': '../studies/acme/analysis/lab.py'},
                         {'path': '../studies/acme/analysis/deep/hidden.py'}, {'path': '../studies/acme/py/notes.md'},
                         {'path': '../studies/other/py/theirs.py'}, {'path': 'shell.js'}]}
    assert modules(listing, BASES, APP) == {'entry': BASES[0] + 'entry.py', 'lab': BASES[1] + 'lab.py'}


def test_a_name_two_folders_hold_is_the_first_folders():
    listing = {'files': [{'path': '../studies/acme/analysis/x.py'}, {'path': '../studies/acme/py/x.py'}]}
    assert modules(listing, BASES, APP) == {'x': BASES[0] + 'x.py'}


def test_no_listing_leaves_every_name_to_ask_for():
    assert modules(None, BASES, APP) is None
