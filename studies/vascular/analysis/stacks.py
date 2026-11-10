"""The study's raw confocal stacks: the TIFFs in its Drive root's Data folder, fetched into data/raw/ the first
time one is needed. They never enter git (data/README.md).

    pip install gdown
    python3 analysis/stacks.py                            # the stacks directly in Data/
    python3 analysis/stacks.py 'Originals uncropped/*'    # those whose path under Data/ matches a glob
"""
import argparse
import fnmatch
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
STUDY = os.path.join(HERE, '..', 'study.json')
RAW = os.path.join(HERE, '..', 'data', 'raw')
DATA = 'Data'
PREVIEWS = 'rauntruth-previews.tiff'


class GoogleDrive:
    """The real transport. Needs the root shared as "Anyone with the link"."""

    def download(self, drive_id, out):
        import gdown
        os.makedirs(os.path.dirname(out), exist_ok=True)
        if gdown.download(id=drive_id, output=out, quiet=False) is None:
            raise RuntimeError(f'Drive refused {drive_id}: is it shared as "Anyone with the link"?')

    def list_folder(self, drive_id):
        """[(relative path, drive id)] for every file under the folder, recursively."""
        import gdown
        return [(f.path, f.id) for f in gdown.download_folder(id=drive_id, skip_download=True, quiet=True)]


def _study(study):
    with open(study) as f:
        return json.load(f)


def root_id(study=STUDY):
    """The study's Drive root's id, or None while it names none."""
    m = re.search(r'/folders/([\w-]{10,})', _study(study).get('root') or '')
    return m and m.group(1)


def z_step_um(study=STUDY):
    """The spacing between slices in µm, for a stack whose file stores none: the study's view.spacing, or None."""
    return (_study(study).get('view') or {}).get('spacing')


def listing(transport, root):
    """[(path under Data/, drive id)]: every TIFF there but the previews files, sorted by path."""
    top = DATA + '/'
    return sorted((p[len(top):], i) for p, i in transport.list_folder(root)
                  if p.startswith(top) and p.lower().endswith(('.tif', '.tiff')) and os.path.basename(p) != PREVIEWS)


def fetch(globs=None, raw=RAW, transport=None, study=STUDY):
    """The local paths of the stacks whose path under Data/ matches a glob (none given: those directly in Data/),
    each downloaded first if raw/ lacks it."""
    root = root_id(study)
    if not root:
        return []
    transport = transport or GoogleDrive()
    out = []
    for path, fid in listing(transport, root):
        if not (any(fnmatch.fnmatch(path, g) for g in globs) if globs else '/' not in path):
            continue
        local = os.path.join(raw, *path.split('/'))
        if not os.path.exists(local):
            # under another name until whole, so a download cut short is never taken for the stack
            transport.download(fid, local + '.part')
            os.replace(local + '.part', local)
        out.append(local)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('globs', nargs='*', help="paths under Data/ (default: the stacks directly in it)")
    for p in fetch(ap.parse_args().globs or None):
        print(os.path.relpath(p, RAW))


if __name__ == '__main__':
    main()
