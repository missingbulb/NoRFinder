"""req/shell/account/welcome: opening the page asks, once, whether to sign in with Google or go on anonymously
(welcome_driver.mjs, in headless Chromium, against stand-ins for Google's sign-in)."""
import os
import shutil
import subprocess

import pytest

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')


@pytest.mark.skipif(not NODE, reason='node missing')
def test_welcome():
    r = subprocess.run([NODE, os.path.join(HERE, 'welcome_driver.mjs')], capture_output=True, text=True, timeout=90)
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stdout + r.stderr
