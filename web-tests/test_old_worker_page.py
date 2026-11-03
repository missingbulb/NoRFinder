"""req/shell/site/app-address: a browser still holding the service worker the app registered at the site's top, before the app moved
to /app/, gets the landing page at / and loses that registration, and the app registers its own
(old_worker_driver.mjs, in headless Chromium, with the worker as it was at the top)."""
import os
import shutil
import subprocess
import sys

import pytest

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
NODE = shutil.which('node')
# the commit before the app moved under /app/, whose web/sw.js browsers registered at the site's top
BEFORE_THE_MOVE = '1fe278b'


@pytest.mark.skipif(not NODE, reason='node missing')
def test_the_worker_the_app_once_registered_at_the_top_retires_itself(tmp_path):
    old = tmp_path / 'sw.js'
    # a shallow checkout (CI's) lacks the commit: fetch the history first
    if subprocess.run(['git', '-C', ROOT, 'rev-parse', '--is-shallow-repository'], capture_output=True, text=True).stdout.strip() == 'true':
        subprocess.run(['git', '-C', ROOT, 'fetch', '--quiet', '--unshallow', 'origin'], check=True)
    old.write_bytes(subprocess.run(['git', '-C', ROOT, 'show', f'{BEFORE_THE_MOVE}:web/sw.js'], capture_output=True, check=True).stdout)
    sys.path.insert(0, os.path.join(ROOT, 'dev', 'tools', 'build'))
    import build
    site = tmp_path / 'site'
    build.assemble(ROOT, str(site), {})
    r = subprocess.run([NODE, os.path.join(HERE, 'old_worker_driver.mjs'), str(site), str(old)], capture_output=True, text=True, timeout=120)
    print(r.stdout, r.stderr)
    if r.returncode == 2:
        pytest.skip(r.stderr.strip())
    assert r.returncode == 0, r.stdout + r.stderr
