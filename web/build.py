"""Builds the site the release uploads: the shell decides what of the repo is published, from the
studies' standard layout (requirement S8), and assembles it under site/, the tree wrangler.json
publishes. The release runs this through wrangler.json's build command; so does a local preview:

  python3 web/build.py
  python3 -m http.server -d site 8000        then open http://localhost:8000/web/

It also fetches the third-party wheels the studies install into Pyodide (packages Pyodide does not
ship, each study's python.wheels) into web/vendor/, so the page never depends on PyPI at run time;
writes the version history the page shows (version_history.py); and writes the deployment's
settings into the published web/config.js from the repository variables: GOOGLE_API_KEY turns on
loading from Google Drive, and DRIVE_DEFAULT_FOLDER is the link its dialog opens on.
"""
import glob, json, os, shutil, subprocess, sys

import version_history

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(HERE, 'vendor')
SITE = os.path.join(ROOT, 'site')
# the shell's own build and authoring files, which sit beside its page
SHELL_TOOLING = {'logo_source.png'}
# what the build writes into web/ and the page reads
GENERATED = ('vendor', 'version_history.json')


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


def shell_ships(rel):
    name = os.path.basename(rel)
    return not name.endswith(('.py', '.md')) and name not in SHELL_TOOLING


def study_ships(rel, python_dirs):
    """A study's standard layout: study.json, its page part under web/ (never Python), and the
    modules directly in the folders its Python is imported from, which is all the page's importer
    can reach. Its docs, data, tests and lab notes stay in the repo."""
    if rel == 'study.json':
        return True
    if rel.startswith('web/'):
        return not rel.endswith('.py')
    return rel.endswith('.py') and os.path.dirname(rel) in python_dirs


def published(root):
    """The repo's files the site serves, repo-relative, in the order git lists them."""
    tracked = subprocess.run(['git', '-C', root, 'ls-files', '-z'], capture_output=True, check=True, text=True).stdout.split('\0')
    dirs = {}
    for rel in tracked:
        parts = rel.split('/')
        if parts[0] == 'web' and len(parts) > 1 and shell_ships(rel):
            yield rel
        elif parts[0] == 'studies' and len(parts) > 2:
            sid = parts[1]
            if sid not in dirs:
                manifest = os.path.join(root, 'studies', sid, 'study.json')
                dirs[sid] = {d.strip('/') for d in json.load(open(manifest))['python']['paths']} if os.path.isfile(manifest) else None
            if dirs[sid] is not None and study_ships('/'.join(parts[2:]), dirs[sid]):
                yield rel


def assemble(root, out, env):
    """Copies the published set, and what the build generated, into out/; returns the file count."""
    for top in ('web', 'studies'):
        shutil.rmtree(os.path.join(out, top), ignore_errors=True)
    files = list(published(root))
    for rel in files:
        os.makedirs(os.path.dirname(os.path.join(out, rel)), exist_ok=True)
        shutil.copy2(os.path.join(root, rel), os.path.join(out, rel))
    for name in GENERATED:
        src = os.path.join(root, 'web', name)
        if os.path.isdir(src):
            shutil.copytree(src, os.path.join(out, 'web', name))
        elif os.path.isfile(src):
            shutil.copy2(src, os.path.join(out, 'web', name))
    text = config_js(env)
    if text:
        with open(os.path.join(out, 'web', 'config.js'), 'w') as f:
            f.write(text)
    return len(files), bool(text)


if __name__ == '__main__':
    shutil.rmtree(OUT, ignore_errors=True)
    subprocess.run([sys.executable, '-m', 'pip', 'download', '-q', '--no-deps', '--only-binary', ':all:', '-d', OUT, *wheels()], check=True)
    json.dump(sorted(os.path.basename(f) for f in glob.glob(os.path.join(OUT, '*.whl'))), open(os.path.join(OUT, 'wheels.json'), 'w'))
    json.dump(version_history.history(ROOT), open(version_history.OUT, 'w'), indent=1)
    count, drive = assemble(ROOT, SITE, os.environ)
    size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(SITE) for f in fs)
    print(f'build: assembled {count} repo files and the generated ones under site/, {size / 1e6:.1f} MB; '
          + ('Google Drive loading is on' if drive else 'no GOOGLE_API_KEY, so Google Drive loading stays off'))
