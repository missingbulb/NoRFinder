"""The Bookshelf Reader's finder and readers scored against a submitted ground truth (`<photo>_books_gt.json`, or the
`gt_<tagger>.json` the shell saves in the study's GT folder).

The books are the ones the tagger marked right. A found box is that book when their quadrilaterals overlap by IoU more
than 0.5 (a box over two like books, 0.5 with each, is neither), each matched once, best overlap first. A reading is scored against the tagger's text, letters and digits
only: CER is the edit distance over the text's length (at most 1), words the share of its words of two letters or
more that the reading holds.

    python3 studies/shelves/lab/grade.py GT.json --photo PHOTO          # the finder, run here on the photo
    python3 studies/shelves/lab/grade.py GT.json --found FOUND.json     # boxes found elsewhere: {books: [{corners}]}
    python3 studies/shelves/lab/grade.py GT.json --read READ.json       # read.mjs PHOTO GT.json READER READ.json
"""
import argparse
import json
import os
import re
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'py'))
from books import iou


def truth(gt):
    return [b for b in gt['books'] if b['verdict'] == 'right']


def boxes(gt, found):
    """{precision, recall, matched, truth, found, mean_iou, missed: [index into the right books]}."""
    right = truth(gt)
    tm, fm = [b['corners'] for b in right], [f['corners'] for f in found]
    pairs = sorted(((iou(t, f), i, j) for i, t in enumerate(tm) for j, f in enumerate(fm)), reverse=True)
    done_t, done_f, match = set(), set(), {}
    for v, i, j in pairs:
        if v <= 0.5:
            break
        if i not in done_t and j not in done_f:
            done_t.add(i), done_f.add(j)
            match[i] = v
    n = len(match)
    return dict(precision=n / max(1, len(found)), recall=n / max(1, len(right)), matched=n, truth=len(right), found=len(found),
                mean_iou=float(np.mean(list(match.values()))) if match else None, missed=[i for i in range(len(right)) if i not in match])


def letters(t):
    return re.sub(r'[^0-9a-zא-ת]', '', t.lower())


def words(t):
    return [w for w in re.sub(r'[^0-9a-zא-ת ]', ' ', t.lower()).split() if len(w) >= 2]


def edits(a, b):
    row = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        nxt = [i]
        for j, y in enumerate(b, 1):
            nxt.append(min(row[j] + 1, nxt[j - 1] + 1, row[j - 1] + (x != y)))
        row = nxt
    return row[-1]


def text(said, meant):
    """(CER, word recall) of one reading against the tagger's text."""
    t = letters(meant)
    cer = min(1.0, edits(letters(said), t) / max(1, len(t)))
    want, got = words(meant), set(words(said))
    return cer, (sum(w in got for w in want) / len(want) if want else None)


def readings(gt, read):
    """{cer, words, books}: the means over the right books with a text, each read on its own corners: the reading
    carrying them, or with none carried, the right books' readings in their order."""
    if all('corners' in r for r in read['books']):
        said = {json.dumps(r['corners']): r['text'] for r in read['books']}
        pairs = [(said[json.dumps(b['corners'])], b['text']) for b in truth(gt) if b['text']]
    else:
        pairs = [(r['text'], b['text']) for b, r in zip(truth(gt), read['books']) if b['text']]
    scores = [text(s, m) for s, m in pairs]
    ws = [w for _, w in scores if w is not None]
    return dict(cer=float(np.mean([c for c, _ in scores])) if scores else None, words=float(np.mean(ws)) if ws else None, books=len(scores))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('gt')
    how = ap.add_mutually_exclusive_group(required=True)
    how.add_argument('--photo')
    how.add_argument('--found')
    how.add_argument('--read')
    a = ap.parse_args(argv)
    gt = json.load(open(a.gt))
    if a.read:
        out = readings(gt, json.load(open(a.read)))
    else:
        if a.photo:
            import shelves
            found = json.loads(shelves.Session(a.photo).call('find', {})[0])['books']
        else:
            found = json.load(open(a.found))['books']
        out = boxes(gt, found)
    print(json.dumps(out))


if __name__ == '__main__':
    main()
