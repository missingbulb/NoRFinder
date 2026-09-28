"""Fetch the third-party wheels the page installs into Pyodide (packages Pyodide does not ship) into
web/vendor/, so the page never depends on PyPI at run time. The deploy runs this; so does a local preview:

  python3 web/build.py
  python3 -m http.server 8000        from the repo root, then open http://localhost:8000/web/
"""
import glob, json, os, shutil, subprocess, sys

VENDOR = ['tifffile==2026.3.3']
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vendor')

if __name__ == '__main__':
    shutil.rmtree(OUT, ignore_errors=True)
    subprocess.run([sys.executable, '-m', 'pip', 'download', '-q', '--no-deps', '--only-binary', ':all:', '-d', OUT, *VENDOR], check=True)
    json.dump(sorted(os.path.basename(f) for f in glob.glob(os.path.join(OUT, '*.whl'))), open(os.path.join(OUT, 'wheels.json'), 'w'))
