"""req/vascular/model/run: the study's Python is ready, and a stack opens, without loading the extraction versions or
scipy, each checked in a Python of its own."""
import json
import os
import subprocess
import sys

import pytest

pytestmark = pytest.mark.full

STUDY = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def loaded_after(code):
    """The modules a fresh Python holds after code runs with the study's folders on its path."""
    paths = [os.path.join(STUDY, d) for d in ('py', 'analysis', os.path.join('analysis', 'extraction'))]
    run = f'import sys; sys.path[:0] = {paths!r}\n{code}\nimport json; print(json.dumps(sorted(sys.modules)))'
    return set(json.loads(subprocess.run([sys.executable, '-c', run], capture_output=True, text=True, check=True).stdout.splitlines()[-1]))


def test_python_is_ready_without_the_versions_or_scipy():
    got = loaded_after('import vascular; vascular.ready()')
    assert not {'scipy', 'skimage', 'lab'} & got

