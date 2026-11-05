"""req/shelves/read/readers: the sandbox's readers (reading/read.mjs, the page's own reading.js on the page's own engine
builds) read a Hebrew spine and an English one, each set upright from its side. The labels are drawn, so this proves the
engines run and turn the text, not how well they read real spines; ground truth scores that."""
import json
import os
import shutil
import subprocess

import pytest
from PIL import Image, ImageDraw, ImageFont

pytestmark = pytest.mark.full

HERE = os.path.dirname(os.path.abspath(__file__))
READING = os.path.join(HERE, '..', 'reading')
NODE, NPM = shutil.which('node'), shutil.which('npm')
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


@pytest.fixture(scope='module')
def engines():
    if not (NODE and NPM):
        pytest.skip('node or npm missing')
    if not os.path.isdir(os.path.join(READING, 'node_modules')):
        subprocess.run([NPM, 'ci', '--prefix', READING, '--ignore-scripts'], check=True, capture_output=True, timeout=300)


@pytest.fixture(scope='module')
def spines(tmp_path_factory):
    """Two spines, each a title drawn across a label and stood on its side as a spine stands: (photo, books.json)."""
    try:
        font = ImageFont.truetype(FONT, 40)
    except OSError:
        pytest.skip('no font with Hebrew letters to draw the labels with')
    d = tmp_path_factory.mktemp('spines')
    photo = Image.new('RGB', (200, 620), (230, 220, 200))
    for i, (text, turn) in enumerate((('הארי פוטר', 90), ('THE HOBBIT', 270))):
        label = Image.new('RGB', (560, 80), (110, 30, 30))
        ImageDraw.Draw(label).text((24, 14), text, font=font, fill=(245, 230, 180))
        photo.paste(label.rotate(turn, expand=True), (10 + i * 100, 20))
    photo.save(d / 'spines.png')
    boxes = [dict(corners=[[10 + i * 100, 20], [90 + i * 100, 20], [90 + i * 100, 580], [10 + i * 100, 580]], view='spine') for i in range(2)]
    (d / 'books.json').write_text(json.dumps(dict(books=boxes)))
    return str(d / 'spines.png'), str(d / 'books.json')


def read(spines, how, tmp_path):
    out = tmp_path / f'{how}.json'
    r = subprocess.run([NODE, os.path.join(READING, 'read.mjs'), *spines, how, str(out)], capture_output=True, text=True, timeout=300)
    assert r.returncode == 0, r.stdout + r.stderr
    return [b['text'] for b in json.loads(out.read_text())['books']]


@pytest.mark.parametrize('how', ['tesseract', 'lines'])
def test_tesseract_reads_hebrew_and_english_spines(engines, spines, how, tmp_path):
    hebrew, english = read(spines, how, tmp_path)
    assert hebrew.replace(' ', '') == 'הארי פוטר'.replace(' ', '') and english == 'THE HOBBIT', (hebrew, english)


def test_ppocr_reads_english_alone(engines, spines, tmp_path):
    hebrew, english = read(spines, 'ppocr', tmp_path)
    assert english.replace(' ', '') == 'THEHOBBIT', english
    assert not any('֐' <= c <= '׿' for c in hebrew), 'PP-OCR has no Hebrew letters to read with'
