"""The ground-truth data set: what people marked on the NoR Finder page, curated in the study's Drive folders.

The study names its Drive root in study.json (`root`; R10, the shell's req/shell/data/roles): the root's settings
file (rauntruth-study.json) names its curated folder by id, else the folder named `GT curated` or `GT` is it. In it,
one subfolder per image, one file per tagger. There is no fetch step: scoring (`score`, finder_metrics.py) lists the
curated folder with no key, keeps per image the file with the latest `created`, and downloads a file the first time
it is scored, then keeps it under data/raw/ground-truth/, never git; each image too, checked against its SHA-256.
The tests read only what is already there.

The curated file outranks the lab's own labels (lab/labels_claude_v1.json, Claude's eye) on the reference
slide. The data set is named by one SHA (dataset_sha, R11).

    python3 detection/ground_truth.py score [SPEC ...]          every finder on every image, vs the baseline
    python3 detection/ground_truth.py record                    a new version's quality, written (R9, R11)
"""
import argparse, hashlib, json, math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import nor_lab
import fetch_data

FORMAT = 'norfinder-ground-truth/2'
STUDY = os.path.join(HERE, '..', 'study.json')
RAW = os.path.join(HERE, '..', 'data', 'raw', 'ground-truth')
DIR = os.path.join(RAW, 'truth')
DATASET = os.path.join(DIR, 'dataset.json')
BASELINE = os.path.join(HERE, 'lab', 'quality_baseline.json')
# the most entries the keyless listing of one folder is trusted to return whole
LISTING_MAX = 50
GT_FILE = re.compile(r'^gt_.+\.json$')
SETTINGS = 'rauntruth-study.json'
# the names the curated folder is found by while the root's settings file names none, best first
CURATED_NAMES = ('gt curated', 'gt')


class ListingFull(Exception):
    pass


def study_root(study=STUDY):
    """The study's Drive root's id, or None while it names none."""
    with open(study) as f:
        m = re.search(r'/folders/([\w-]{10,})', json.load(f).get('root') or '')
    return m.group(1) if m else None


def curated_listing(transport, root, dirpath):
    """([(path under the curated folder, id)], where): the curated folder's files, from the root's settings file, else
    by the folder's name; ([], None) while the root has none."""
    listing = transport.list_folder(root)
    settings = next((fid for path, fid in listing if path == SETTINGS), None)
    if settings:
        out = os.path.join(dirpath, 'incoming', SETTINGS)
        transport.download(settings, out)
        try:
            curated = json.load(open(out)).get('curated')
        except ValueError:
            curated = None
        if curated:
            return transport.list_folder(curated), curated
    tops = {path.split('/')[0] for path, _ in listing if '/' in path}
    for name in CURATED_NAMES:
        top = next((x for x in sorted(tops) if x.strip().lower() == name), None)
        if top:
            return [(path[len(top) + 1:], fid) for path, fid in listing if path.startswith(top + '/')], f'{root}/{top}'
    return [], None


def entries(dataset=DATASET):
    if not os.path.exists(dataset):
        return []
    with open(dataset) as f:
        return json.load(f)['files']


def validate(doc):
    """The reason a submission cannot join the data set, or None."""
    if not isinstance(doc, dict) or doc.get('format') != FORMAT:
        return f'not a {FORMAT} file (export it again from the page)'
    img = doc.get('image') or {}
    loc = img.get('location') or {}
    if loc.get('source') != 'drive' or not loc.get('drive_id'):
        return 'the image was not loaded from Google Drive, so the lab cannot fetch it'
    if not re.fullmatch(r'[0-9a-f]{64}', str(img.get('sha256', ''))):
        return 'the image has no SHA-256'
    labels = doc.get('labels')
    if not isinstance(labels, list) or not labels:
        return 'no marked candidates'
    W, H = img.get('width'), img.get('height')
    for L in labels:
        if L.get('label') not in (0, 1) or not all(isinstance(L.get(k), (int, float)) for k in ('x', 'y')):
            return f'a label without a position or a 0/1 verdict: {json.dumps(L)[:120]}'
        if W and H and not (0 <= L['x'] <= W and 0 <= L['y'] <= H):
            return f'a label outside the {W}x{H} image: x={L["x"]} y={L["y"]}'
        if L.get('kind') == 'missing' and not (L.get('label') == 1 and isinstance(L.get('radius_px'), (int, float))):
            return 'a missing-candidate mark without its radius'
    return None


def images(dataset=DATASET):
    """{sha256: {'name', 'sha256', 'drive_id', 'files': [entry, newest first]}}"""
    out = {}
    for e in sorted(entries(dataset), key=lambda e: e['created'], reverse=True):
        img = out.setdefault(e['sha256'], dict(name=e['image'], sha256=e['sha256'], drive_id=e['drive_id'], files=[]))
        img['files'].append(e)
    return out


def merge(tiers):
    """One reference from several label lists, best first: a label is dropped when a better list
    already has one at that spot (within the better label's own radius)."""
    out = []
    for labels in tiers:
        better = list(out)
        out += [L for L in labels if L.get('label') is not None
                and not any(math.hypot(L['x'] - M['x'], L['y'] - M['y']) <= nor_lab.radius(M) for M in better)]
    return out


def submitted_labels(img, dirpath):
    return [nor_lab.read_labels(os.path.join(dirpath, e['file'])) for e in img['files']]


def reference_sha():
    """The lab's reference slide's checksum, from the data manifest."""
    want = os.path.relpath(nor_lab.TIF, fetch_data.RAW).replace(os.sep, '/')
    for s in fetch_data.load_manifest(fetch_data.MANIFEST):
        for f in ([s] if s['kind'] == 'file' else s.get('files') or []):
            if f.get('path', f.get('name')) == want:
                return f['sha256']
    return None


def raw_path(img):
    return os.path.join(RAW, img['sha256'][:12] + '_' + os.path.basename(img['name']))


def file_sha(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def corpus(dataset=DATASET, dirpath=None):
    """Every image quality is judged on: [{'name', 'path', 'labels', 'submitted', 'image_sha256', 'gt_sha256'}].
    The reference slide comes first, its curated labels over the lab's (its gt_sha256 then both files' SHAs, the
    curated first, joined by +); every other image has only its curated labels."""
    dirpath = dirpath or os.path.dirname(dataset)
    subs = images(dataset)
    ref = reference_sha()
    lab = [L for L in nor_lab.read_labels(nor_lab.LABELS) if L['label'] is not None]
    mine = subs.pop(ref, None)
    out = [dict(name=os.path.basename(nor_lab.TIF), path=nor_lab.TIF, submitted=bool(mine), image_sha256=ref,
                gt_sha256='+'.join([e['gt_sha256'] for e in (mine['files'] if mine else [])] + [file_sha(nor_lab.LABELS)]),
                labels=merge((submitted_labels(mine, dirpath) if mine else []) + [lab]))]
    for img in subs.values():
        out.append(dict(name=img['name'], path=raw_path(img), submitted=True, image_sha256=img['sha256'],
                        gt_sha256='+'.join(e['gt_sha256'] for e in img['files']), labels=merge(submitted_labels(img, dirpath))))
    return out


def listed_whole(listing, folder):
    """Raise ListingFull when any folder in the listing ([(path, id)]) holds LISTING_MAX entries or more."""
    children = {}
    for path, _ in listing:
        parts = path.replace(os.sep, '/').split('/')
        for depth in range(len(parts)):
            children.setdefault('/'.join(parts[:depth]), set()).add(parts[depth])
    for where, names in children.items():
        if len(names) >= LISTING_MAX:
            raise ListingFull(f'the curated folder {folder}{" (" + where + ")" if where else ""} listed {len(names)} entries: '
                              f'its listing with no key may stop at {LISTING_MAX}, so the set may be cut short. '
                              'Stopped rather than score part of it.')


def collect(transport, root, dirpath=DIR):
    """Every image's newest curated file under the study's root, written into dirpath with the data set beside them;
    a file kept from an earlier run is not downloaded again. Returns {'files': [entry], 'refused': {path: reason}}."""
    os.makedirs(dirpath, exist_ok=True)
    listing, folder = curated_listing(transport, root, dirpath)
    if folder:
        listed_whole(listing, folder)
    by_image = {}
    for path, fid in listing:
        parts = path.replace(os.sep, '/').split('/')
        if len(parts) == 2 and GT_FILE.match(parts[1]):
            by_image.setdefault(parts[0], []).append((path, fid))
    kept, refused = [], {}
    for sub, found in sorted(by_image.items()):
        best = None
        for path, fid in found:
            out = os.path.join(dirpath, 'incoming', fid + '.json')
            if not os.path.exists(out):
                transport.download(fid, out)
            with open(out, 'rb') as f:
                raw = f.read()
            try:
                doc = json.loads(raw)
            except ValueError as e:
                refused[path] = f'not JSON ({e})'
                continue
            why = validate(doc) or (None if isinstance(doc.get('created'), str) else 'no `created` time')
            if why:
                refused[path] = why
            elif not best or doc['created'] > best[1]['created']:
                best = (path, doc, raw)
        if best:
            path, doc, raw = best
            name = sub + '.json'
            with open(os.path.join(dirpath, name), 'wb') as f:
                f.write(raw)
            img = doc['image']
            kept.append(dict(file=name, from_path=path, created=doc['created'], tagger=doc.get('tagger'), image=img['name'],
                             sha256=img['sha256'], drive_id=img['location']['drive_id'], gt_sha256=hashlib.sha256(raw).hexdigest(),
                             labels=len(doc['labels']), missing=sum(L.get('kind') == 'missing' for L in doc['labels'])))
    with open(os.path.join(dirpath, 'dataset.json'), 'w') as f:
        json.dump({'format': 'norfinder-ground-truth-dataset/2', 'folder': folder, 'files': kept}, f, indent=1)
        f.write('\n')
    return dict(files=kept, refused=refused)


def dataset_sha(pairs):
    """One SHA for a data set: the SHA-256 of its (image_sha256, gt_sha256) pairs, sorted, one per line."""
    lines = sorted(f"{p['image_sha256']} {p['gt_sha256']}" for p in pairs)
    return hashlib.sha256('\n'.join(lines).encode()).hexdigest()


def sync(dataset=DATASET, transport=None):
    """Before scoring: the curated set as the study's root has it, and every image quality is judged on that is not
    here yet (the reference slide through the data manifest, the rest by their Drive ids), each checked against its
    checksum. Nothing kept from an earlier run is downloaded again."""
    transport = transport or fetch_data.GoogleDrive()
    root = study_root()
    if root:
        got = collect(transport, root, os.path.dirname(dataset))
        for path, why in got['refused'].items():
            print(f'skipped   {path}: {why}')
        print(f'ground truth: {len(got["files"])} curated images')
    else:
        print('ground truth: the study names no root; the lab scores on its own labels alone')
    fetch_data.fetch_all(fetch_data.MANIFEST, fetch_data.RAW, transport=transport,
                         match=[os.path.relpath(nor_lab.TIF, fetch_data.RAW).replace(os.sep, '/')])
    for img in images(dataset).values():
        if img['sha256'] == reference_sha():
            continue
        out = raw_path(img)
        if not os.path.exists(out):
            transport.download(img['drive_id'], out)
        fetch_data.verify(out, img['sha256'])


def synced():
    """sync(), stopping with the reason when the store's answer cannot be trusted."""
    try:
        sync()
    except fetch_data.ChecksumMismatch as e:
        sys.exit(f'CHECKSUM MISMATCH: the file on Drive is not the one the ground truth was marked on.\n{e}')
    except ListingFull as e:
        sys.exit(f'STOPPED: {e}')


# ---------- scoring ----------
def spot(L):
    return [round(L['x'], 1), round(L['y'], 1)]


def result(spec, data, labels):
    """On one image, the labelled spots the finder passes ('found': real ones, 'false': not-NoR ones)
    and the missing-candidate marks it proposes a candidate on ('missing')."""
    cands, _ = nor_lab.run(spec, data)
    hit = {'found': [], 'false': [], 'missing': [spot(L) for L in nor_lab.missing_found(cands, labels)]}
    for L in labels:
        sc, _ = nor_lab.score(cands, [L])
        if sc['tp']:
            hit['found'].append(spot(L))
        elif sc['fp']:
            hit['false'].append(spot(L))
    return {k: sorted(v) for k, v in hit.items()}


def compare(old, new):
    """(losses, gains), one line per spot that moved."""
    was = {k: {tuple(s) for s in old.get(k, [])} for k in ('found', 'false', 'missing')}
    now = {k: {tuple(s) for s in new.get(k, [])} for k in ('found', 'false', 'missing')}
    losses = [f'no longer finds the real NoR at x={x} y={y}' for x, y in sorted(was['found'] - now['found'])]
    losses += [f'now passes the not-NoR at x={x} y={y}' for x, y in sorted(now['false'] - was['false'])]
    losses += [f'no longer proposes a candidate at the missing mark x={x} y={y}' for x, y in sorted(was['missing'] - now['missing'])]
    gains = [f'now finds the real NoR at x={x} y={y}' for x, y in sorted(now['found'] - was['found'])]
    gains += [f'no longer passes the not-NoR at x={x} y={y}' for x, y in sorted(was['false'] - now['false'])]
    gains += [f'now proposes a candidate at the missing mark x={x} y={y}' for x, y in sorted(now['missing'] - was['missing'])]
    return losses, gains


def report(specs, baseline=BASELINE):
    """One line per finder and image: what it finds on the ground truth, and how that moved since the
    committed baseline (the last results anyone recorded)."""
    with open(baseline) as f:
        base = json.load(f)
    for im in corpus():
        data = nor_lab.load(im['path'])
        labels = im['labels']
        real = sum(L['label'] == 1 for L in labels); marks = sum(L.get('kind') == 'missing' for L in labels)
        print(f"{im['name']}: {real} real ({marks} missing marks), {len(labels) - real} not"
              + (' [submitted ground truth]' if im['submitted'] else ' [lab labels only]'))
        for spec in specs:
            new = result(spec, data, labels)
            losses, gains = compare(base.get(nor_lab.parse(spec)[0], {}).get(im['name'], {}), new)
            print(f"  {spec:28s} found {len(new['found']):3d}/{real}  false {len(new['false']):3d}  "
                  f"missing marks proposed {len(new['missing'])}/{marks}  | vs baseline: -{len(losses)} +{len(gains)}")
            for line in losses:
                print('      LOSS ' + line)
            for line in gains:
                print('      gain ' + line)


def record(baseline=BASELINE):
    """A new version's quality, recorded once (R9): every finder's results on every ground-truth image written to the
    baseline, and its precision and recall with the dataset SHA (R11). report() first names what moved."""
    import interactive, finder_metrics
    base = {name: {} for name in sorted(interactive.FINDERS)}
    for im in corpus():
        data = nor_lab.load(im['path'])
        for name in base:
            base[name][im['name']] = result(name, data, im['labels'])
    with open(baseline, 'w') as f:
        json.dump(base, f, indent=1, sort_keys=True)
        f.write('\n')
    finder_metrics.write()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    sc = sub.add_parser('score', help='every finder (or SPEC...) on every ground-truth image, against the baseline')
    sc.add_argument('specs', nargs='*')
    sub.add_parser('record', help="a new version's quality: the baseline and the finders' precision and recall, rewritten")
    a = ap.parse_args()
    synced()
    if a.cmd == 'record':
        return record()
    import interactive
    report(a.specs or list(interactive.FINDERS))


if __name__ == '__main__':
    main()
