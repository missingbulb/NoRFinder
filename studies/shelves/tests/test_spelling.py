"""req/shelves/read/readers (2026-11-10): the dictionary sets a reading's Hebrew words right, by one letter print
makes look alike, the most frequent such word first, and leaves every other word as read."""
import json
import os
import shutil
import subprocess

import pytest

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
READING_JS = os.path.join(HERE, '..', 'web', 'reading.js')
NAMES = os.path.join(HERE, '..', 'web', 'words', 'names.txt')


def spell(words, texts):
    node = shutil.which('node')
    if not node:
        pytest.skip('node missing')
    script = (f'import {{ spelling }} from {json.dumps("file://" + os.path.abspath(READING_JS))};'
              f'const s = spelling({json.dumps(words)});'
              f'console.log(JSON.stringify({json.dumps(texts)}.map(s)));')
    out = subprocess.run([node, '--input-type=module', '-e', script], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


LIST = '# a header line\nהחתול\nרוברט\nהעובר\nכוכבים\nנוכבים\nדרך\nקירות\nהיינליין\nהאיש\nבמבוך\nקריספין\n'


def test_a_word_one_look_alike_letter_off_becomes_the_dictionary_s():
    # כ read for ב; and of two listed words a look-alike letter away, the more frequent (the earlier)
    assert spell(LIST, ['רוכרט', 'בוכבים']) == ['רוברט', 'כוכבים']


def test_known_words_prefixed_words_short_words_and_latin_stay_as_read():
    # listed; listed once ו or ש is off; two letters; Latin letters; and a word with no listed neighbour
    texts = ['רוברט / החתול', 'והחתול שהעובר', 'רכ', 'Dune', 'היינליין']
    assert spell(LIST, texts) == texts


def test_the_list_may_carry_counts_and_other_scripts():
    # the subtitle list's own lines, "word count", most frequent first; a word in other letters is no Hebrew word
    assert spell('רוברט 120\nhello 90\nרובר 80\n', ['רוכרט']) == ['רוברט']


def test_words_run_together_are_parted_into_listed_words():
    # no final letter shows the missed space; a listed name, and a run no listed words make, stay whole
    assert spell(LIST, ['האישבמבוך', 'קריספין', 'האישבמבו']) == ['האיש במבוך', 'קריספין', 'האישבמבו']


def test_the_site_s_names_list_holds_authors_and_publishers_in_hebrew():
    lines = [l for l in open(NAMES, encoding='utf8').read().split('\n') if l and not l.startswith('#')]
    assert len(lines) > 30000 and len(set(lines)) == len(lines)
    assert all(set(w) <= set('אבגדהוזחטיכךלמםנןסעפףצץקרשת') for w in lines)
    assert {'היינליין', 'מעריב', 'חולית', 'ברדבורי'} <= set(lines)


def test_a_final_letter_inside_a_run_ends_a_word():
    # ך is written only at a word's end: the space after it was missed
    assert spell(LIST, ['דרךקירות', 'רוברט']) == ['דרך קירות', 'רוברט']


def test_full_and_defective_spellings_are_one_word():
    # one י fewer, and one ו more, than the listed spelling
    assert spell(LIST, ['היינלין', 'החתוול']) == ['היינליין', 'החתול']


def test_the_page_keeps_offline_the_word_list_it_fetches():
    """WORDS.list in reading.js is the address the page fetches; study.json's web.offline keeps that same address
    with the study's Python, and lab/words.py reads it from there."""
    node = shutil.which('node')
    if not node:
        pytest.skip('node missing')
    script = f'import {{ WORDS }} from {json.dumps("file://" + os.path.abspath(READING_JS))}; console.log(WORDS.list);'
    fetched = subprocess.run([node, '--input-type=module', '-e', script], capture_output=True, text=True, check=True).stdout.strip()
    study = json.load(open(os.path.join(HERE, '..', 'study.json')))
    assert fetched in study['web']['offline']
