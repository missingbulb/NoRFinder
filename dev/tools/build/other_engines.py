"""Runs the full test set on another browser engine (req/checks/other-engines): PW_ENGINE tells each page test's driver
which engine to launch. Its failures fail the run only once the page supports that engine's browser
(web/browsers.json); before then they are reported as a warning, and the run stays green.

    python3 dev/tools/build/other_engines.py firefox|webkit
"""
import json
import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
# the browser each Playwright engine stands for
BROWSER = {'chromium': 'Chrome', 'firefox': 'Firefox', 'webkit': 'Safari'}


def counts(engine, supported):
    """Whether a failure on this engine is a failure of the page: its browser is one the page supports."""
    if engine not in BROWSER:
        raise ValueError(f'no browser known for the engine "{engine}"; known: {", ".join(BROWSER)}')
    return any(b['name'] == BROWSER[engine] for b in supported)


def verdict(engine, code, supported):
    """The run's exit code from the tests' own."""
    if code == 0 or counts(engine, supported):
        return code
    # expected while the browser is not supported: the failures are reported, and the night stays green
    print(f'::warning title={BROWSER[engine]} not yet supported::the full set failed on {engine}; '
          f'{BROWSER[engine]} is not in web/browsers.json, so the run stays green')
    return 0


def main(engine):
    supported = json.load(open(os.path.join(ROOT, 'web', 'browsers.json')))['supported']
    counts(engine, supported)
    code = subprocess.run([sys.executable, '-m', 'pytest', 'web-tests', 'studies', '-m', 'full', '-q', '--durations=10'],
                          cwd=ROOT, env={**os.environ, 'PW_ENGINE': engine}).returncode
    return verdict(engine, code, supported)


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
