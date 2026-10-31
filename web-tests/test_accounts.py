"""1.48: the site's server signs a user in with Google and keeps their one settings record
(accounts_driver.mjs, in Node, against a stand-in Google and KV store)."""
import os
import shutil
import subprocess

import pytest

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
NODE = shutil.which('node')


@pytest.mark.skipif(not NODE, reason='node missing')
def test_accounts_server():
    r = subprocess.run([NODE, os.path.join(HERE, 'accounts_driver.mjs')], capture_output=True, text=True, timeout=60)
    print(r.stdout, r.stderr)
    assert r.returncode == 0, r.stdout + r.stderr
