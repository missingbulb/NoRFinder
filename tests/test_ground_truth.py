"""R8 — ground truth saved from the page scores the finders in the lab.

Run: python3 tests/test_ground_truth.py
"""
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'detection'))
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


def main():
    test_a_page_file_scores_like_a_lab_file()
    test_only_measurements_a_person_checked_are_scored()
    print('ok')


if __name__ == '__main__':
    main()
