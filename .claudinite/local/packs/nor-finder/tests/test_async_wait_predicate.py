"""The async-wait-predicate check, run by the engine on a violating tree and a clean one.

    python3 -m pytest .claudinite/local/packs/nor-finder/tests
"""
import os
import shutil
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '..'))
CN = os.path.join(ROOT, '.claudinite', 'bin', 'cn')


def findings(tmp_path, files):
    """The check's findings, as path:line, on a repo holding this one's .claudinite and the given files."""
    shutil.copytree(os.path.join(ROOT, '.claudinite'), tmp_path / '.claudinite', ignore=shutil.ignore_patterns('__pycache__'))
    for name, text in files.items():
        (tmp_path / name).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / name).write_text(text)
    git = ['git', '-c', 'user.email=t@t', '-c', 'user.name=t']
    subprocess.run(['git', 'init', '-q'], cwd=tmp_path, check=True)
    subprocess.run(git + ['add', '-A'], cwd=tmp_path, check=True)
    subprocess.run(git + ['commit', '-qm', 'fixture'], cwd=tmp_path, check=True)
    out = subprocess.run([CN, 'check', '--pack', 'nor-finder', '--repo', str(tmp_path)], capture_output=True, text=True).stdout
    return sorted(line.split()[2].rstrip(':') for line in out.splitlines() if line.startswith('finding nor-finder/async-wait-predicate'))


def test_an_async_predicate_is_found_in_a_driver_and_a_study_test(tmp_path):
    assert findings(tmp_path, {
        'web-tests/a_driver.mjs': 'await page.waitForFunction(async () => (await caches.keys()).length);\n',
        'studies/x/tests/b_driver.mjs': 'const p = ctx.pages()[0];\nawait p.waitForFunction( async (n) => n, 1);\n',
    }) == ['studies/x/tests/b_driver.mjs:2', 'web-tests/a_driver.mjs:1']


def test_until_a_sync_predicate_a_comment_and_page_code_are_not(tmp_path):
    assert findings(tmp_path, {
        'web-tests/a_driver.mjs': ('await until(page, async () => (await caches.keys()).length);\n'
                                   'await page.waitForFunction(() => document.title);\n'
                                   '// page.waitForFunction(async () => x) never waits\n'),
        'web/page.js': 'await page.waitForFunction(async () => 1);\n',
    }) == []
