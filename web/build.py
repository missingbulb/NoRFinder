"""Fetch the third-party wheels the page installs into Pyodide (packages Pyodide does not ship) into
web/vendor/, so the page never depends on PyPI at run time, and write the deployment's settings into
web/config.js: GOOGLE_API_KEY, the repository variable the deploy passes in (.github/site.config's
build_vars), turns on loading from Google Drive. The deploy runs this; so does a local preview:

  python3 web/build.py
  python3 -m http.server 8000        from the repo root, then open http://localhost:8000/web/
"""
import glob, json, os, shutil, subprocess, sys

VENDOR = ['tifffile==2026.3.3']
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'vendor')

if __name__ == '__main__':
    shutil.rmtree(OUT, ignore_errors=True)
    subprocess.run([sys.executable, '-m', 'pip', 'download', '-q', '--no-deps', '--only-binary', ':all:', '-d', OUT, *VENDOR], check=True)
    json.dump(sorted(os.path.basename(f) for f in glob.glob(os.path.join(OUT, '*.whl'))), open(os.path.join(OUT, 'wheels.json'), 'w'))
    key = os.environ.get('GOOGLE_API_KEY')
    if key:
        with open(os.path.join(HERE, 'config.js'), 'w') as f:
            f.write('// written by web/build.py from the repository variable GOOGLE_API_KEY\n'
                    f'window.NOR_CONFIG = {{ google: {{ apiKey: {json.dumps(key)} }} }};\n')
