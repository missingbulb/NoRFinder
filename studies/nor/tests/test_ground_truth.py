"""req/nor/downloads, R10, R11 — ground truth saved from the page scores the finders in the lab, the lab takes it from
the study's curated Drive folder by code, and the data set is named by one SHA.

Run: python3 tests/test_ground_truth.py
"""
import hashlib
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'detection'))
import ground_truth
import nor_lab


def cand(x, y, fail=None, length=None, red=None):
    c = dict(cx=x, cy=y, fail=fail)
    if length is not None:
        c.update(length_px=length, red_len_px=red)
    return c


PAGE = {
    'format': 'norfinder-ground-truth/1',
    'image': {'name': 'acme.tif', 'width': 100, 'height': 100},
    'labels': [
        {'id': 1, 'x': 10, 'y': 10, 'label': 1, 'source': 'user', 'measured': 'adjusted', 'length_px': 12.0, 'red_length_px': 3.0},
        {'id': 2, 'x': 50, 'y': 50, 'label': 0, 'source': 'user', 'measured': None},
        {'id': 3, 'x': 80, 'y': 80, 'label': 1, 'source': 'finder', 'measured': 'approved', 'length_px': 9.0, 'red_length_px': 2.0},
        {'id': 4, 'x': 30, 'y': 70, 'label': 1, 'source': 'finder', 'measured': None, 'length_px': 7.0, 'red_length_px': 1.0},
    ],
}


def write(obj):
    f = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False)
    json.dump(obj, f); f.close(); return f.name


def test_a_page_file_scores_like_a_lab_file():
    cands = [cand(11, 10, length=10.0, red=3.5), cand(50, 51), cand(80, 80, 'dim'), cand(31, 70, length=7.0, red=1.0)]
    page = nor_lab.read_labels(write(PAGE))
    lab = nor_lab.read_labels(write([{k: L[k] for k in ('id', 'x', 'y', 'label')} for L in PAGE['labels']]))
    assert nor_lab.score(cands, page)[0] == nor_lab.score(cands, lab)[0]
    assert nor_lab.score(cands, page)[0] | {} == dict(tp=2, fp=1, fn=1, prec=2 / 3, rec=2 / 3)


def test_only_measurements_a_person_checked_are_scored():
    # 1 was adjusted by hand and 3 approved; 4 is the finder's own number, so it proves nothing
    cands = [cand(11, 10, length=10.0, red=3.5), cand(80, 80, length=9.0, red=2.5), cand(31, 70, length=99.0, red=9.0)]
    e = nor_lab.measure_error(cands, nor_lab.read_labels(write(PAGE)))
    assert e['n'] == 2
    assert abs(e['length_mae'] - 1.0) < 1e-9 and abs(e['red_mae'] - 0.5) < 1e-9
    # a checked NoR the finder did not pass has no measurement to compare
    cands[1]['fail'] = 'dim'
    assert nor_lab.measure_error(cands, nor_lab.read_labels(write(PAGE)))['n'] == 1


SHA = 'ab' * 32


def submission(labels, source='drive', sha=SHA):
    loc = {'source': source, 'drive_id': 'D1' if source == 'drive' else None, 'name': 'acme.tif'}
    return {'format': ground_truth.FORMAT, 'image': {'name': 'acme.tif', 'sha256': sha, 'width': 100, 'height': 100,
                                                     'location': loc}, 'labels': labels}


MISSING = {'kind': 'missing', 'x': 40, 'y': 40, 'label': 1, 'source': 'user', 'radius_px': 10}


def test_a_missing_mark_is_a_real_nor_found_within_its_radius():
    labels = nor_lab.read_labels(write(submission([MISSING])))
    near, far = cand(47, 40), cand(52, 40)
    assert nor_lab.score([near], labels)[0]['tp'] == 1
    assert nor_lab.score([far], labels)[0]['fn'] == 1
    # proposing a candidate there counts even when a filter rejects it
    assert nor_lab.missing_found([cand(47, 40, 'dim')], labels) == labels
    assert nor_lab.missing_found([far], labels) == []


def test_a_newer_submission_wins_at_the_same_spot():
    old = [{'x': 10, 'y': 10, 'label': 1}, {'x': 60, 'y': 60, 'label': 0}]
    new = [{'x': 11, 'y': 10, 'label': 0}]
    lab = [{'x': 60, 'y': 61, 'label': 1}, {'x': 90, 'y': 90, 'label': 1}, {'x': 5, 'y': 5, 'label': None}]
    got = ground_truth.merge([new, old, lab])
    assert [(L['x'], L['label']) for L in got] == [(11, 0), (60, 0), (90, 1)]
    # within one submission nothing is dropped, however close
    assert len(ground_truth.merge([[MISSING, {'x': 45, 'y': 40, 'label': 0}]])) == 2


def test_only_drive_images_with_marks_are_accepted():
    assert ground_truth.validate(submission([MISSING])) is None
    assert 'Google Drive' in ground_truth.validate(submission([MISSING], source='local'))
    assert 'no marked' in ground_truth.validate(submission([]))
    assert 'outside' in ground_truth.validate(submission([{'x': 140, 'y': 3, 'label': 1}]))
    assert 'radius' in ground_truth.validate(submission([dict(MISSING, radius_px=None)]))
    assert ground_truth.validate(dict(submission([MISSING]), format='norfinder-ground-truth/1'))


class Curated:
    """A stand-in for the keyless Drive listing: each folder's files by path under it (its subfolders' files too, as
    gdown lists them), and their bytes by id; downloaded counts each file fetched."""
    def __init__(self, folders):
        self.folders, self.bodies, self.downloaded = {}, {}, []
        for folder, tree in folders.items():
            self.folders[folder] = []
            for path, body in sorted(tree.items()):
                fid = f'id{len(self.bodies)}'
                self.bodies[fid] = body
                self.folders[folder].append((path, fid))

    def list_folder(self, drive_id):
        return list(self.folders.get(drive_id, []))

    def download(self, drive_id, out):
        self.downloaded.append(drive_id)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, 'w') as f:
            f.write(self.bodies[drive_id])


def doc(created, labels, who='jane@acme.example', sha=SHA):
    return json.dumps(dict(submission(labels, sha=sha), created=created, tagger=who))


SUB = 'acme__' + SHA[:8]
TREE = {f'{SUB}/gt_jane@acme.example.json': doc('2026-11-05T10:00:00Z', [MISSING]),
        f'{SUB}/gt_bob@acme.example.json': doc('2026-11-05T12:00:00Z', [MISSING, {'x': 60, 'y': 60, 'label': 0}], who='bob@acme.example'),
        f'{SUB}/notes.txt': 'not ground truth',
        'other__cdcdcdcd/gt_jane@acme.example.json': doc('2026-11-05T09:00:00Z', [], sha='cd' * 32)}


def under(prefix, tree):
    return {f'{prefix}/{p}': b for p, b in tree.items()}


def test_the_lab_takes_each_images_newest_curated_file(tmp_path):
    # no settings file in the root: the curated folder found by its name
    got = ground_truth.collect(Curated({'ROOT': {'Data/a.tif': '', **under('GT curated', TREE)}}), 'ROOT', dirpath=str(tmp_path))
    assert [(e['image'], e['tagger'], e['labels']) for e in got['files']] == [('acme.tif', 'bob@acme.example', 2)]
    # an image whose only file cannot be used is left out, saying why
    why = got['refused']
    assert list(why) == ['other__cdcdcdcd/gt_jane@acme.example.json'] and 'no marked' in why['other__cdcdcdcd/gt_jane@acme.example.json']
    img = ground_truth.images(str(tmp_path / 'dataset.json'))[SHA]
    assert img['drive_id'] == 'D1' and len(img['files']) == 1
    # the file the lab took is the one scored, by its own SHA-256
    kept = open(tmp_path / img['files'][0]['file'], 'rb').read()
    assert img['files'][0]['gt_sha256'] == hashlib.sha256(kept).hexdigest()


def test_the_roots_settings_file_names_the_curated_folder(tmp_path):
    # its curated folder named by id, wherever it is; a folder merely named GT curated is passed over
    store = Curated({'ROOT': {'rauntruth-study.json': json.dumps({'format': 'rauntruth-study/1', 'curated': 'CUR'}),
                              **under('GT curated', {'x__00000000/gt_a@acme.example.json': doc('2026-11-05T10:00:00Z', [MISSING], sha='0' * 64)})},
                     'CUR': TREE})
    got = ground_truth.collect(store, 'ROOT', dirpath=str(tmp_path))
    assert [e['tagger'] for e in got['files']] == ['bob@acme.example']


def test_a_file_scored_once_is_not_downloaded_again(tmp_path):
    store = Curated({'ROOT': under('GT', TREE)})
    ground_truth.collect(store, 'ROOT', dirpath=str(tmp_path))
    first = len(store.downloaded)
    ground_truth.collect(store, 'ROOT', dirpath=str(tmp_path))
    assert first == 3 and len(store.downloaded) == first


def test_a_root_with_no_ground_truth_scores_on_the_labs_labels(tmp_path):
    got = ground_truth.collect(Curated({'ROOT': {'Data/a.tif': ''}}), 'ROOT', dirpath=str(tmp_path))
    assert got == {'files': [], 'refused': {}}


def test_a_listing_of_50_entries_stops_the_lab(tmp_path):
    # the keyless listing may stop at 50: a set cut short would change every score with nothing saying so
    tree = {f'img{k:02d}__{k:08x}/gt_jane@acme.example.json': doc('2026-11-05T10:00:00Z', [MISSING], sha=f'{k:064x}') for k in range(50)}
    try:
        ground_truth.collect(Curated({'ROOT': under('GT curated', tree)}), 'ROOT', dirpath=str(tmp_path))
    except ground_truth.ListingFull as e:
        assert '50' in str(e)
    else:
        raise AssertionError('50 entries did not stop the lab')
    one_less = dict(sorted(tree.items())[:49])
    assert len(ground_truth.collect(Curated({'ROOT': under('GT curated', one_less)}), 'ROOT', dirpath=str(tmp_path))['files']) == 49


def test_the_dataset_sha_names_the_images_and_their_ground_truth():
    a = [dict(image_sha256='a' * 64, gt_sha256='1' * 64), dict(image_sha256='b' * 64, gt_sha256='2' * 64)]
    expect = hashlib.sha256(f"{'a' * 64} {'1' * 64}\n{'b' * 64} {'2' * 64}".encode()).hexdigest()
    assert ground_truth.dataset_sha(a) == ground_truth.dataset_sha(a[::-1]) == expect
    # another ground-truth file on the same image is another data set
    assert ground_truth.dataset_sha([a[0], dict(a[1], gt_sha256='3' * 64)]) != expect


def main():
    test_a_page_file_scores_like_a_lab_file()
    test_only_measurements_a_person_checked_are_scored()
    test_a_missing_mark_is_a_real_nor_found_within_its_radius()
    test_a_newer_submission_wins_at_the_same_spot()
    test_only_drive_images_with_marks_are_accepted()
    test_the_dataset_sha_names_the_images_and_their_ground_truth()
    print('ok')


if __name__ == '__main__':
    main()
