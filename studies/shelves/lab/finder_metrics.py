"""Each version of the finder scored on every ground truth, on the page's own path (reading/read.mjs: the page's
Pyodide, and its text finder for a version that reads text), into web/finder_metrics.json, the numbers the shell's
list of finders shows (req/shell/processing/algorithms). Run once per version, in the change that makes it (the nor-finder pack's
quality-per-version); the photos and ground truth come first from `python3 studies/shelves/lab/photos.py --gt`.

    python3 studies/shelves/lab/finder_metrics.py            # every version
    python3 studies/shelves/lab/finder_metrics.py r5         # one, the others kept as recorded
"""
import glob
import hashlib
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'py'))
import finders
from grade import boxes
from photos import RAW, photos

OUT = os.path.join(HERE, '..', 'web', 'finder_metrics.json')
# how far each version's score can be trusted: the photos it was tuned on are among those it is scored on
TUNED = {'r8': 'tuned on 3 of these photos', 'r5': 'tuned by eye, before any ground truth'}
READ = os.path.join(HERE, '..', 'reading', 'read.mjs')


def corpus():
    """[(photo's path, ground truth's path)] for every ground truth on hand, in its file's order."""
    by_id = {p['drive_id']: p['path'] for p in photos()}
    return [(by_id[os.path.basename(g).split('__')[0]], g) for g in sorted(glob.glob(os.path.join(RAW, 'gt', '*.json')))]


def dataset_sha256(pairs):
    h = hashlib.sha256()
    for _, g in pairs:
        h.update(open(g, 'rb').read())
    return h.hexdigest()


def score(version, pairs):
    per, tot = {}, dict(matched=0, truth=0, found=0)
    with tempfile.TemporaryDirectory() as tmp:
        for photo, g in pairs:
            out = os.path.join(tmp, 'found.json')
            subprocess.run(['node', READ, photo, f'find:{version}', 'none', out], check=True, stdout=subprocess.DEVNULL)
            r = boxes(json.load(open(g)), json.load(open(out))['books'])
            per[os.path.basename(g).split('__')[0]] = {k: r[k] for k in ('matched', 'truth', 'found')}
            for k in tot:
                tot[k] += r[k]
    return dict(precision=round(tot['matched'] / max(1, tot['found']), 3), recall=round(tot['matched'] / max(1, tot['truth']), 3),
                note=f"{tot['matched']} of them boxed, in {tot['found']} boxes; {TUNED[version]}", **tot, photos=per)


def main(argv=None):
    want = (argv if argv is not None else sys.argv[1:]) or list(finders.VERSIONS)
    pairs = corpus()
    doc = json.load(open(OUT)) if os.path.exists(OUT) else {}
    sha = dataset_sha256(pairs)
    if doc.get('dataset_sha256') not in (None, sha) and set(want) != set(finders.VERSIONS):
        sys.exit('the ground truth changed since the versions were scored: score them all again')
    versions = {k: v for k, v in doc.get('versions', {}).items() if k in finders.VERSIONS}
    for v in want:
        versions[v] = score(v, pairs)
        print(v, versions[v]['precision'], versions[v]['recall'], file=sys.stderr)
    books = sum(versions[want[0]]['photos'][k]['truth'] for k in versions[want[0]]['photos'])
    doc = dict(dataset_sha256=sha, photos=len(pairs), books=books, measured=f"on {books} books in {len(pairs)} photos the owner tagged",
               versions={k: versions[k] for k in finders.VERSIONS if k in versions})
    with open(OUT, 'w') as f:
        json.dump(doc, f, indent=1, ensure_ascii=False)
        f.write('\n')


if __name__ == '__main__':
    main()
