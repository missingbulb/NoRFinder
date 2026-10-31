"""1.1, 1.2: the shell knows no study, and a study is a folder whose study.json names everything the
shell needs. The shell running a study is test_study_runs.py."""
import glob
import json
import os
import re
from html.parser import HTMLParser

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
WEB = os.path.join(ROOT, 'web')
STUDIES = sorted(glob.glob(os.path.join(ROOT, 'studies', '*', 'study.json')))
# the NoR study's own words: none of them may appear in the shell
STUDY_WORDS = re.compile(r'(?-i:\bNoRs?\b|\bNav\b)|Ranvier|Caspr|Nav1|DAPI|\bfinders?\b|\bcandidates?\b|paranode', re.I)


def manifest(path):
    return json.load(open(path))


def test_there_are_studies_and_the_default_is_one():
    ids = [manifest(p)['id'] for p in STUDIES]
    assert {'viewer', 'nor', 'fixture'} <= set(ids), ids
    assert all(os.path.basename(os.path.dirname(p)) == manifest(p)['id'] for p in STUDIES), 'a study\'s id is its folder'


@pytest.mark.parametrize('path', STUDIES, ids=lambda p: os.path.basename(os.path.dirname(p)))
def test_a_study_names_files_that_exist(path):
    m, base = manifest(path), os.path.dirname(path)
    for key in ('id', 'title', 'listed', 'viewer', 'python', 'web', 'files', 'channels'):
        assert key in m, f'{key} missing'
    assert isinstance(m['listed'], bool), 'listed says whether the header offers the study: true or false'
    assert os.path.exists(os.path.join(WEB, {'image2d': 'viewer2d.js'}[m['viewer']]))
    assert 'module' in m['web']
    for key in ('module', 'panels', 'style'):
        if key in m['web']:
            assert os.path.isfile(os.path.join(base, m['web'][key])), m['web'][key]
    py = m['python']
    assert any(os.path.isfile(os.path.join(base, d, py['entry'] + '.py')) for d in py['paths']), py
    for c in m['channels']:
        # what the viewer can draw (web/channels.js): a name, a #rrggbb colour, shown or not, a description short
        # enough for its (?), and black and white points on the 8-bit planes
        assert isinstance(c.get('name'), str) and c['name'], c
        assert re.fullmatch(r'#[0-9a-fA-F]{6}', c.get('colour', '')), c
        assert isinstance(c.get('shown'), bool), c
        assert len(c.get('about', '').split()) <= 100, f"{c['name']}: about runs past 100 words"
        black, white = c.get('black', 0), c.get('white', 255)
        assert 0 <= black < white <= 255, c
    if 'driveThumbs' in m:
        assert os.path.isdir(os.path.join(base, m['driveThumbs']))


@pytest.mark.parametrize('path', STUDIES, ids=lambda p: os.path.basename(os.path.dirname(p)))
def test_a_study_names_its_stage_and_steps(path):
    """1.32, 1.33: the stage and the study's own steps are stated, never assumed."""
    m = manifest(path)
    assert m.get('stage') in ('PreGT', 'GT', 'PostGT'), 'stage: PreGT, GT or PostGT'
    if m['stage'] != 'PreGT':
        assert m.get('groundTruth', {}).keys() >= {'label', 'button'}, 'a study that makes ground truth names its label and button'
    assert isinstance(m.get('phases'), list), 'phases: the study\'s own steps, [] for none'
    keys = [p['key'] for p in m['phases']]
    assert len(set(keys)) == len(keys) and not {'load', 'submit'} & set(keys), 'a step\'s key is its own, and not one of the shell\'s'
    assert all(p.get('name') for p in m['phases'])


class Boxes(HTMLParser):
    """Each foldable box in an HTML file: (the slot its template fills, id, its title, data-opens, data-folds)."""
    def __init__(self, html):
        super().__init__(); self.slot, self.boxes, self.title = None, [], False
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'template':
            self.slot = a.get('data-slot')
        elif tag == 'section' and 'foldable' in (a.get('class') or '').split():
            self.boxes.append([self.slot, a.get('id'), '', a.get('data-opens'), a.get('data-folds')])
        elif tag == 'h2' and self.boxes and not self.boxes[-1][2]:
            self.title = True

    def handle_endtag(self, tag):
        if tag == 'h2':
            self.title = False

    def handle_data(self, data):
        if self.title:
            self.boxes[-1][2] += data.strip()


def test_every_studys_boxes_name_the_steps_that_open_and_fold_them():
    """1.41: every foldable box of a study says when it opens (a step, or user: only its title), never left to a default."""
    seen = 0
    for path in STUDIES:
        m = manifest(path)
        if 'panels' not in m['web']:
            continue
        steps = {'load', 'submit'} | {p['key'] for p in m['phases']}
        for slot, bid, title, opens, folds in Boxes(open(os.path.join(os.path.dirname(path), m['web']['panels']), encoding='utf8').read()).boxes:
            seen += 1
            assert opens in steps | {'user'}, f'{title}: data-opens names a step or user, not {opens!r}'
            assert folds is None or folds in steps, f'{title}: data-folds names a step, not {folds!r}'
    assert seen >= 7, f'read only {seen} foldable boxes: the sweep is not finding them all'


def test_the_shell_names_no_study():
    shell = glob.glob(os.path.join(WEB, '*.*')) + glob.glob(os.path.join(ROOT, 'dev', 'tools', 'build', '*.py'))
    found, files = [], [f for f in sorted(shell) if f.endswith(('.js', '.html', '.css', '.py'))]
    assert len(files) >= 10, f'read only {len(files)} of the shell\'s files: the sweep is not looking at them all'
    for f in files:
        for n, line in enumerate(open(f, encoding='utf8'), 1):
            found += [f'{os.path.basename(f)}:{n} {w}' for w in STUDY_WORDS.findall(line)]
    assert not found, 'the shell names a study\'s own words:\n' + '\n'.join(found)


def test_the_header_offers_the_listed_studies_by_title(tmp_path):
    import sys
    sys.path.insert(0, os.path.join(ROOT, 'dev', 'tools', 'build'))
    import build
    for sid, title, listed in (('zeta', 'Zeta Counter', True), ('alpha', 'Alpha Viewer', True), ('test-only', 'A Fixture', False)):
        os.makedirs(tmp_path / 'studies' / sid)
        (tmp_path / 'studies' / sid / 'study.json').write_text(json.dumps(dict(id=sid, title=title, listed=listed)))
    assert build.studies(str(tmp_path)) == [{'id': 'alpha', 'title': 'Alpha Viewer'}, {'id': 'zeta', 'title': 'Zeta Counter'}]


def test_the_build_vendors_every_studys_wheels():
    import sys
    sys.path.insert(0, os.path.join(ROOT, 'dev', 'tools', 'build'))
    import build
    assert set(build.wheels()) >= {w for p in STUDIES for w in manifest(p)['python']['wheels']}
