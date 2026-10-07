"""R9: CI runs in two sets. The fast set (`-m "not full"`) runs on every PR and needs neither Node nor a
browser; the full set adds every test that drives Node, Pyodide or Chromium, or measures speed or memory,
and runs on every push to main, before anything can be released, and nightly from the nor-finder
pack's full-tests task."""
import ast
import glob
import os

HERE = os.path.dirname(os.path.abspath(__file__))
WORKFLOWS = os.path.join(HERE, '..', '.github', 'workflows')
HEAVY = ('_driver.mjs', 'needs_node', 'subprocess', 'perf_counter', 'mallinfo', 'Speed-ups')


def marked_full(path):
    tree = ast.parse(open(path).read())
    return any(isinstance(n, ast.Assign) and any(getattr(t, 'id', '') == 'pytestmark' for t in n.targets)
               and 'full' in ast.unparse(n.value) for n in tree.body)


def test_every_heavy_test_is_in_the_full_set():
    heavy = [p for p in sorted(glob.glob(os.path.join(HERE, 'test_*.py')))
             if any(h in open(p).read() for h in HEAVY) and not p.endswith('test_ci_split.py')]
    assert len(heavy) >= 7, f'found only {len(heavy)} heavy test modules: the probe is not looking at them all'
    unmarked = [os.path.basename(p) for p in heavy if not marked_full(p)]
    assert not unmarked, f'drive Node or a browser, or time or weigh something, but are not marked full: {unmarked}'


def test_the_fast_workflow_leaves_out_what_is_marked_full():
    fast = open(os.path.join(WORKFLOWS, 'tests.yml')).read()
    full = open(os.path.join(WORKFLOWS, 'tests-full.yml')).read()
    assert '-m "not full"' in fast, 'the fast workflow does not deselect the full mark'
    assert 'playwright' not in fast and 'pyodide' not in fast, 'the fast workflow still installs the browser'
    assert '-m "not full"' not in full, 'the full workflow leaves the full mark out'
