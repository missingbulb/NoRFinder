"""The ground-truth data set: what people marked on the NoR Finder page and submitted as GitHub issues.

Each submission is one file in lab/ground_truth/ (norfinder-ground-truth/2, written by the page's
Ground truth button) and one entry in lab/ground_truth/dataset.json. A file names its image by
SHA-256 and by its Google Drive id, so the image itself never enters git: `fetch` downloads it into
data/raw/ground-truth/ and checks the checksum.

Submitted files outrank everything older (docs/requirements.md R10): for one image, a newer
submission's label wins over an older one's at the same spot, and every submission wins over the
lab's own labels (lab/labels_claude_v1.json, Claude's eye) on the reference slide.

    python3 detection/ground_truth.py fetch                     every data-set image, into data/raw/
    python3 detection/ground_truth.py score [SPEC ...]          every finder on every image, vs the baseline
    python3 detection/ground_truth.py ingest ISSUES.json        the daily intake (the nor-finder pack's
                                                                ground-truth-intake task runs it)
"""
import argparse, datetime, json, math, os, re, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'src'))
import nor_lab
import fetch_data

FORMAT = 'norfinder-ground-truth/2'
DIR = os.path.join(HERE, 'lab', 'ground_truth')
DATASET = os.path.join(DIR, 'dataset.json')
BASELINE = os.path.join(HERE, 'lab', 'quality_baseline.json')
RAW = os.path.join(HERE, '..', 'data', 'raw', 'ground-truth')
# where a GitHub issue keeps an attached file; the page's submission is the newest .json among them
ATTACHMENT = re.compile(r'https://github\.com/(?:user-attachments/files|[\w.-]+/[\w.-]+/files)/[^\s)\]>"]+?\.json\b')


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
    for e in sorted(entries(dataset), key=lambda e: (e['added'], e['issue']), reverse=True):
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


def submitted_labels(img, dirpath=DIR):
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


def corpus(dataset=DATASET, dirpath=DIR):
    """Every image quality is judged on: [{'name', 'path', 'labels', 'submitted'}]. The reference slide
    comes first, its submitted labels over the lab's; every other image has only submitted labels."""
    subs = images(dataset)
    ref = reference_sha()
    lab = [L for L in nor_lab.read_labels(nor_lab.LABELS) if L['label'] is not None]
    mine = subs.pop(ref, None)
    out = [dict(name=os.path.basename(nor_lab.TIF), path=nor_lab.TIF, submitted=bool(mine),
                labels=merge((submitted_labels(mine, dirpath) if mine else []) + [lab]))]
    for img in subs.values():
        out.append(dict(name=img['name'], path=raw_path(img), submitted=True, labels=merge(submitted_labels(img, dirpath))))
    return out


def fetch(dataset=DATASET, transport=None):
    """Download every image quality is judged on that is not here yet (the reference slide through the
    data manifest, the rest by their Drive ids), and check each against its checksum."""
    transport = transport or fetch_data.GoogleDrive()
    fetch_data.fetch_all(fetch_data.MANIFEST, fetch_data.RAW, transport=transport,
                         match=[os.path.relpath(nor_lab.TIF, fetch_data.RAW).replace(os.sep, '/')])
    for img in images(dataset).values():
        if img['sha256'] == reference_sha():
            continue
        out = raw_path(img)
        if not os.path.exists(out):
            transport.download(img['drive_id'], out)
        fetch_data.verify(out, img['sha256'])
        print('ok       ', os.path.relpath(out, RAW))


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


# ---------- the daily intake ----------
def attachment(issue):
    """The newest .json attached to the issue (its body, then its comments in order), or None."""
    found = []
    for text in [issue.get('body') or ''] + list(issue.get('comments') or []):
        found += ATTACHMENT.findall(text)
    return found[-1] if found else None


def download(url, token=None):
    req = urllib.request.Request(url, headers={'Accept': 'application/octet-stream'})
    if token:
        # GitHub answers with a redirect to storage that refuses a second credential, so the token
        # must not follow the redirect
        req.add_unredirected_header('Authorization', f'Bearer {token}')
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def ingest(issues, get=download, dataset=DATASET, dirpath=DIR, today=None):
    """Add each issue's submission to the data set. Returns {'added': [issue numbers], 'refused':
    {issue number: reason}}. An issue already in the data set is left alone."""
    today = today or datetime.date.today().isoformat()
    have = entries(dataset); known = {e['issue'] for e in have}
    added, refused = [], {}
    for issue in sorted(issues, key=lambda i: i['number']):
        n = issue['number']
        if n in known:
            continue
        url = attachment(issue)
        if not url:
            refused[n] = 'no .json file is attached'
            continue
        try:
            doc = json.loads(get(url))
        except Exception as e:  # noqa: BLE001  (any unreadable attachment is the submitter's to fix)
            refused[n] = f'the attached file could not be read ({e})'
            continue
        why = validate(doc)
        if why:
            refused[n] = why
            continue
        doc['submission'] = {'issue': n, 'added': today}
        name = f'issue-{n}.json'
        os.makedirs(dirpath, exist_ok=True)
        with open(os.path.join(dirpath, name), 'w') as f:
            json.dump(doc, f, indent=1)
            f.write('\n')
        img = doc['image']
        have.append(dict(file=name, issue=n, added=today, image=img['name'], sha256=img['sha256'],
                         drive_id=img['location']['drive_id'],
                         labels=len(doc['labels']), missing=sum(L.get('kind') == 'missing' for L in doc['labels'])))
        added.append(n)
    if added:
        with open(dataset, 'w') as f:
            json.dump({'format': 'norfinder-ground-truth-dataset/1', 'files': sorted(have, key=lambda e: e['issue'])}, f, indent=1)
            f.write('\n')
    return dict(added=added, refused=refused)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('fetch')
    sc = sub.add_parser('score', help='every finder (or SPEC...) on every ground-truth image, against the baseline')
    sc.add_argument('specs', nargs='*')
    ing = sub.add_parser('ingest', help='add the submissions of the issues in ISSUES.json ([{number, body, comments}])')
    ing.add_argument('issues')
    ing.add_argument('--out', help='write the result as JSON here')
    a = ap.parse_args()
    if a.cmd == 'fetch':
        try:
            fetch()
        except fetch_data.ChecksumMismatch as e:
            sys.exit(f'CHECKSUM MISMATCH: the file on Drive is not the one the ground truth was marked on.\n{e}')
        return
    if a.cmd == 'score':
        import interactive
        report(a.specs or list(interactive.FINDERS))
        return
    with open(a.issues) as f:
        res = ingest(json.load(f), get=lambda u: download(u, os.environ.get('GITHUB_TOKEN')))
    print(json.dumps(res))
    if a.out:
        with open(a.out, 'w') as f:
            json.dump(res, f)


if __name__ == '__main__':
    main()
