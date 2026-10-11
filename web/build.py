"""Fetch the third-party wheels the studies install into Pyodide (packages Pyodide does not ship, each
study's python.wheels in its study.json) into web/vendor/, so the page never depends on PyPI at run time, and write the deployment's settings into
web/config.js from the repository variables the deploy passes in (.github/site.config's build_vars):
GOOGLE_API_KEY turns on loading from Google Drive, and DRIVE_DEFAULT_FOLDER is the link its dialog
opens on. It also writes the version history the page shows (version_history.py). The deploy runs this; so does a local preview:

  python3 web/build.py
  python3 -m http.server 8000        from the repo root, then open http://localhost:8000/web/
"""
import glob, json, os, shutil, subprocess, sys

import version_history

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'vendor')


def wheels():
    """Every study's pinned wheels, once each."""
    pins = set()
    for path in glob.glob(os.path.join(HERE, '..', 'studies', '*', 'study.json')):
        pins.update(json.load(open(path))['python']['wheels'])
    return sorted(pins)


def config_js(env):
    """The page's settings from the deploy's variables; None without a key, keeping the committed file."""
    if not env.get('GOOGLE_API_KEY'):
        return None
    settings = {'google': {'apiKey': env['GOOGLE_API_KEY']}, 'drive': {'defaultLink': env.get('DRIVE_DEFAULT_FOLDER', '')}}
    return ('// written by web/build.py from the repository variables GOOGLE_API_KEY and DRIVE_DEFAULT_FOLDER\n'
            f'window.NOR_CONFIG = {json.dumps(settings)};\n')


if __name__ == '__main__':
    shutil.rmtree(OUT, ignore_errors=True)
    subprocess.run([sys.executable, '-m', 'pip', 'download', '-q', '--no-deps', '--only-binary', ':all:', '-d', OUT, *wheels()], check=True)
    json.dump(sorted(os.path.basename(f) for f in glob.glob(os.path.join(OUT, '*.whl'))), open(os.path.join(OUT, 'wheels.json'), 'w'))
    json.dump(version_history.history(os.path.dirname(HERE)), open(version_history.OUT, 'w'), indent=1)
    text = config_js(os.environ)
    if text:
        with open(os.path.join(HERE, 'config.js'), 'w') as f:
            f.write(text)
