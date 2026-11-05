"""The owner's shelf photos, from the study's Google Drive folder into data/raw/<drive id>.<ext>.

The photos never enter git; data/sources.json is the repository's whole record of them, each with its SHA-256. Several
photos share a file name in the folder, so each is kept by its Drive id.

    pip install gdown
    python3 studies/shelves/lab/photos.py          # fetch what is missing, verify everything
    python3 studies/shelves/lab/photos.py --pin    # list the folder again: record what is new, drop what is gone
"""
import argparse
import hashlib
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
MANIFEST = os.path.join(ROOT, 'data', 'sources.json')
RAW = os.path.join(ROOT, 'data', 'raw')


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def path_of(photo):
    return os.path.join(RAW, photo['drive_id'] + os.path.splitext(photo['name'])[1].lower())


def photos():
    """Every photo the manifest records, [{name, drive_id, sha256, path}]."""
    with open(MANIFEST) as f:
        return [dict(p, path=path_of(p)) for p in json.load(f)['photos']]


def main(argv=None):
    import gdown
    ap = argparse.ArgumentParser()
    ap.add_argument('--pin', action='store_true')
    a = ap.parse_args(argv)
    with open(MANIFEST) as f:
        doc = json.load(f)
    if a.pin:
        # the folder is the corpus: a photo the owner took out of it leaves the manifest too
        known = {p['drive_id']: p for p in doc['photos']}
        listed = gdown.download_folder(id=doc['folder'], skip_download=True, quiet=True)
        doc['photos'] = [known.get(f.id) or dict(name=f.path, drive_id=f.id, sha256=None) for f in listed]
    os.makedirs(RAW, exist_ok=True)
    for p in doc['photos']:
        out = path_of(p)
        if not os.path.exists(out) and gdown.download(id=p['drive_id'], output=out, quiet=True) is None:
            sys.exit(f'Drive refused {p["drive_id"]}: is the folder shared as "Anyone with the link"?')
        got = sha256_of(out)
        if p['sha256'] is None and a.pin:
            p['sha256'] = got
        elif got != p['sha256']:
            sys.exit(f'{out}: sha256 {got}, the manifest says {p["sha256"]}')
        print('ok', os.path.relpath(out, ROOT))
    if a.pin:
        with open(MANIFEST, 'w') as f:
            json.dump(doc, f, indent=2)
            f.write('\n')


if __name__ == '__main__':
    main()
