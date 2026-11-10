"""The lab's grader (studies/shelves/lab/grade.py): a found box is a book of the ground truth when they overlap by IoU
more than 0.5, each matched once; a reading's CER and word recall are against the tagger's text."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lab'))
import grade

RECT = lambda x0, y0, x1, y1: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
GT = dict(W=400, H=300, books=[
    dict(verdict='right', corners=RECT(20, 20, 60, 280), text='Two Towers'),
    dict(verdict='right', corners=RECT(60, 20, 100, 280), text='מעוף הדרקון'),
    dict(verdict='wrong', corners=RECT(200, 20, 240, 280), text=''),
])


def test_a_box_on_its_book_matches_and_one_beside_it_does_not():
    on = dict(corners=RECT(22, 22, 60, 280))
    # half over the book, half beside it: IoU 1/3
    beside = dict(corners=RECT(80, 20, 120, 280))
    # the book marked wrong is no book to find
    r = grade.boxes(GT, [on, beside, dict(corners=RECT(200, 20, 240, 280))])
    assert (r['matched'], r['truth'], r['found'], r['missed']) == (1, 2, 3, [1])
    assert abs(r['precision'] - 1 / 3) < 1e-9 and r['recall'] == 0.5


def test_one_box_over_two_books_is_neither():
    # IoU exactly 0.5 with each
    r = grade.boxes(GT, [dict(corners=RECT(20, 20, 100, 280))])
    assert r['matched'] == 0 and r['mean_iou'] is None


def test_a_reading_scores_letters_and_whole_words():
    # one letter of nine wrong, punctuation and spacing ignored; one word of two whole
    cer, words = grade.text('two-tovers', 'Two Towers')
    assert abs(cer - 1 / 9) < 1e-9 and words == 0.5
    assert grade.text('', 'מעוף הדרקון') == (1.0, 0.0)
    r = grade.readings(GT, dict(books=[dict(text='Two Towers'), dict(text='מעוף הדרקון')]))
    assert (r['cer'], r['words'], r['books']) == (0.0, 1.0, 2)


def test_a_reading_of_the_whole_file_is_paired_with_each_book_by_its_corners():
    """read.mjs reads every box of a ground-truth file, the ones marked no book too: each reading is the book's whose
    corners it was read on, whatever the order."""
    wrong, towers, dragon = GT['books'][2], GT['books'][0], GT['books'][1]
    read = dict(books=[dict(corners=wrong['corners'], text='junk'), dict(corners=dragon['corners'], text='מעוף הדרקון'),
                       dict(corners=towers['corners'], text='Two Towers')])
    r = grade.readings(GT, read)
    assert (r['cer'], r['words'], r['books']) == (0.0, 1.0, 2)
