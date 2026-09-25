"""Fetch the raw microscope data named in data/sources.json from Google Drive into data/raw/.

The images never enter git (docs/requirements.md R6); this manifest is the repository's whole
record of them. A file is trusted only when its SHA-256 matches the manifest; a null checksum
means "never fetched yet", and `--pin` writes what was fetched back into the manifest.

    pip install gdown
    python3 src/fetch_data.py            # fetch everything missing, verify everything
    python3 src/fetch_data.py --pin      # also record checksums / folder listings still null
    python3 src/fetch_data.py NAME ...   # only these sources
"""
import argparse
import fnmatch
import hashlib
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
MANIFEST = os.path.join(ROOT, 'data', 'sources.json')
RAW = os.path.join(ROOT, 'data', 'raw')


class ChecksumMismatch(Exception):
    pass


class GoogleDrive:
    """The real transport. Needs each file or folder shared as "Anyone with the link"."""

    def download(self, drive_id, out):
        import gdown
        os.makedirs(os.path.dirname(out), exist_ok=True)
        if gdown.download(id=drive_id, output=out, quiet=False) is None:
            raise RuntimeError(f'Drive refused {drive_id}: is it shared as "Anyone with the link"?')

    def list_folder(self, drive_id):
        """[(relative path, drive id)] for every file under the folder, recursively."""
        import gdown
        files = gdown.download_folder(id=drive_id, skip_download=True, quiet=True)
        return [(f.path, f.id) for f in files]


def load_manifest(path):
    with open(path) as f:
        return json.load(f)['sources']


def save_manifest(path, sources):
    with open(path, 'w') as f:
        json.dump({'sources': sources}, f, indent=2)
        f.write('\n')


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def verify(path, expected):
    if expected is None:
        return 'unpinned'
    actual = sha256_of(path)
    if actual != expected:
        raise ChecksumMismatch(f'{path}: sha256 {actual}, manifest says {expected}')
    return 'ok'


def _fetch_one(drive_id, out, expected, transport):
    """Download if absent, then verify. Returns the file's checksum."""
    if not os.path.exists(out):
        transport.download(drive_id, out)
    status = verify(out, expected)
    print(f'{status:9} {os.path.relpath(out, RAW) if out.startswith(RAW) else out}')
    return sha256_of(out) if status == 'unpinned' else expected


def fetch_all(manifest, raw, pin=False, only=None, transport=None):
    transport = transport or GoogleDrive()
    sources = load_manifest(manifest)
    for s in sources:
        if only and s['name'] not in only:
            continue
        if s['kind'] == 'file':
            digest = _fetch_one(s['drive_id'], os.path.join(raw, s['name']), s['sha256'], transport)
            if pin:
                s['sha256'] = digest
            continue
        files = s['files']
        if files is None:
            skip = s.get('skip', [])
            files = [{'path': p, 'drive_id': i, 'sha256': None}
                     for p, i in transport.list_folder(s['drive_id'])
                     if not any(fnmatch.fnmatch(os.path.basename(p), g) for g in skip)]
        for f in files:
            digest = _fetch_one(f['drive_id'], os.path.join(raw, f['path']), f['sha256'], transport)
            if pin:
                f['sha256'] = digest
        if pin:
            s['files'] = files
    if pin:
        save_manifest(manifest, sources)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('names', nargs='*', help='only these sources (default: all)')
    ap.add_argument('--pin', action='store_true',
                    help='write checksums and folder listings that are still null')
    args = ap.parse_args()
    try:
        fetch_all(MANIFEST, RAW, pin=args.pin, only=set(args.names) or None)
    except ChecksumMismatch as e:
        sys.exit(f'CHECKSUM MISMATCH — the file on Drive is not the one recorded.\n{e}')


if __name__ == '__main__':
    main()
