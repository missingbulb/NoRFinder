"""R8, R10 — ground truth saved from the page scores the finders in the lab, and submitted ground truth
joins the data set by code.

Run: python3 tests/test_ground_truth.py
"""
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


def test_the_intake_adds_each_attached_submission_once(tmp_path):
    files = {'https://github.com/user-attachments/files/1/acme_ground_truth.json': json.dumps(submission([MISSING])),
             'https://github.com/user-attachments/files/2/local.json': json.dumps(submission([MISSING], source='local'))}
    issues = [
        {'number': 7, 'body': 'acme\n[acme_ground_truth.json](https://github.com/user-attachments/files/1/acme_ground_truth.json)'},
        {'number': 8, 'body': 'forgot it', 'comments': ['here [f](https://github.com/user-attachments/files/2/local.json)']},
        {'number': 9, 'body': 'nothing attached'},
    ]
    ds = str(tmp_path / 'dataset.json')
    res = ground_truth.ingest(issues, get=files.__getitem__, dataset=ds, dirpath=str(tmp_path), today='2026-10-03')
    assert res['added'] == [7] and set(res['refused']) == {8, 9}
    saved = json.load(open(tmp_path / 'issue-7.json'))
    assert saved['submission'] == {'issue': 7, 'added': '2026-10-03'}
    img = ground_truth.images(ds)[SHA]
    assert img['drive_id'] == 'D1' and [e['issue'] for e in img['files']] == [7]
    assert ground_truth.ingest(issues, get=files.__getitem__, dataset=ds, dirpath=str(tmp_path))['added'] == []


def test_the_newest_attachment_is_the_submission():
    issue = {'body': '[a](https://github.com/user-attachments/files/1/a.json)',
             'comments': ['fixed: [b](https://github.com/missingbulb/NoRFinder/files/2/b.json)']}
    assert ground_truth.attachment(issue).endswith('/2/b.json')


def test_the_page_and_the_intake_use_one_label():
    # the page opens the issue with its label and the intake task looks for it: two languages, one value
    import re
    root = os.path.join(HERE, '..')
    page = re.search(r'GT_LABEL = "([^"]+)"', open(os.path.join(root, 'web', 'app.js')).read()).group(1)
    task = re.search(r"LABEL = '([^']+)'", open(os.path.join(
        root, '.claudinite', 'local', 'packs', 'nor-finder', 'tasks', 'ground-truth-intake', 'label.mjs')).read()).group(1)
    assert page == task == 'new-ground-truth'


def main():
    test_a_page_file_scores_like_a_lab_file()
    test_only_measurements_a_person_checked_are_scored()
    test_a_missing_mark_is_a_real_nor_found_within_its_radius()
    test_a_newer_submission_wins_at_the_same_spot()
    test_only_drive_images_with_marks_are_accepted()
    test_the_newest_attachment_is_the_submission()
    print('ok')


if __name__ == '__main__':
    main()
