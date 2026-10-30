"""In CI every test must run: a test that skips there for a missing slide, node, Pyodide or
Chromium would leave the run green while covering nothing, so a skip fails the run instead."""
import os

import pytest


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    if os.environ.get('CI') and report.skipped:
        report.outcome = 'failed'
        report.longrepr = f'skipped in CI, where every test must run: {report.longrepr}'


def pytest_configure(config):
    config.addinivalue_line('markers', 'full: drives Node, Pyodide or Chromium, or measures speed or memory; '
                                       'left out of the fast set every PR runs (-m "not full")')
