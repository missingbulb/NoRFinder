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
