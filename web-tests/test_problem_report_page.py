"""req/shell/browsers/supported, req/shell/report/bug, req/shell/report/action-log: which browsers the page supports, the status
bar's icon in any other, the problem report it and the avatar's menu open, and the actions it quotes
(problem_report_driver.mjs, in a headless browser)."""
import os
import shutil
import subprocess

import pytest

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')


@pytest.mark.skipif(not NODE, reason='node missing')
def test_problem_report():
    r = subprocess.run([NODE, os.path.join(HERE, 'problem_report_driver.mjs')], capture_output=True, text=True, timeout=120)
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stdout + r.stderr
