"""req/checks/other-engines: the nightly run on Firefox and WebKit fails the night only for an engine whose browser the page
supports (web/browsers.json); for any other its failures are reported and the night stays green."""
import importlib.util
import os

import pytest

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dev', 'tools', 'build', 'other_engines.py')
spec = importlib.util.spec_from_file_location('other_engines', SCRIPT)
other_engines = importlib.util.module_from_spec(spec)
spec.loader.exec_module(other_engines)

CHROMIUM_ONLY = [{'name': 'Chrome', 'from': 114}, {'name': 'Edge', 'from': 114}]
WITH_FIREFOX = CHROMIUM_ONLY + [{'name': 'Firefox', 'from': 125}]


def test_an_engine_counts_only_once_its_browser_is_supported():
    assert not other_engines.counts('firefox', CHROMIUM_ONLY)
    assert other_engines.counts('firefox', WITH_FIREFOX)
    assert not other_engines.counts('webkit', WITH_FIREFOX)
    assert other_engines.counts('webkit', WITH_FIREFOX + [{'name': 'Safari', 'from': 17}])


def test_an_engine_it_does_not_know_is_refused():
    with pytest.raises(ValueError):
        other_engines.counts('servo', WITH_FIREFOX)


def test_a_failure_is_reported_and_kept_green_where_the_browser_is_not_supported(capsys):
    assert other_engines.verdict('firefox', 1, CHROMIUM_ONLY) == 0
    assert 'Firefox' in capsys.readouterr().out
    assert other_engines.verdict('firefox', 1, WITH_FIREFOX) == 1
    assert other_engines.verdict('firefox', 0, WITH_FIREFOX) == 0


def test_the_run_leaves_out_only_what_chromium_alone_can_measure():
    """A test marked chromium_only (its subject read through Chromium's DevTools) is left out; the rest of the
    memory test's module, and every other full test, is run."""
    import subprocess
    import sys
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
    out = subprocess.run([sys.executable, '-m', 'pytest', '--collect-only', '-q', '-p', 'no:cacheprovider', *other_engines.SELECTED,
                          'studies/nor/tests/test_memory.py', 'web-tests/test_grid_page.py'], cwd=root, capture_output=True, text=True).stdout
    collected = [line for line in out.splitlines() if '::' in line]
    assert len(collected) >= 2, out
    assert not any('test_page_holds_no_more_after_repeats' in line for line in collected), collected
    assert any('test_grid_page.py' in line for line in collected), collected

