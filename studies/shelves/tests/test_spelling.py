"""req/shelves/read/readers (2026-11-10): the dictionary sets a reading's Hebrew words right, by one letter print
makes look alike, the most frequent such word first, and leaves every other word as read."""
import json
import os
import shutil
import subprocess

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
READING_JS = os.path.join(HERE, '..', 'web', 'reading.js')
WORDS = os.path.join(HERE, '..', 'web', 'words', 'heb.txt')


def spell(words, texts):
    node = shutil.which('node')
    if not node:
        pytest.skip('node missing')
    script = (f'import {{ spelling }} from {json.dumps("file://" + os.path.abspath(READING_JS))};'
              f'const s = spelling({json.dumps(words)});'
              f'console.log(JSON.stringify({json.dumps(texts)}.map(s)));')
    out = subprocess.run([node, '--input-type=module', '-e', script], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


LIST = '# a header line\nהחתול\nרוברט\nהעובר\nכוכבים\nנוכבים\nדרך\nקירות\nהיינליין\n'


def test_a_word_one_look_alike_letter_off_becomes_the_dictionary_s():
    # כ read for ב; and of two listed words a look-alike letter away, the more frequent (the earlier)
    assert spell(LIST, ['רוכרט', 'בוכבים']) == ['רוברט', 'כוכבים']


def test_known_words_prefixed_words_short_words_and_latin_stay_as_read():
    # listed; listed once ו or ש is off; two letters; Latin letters; and a word with no listed neighbour
    texts = ['רוברט / החתול', 'והחתול שהעובר', 'רכ', 'Dune', 'היינליין']
    assert spell(LIST, texts) == texts


def test_the_site_s_list_is_hebrew_words_in_frequency_order():
    lines = [l for l in open(WORDS, encoding='utf8').read().split('\n') if l and not l.startswith('#')]
    assert len(lines) > 40000 and lines[:3] == ['לא', 'את', 'אני']
    assert all(set(w) <= set('אבגדהוזחטיכךלמםנןסעפףצץקרשת') for w in lines)


def test_a_final_letter_inside_a_run_ends_a_word():
    # ך is written only at a word's end: the space after it was missed
    assert spell(LIST, ['דרךקירות', 'רוברט']) == ['דרך קירות', 'רוברט']


def test_full_and_defective_spellings_are_one_word():
    # one י fewer, and one ו more, than the listed spelling
    assert spell(LIST, ['היינלין', 'החתוול']) == ['היינליין', 'החתול']
