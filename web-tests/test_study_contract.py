"""req/shell/study/knows-none, req/shell/study/folder-and-address: the shell knows no study, and a study is a folder whose study.json names everything the
shell needs. The shell running a study is test_study_runs.py."""
import glob
import json
import os
import re
from html.parser import HTMLParser

import pytest
from PIL import Image

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
    for key in ('id', 'title', 'visibility', 'viewer', 'python', 'web', 'files', 'channels'):
        assert key in m, f'{key} missing'
    assert 'listed' not in m, 'a study says who sees it in visibility (req/shell/study/visibility)'
    v = m['visibility']
    assert v in ('listed', 'unlisted') or (isinstance(v, dict) and set(v) == {'accounts'} and v['accounts']
            and all(re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', e) for e in v['accounts'])), \
        f'visibility is "listed", "unlisted" or {{"accounts": [email, …]}}: {v!r}'
    assert os.path.exists(os.path.join(WEB, {'image2d': 'viewer2d.js', 'image3d': 'viewer3d.js'}[m['viewer']]))
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
        # coloured by depth in 3D from the start: true (a palette no other channel has) or a palette's name
        assert c.get('depth') is None or c['depth'] is True or (isinstance(c['depth'], str) and c['depth']), c
        black, white = c.get('black', 0), c.get('white', 255)
        assert 0 <= black < white <= 255, c
    # req/shell/data/roles: its Drive root, a folder link, and nothing under it or about who holds a role
    assert 'drive' not in m['files'] and 'folders' not in m['files'], 'a study names its Drive root alone, in root'
    assert 'permissions' not in m, "who holds a role is Drive's sharing of the study's folders"
    if 'root' in m:
        assert re.search(r'/folders/[\w-]{10,}', m['root']), m['root']
    # req/shell/load/from: where it opens images from, which the shell has no default for
    places = m['files'].get('from')
    assert isinstance(places, list) and places and set(places) <= {'local', 'drive'}, 'files.from lists where the study opens images from: local, drive or both'
    if 'driveThumbs' in m:
        assert os.path.isdir(os.path.join(base, m['driveThumbs']))
    # req/shell/site/icons: its own tab icon, link-preview poster and description, published with its page part;
    # required of every study a person can open
    if v != 'unlisted':
        for key in ('icon', 'poster', 'description'):
            assert key in m, f'a study a person can open names its own {key}'
    if 'icon' in m:
        assert m['icon'].startswith('web/') and m['icon'].endswith('.svg') and os.path.isfile(os.path.join(base, m['icon'])), m['icon']
    if 'poster' in m:
        assert m['poster'].startswith('web/') and m['poster'].endswith('.jpg'), m['poster']
        im = Image.open(os.path.join(base, m['poster']))
        assert (im.format, im.size) == ('JPEG', (1200, 630)), m['poster']
    if 'description' in m:
        d = m['description']
        assert isinstance(d, str) and d.strip() == d and '\n' not in d and 0 < len(d) <= 160, d


@pytest.mark.parametrize('path', STUDIES, ids=lambda p: os.path.basename(os.path.dirname(p)))
def test_a_study_names_its_stage_and_steps(path):
    """req/shell/study/stage, req/shell/status-bar/breadcrumbs: the stage and the study's own steps are stated, never assumed."""
    m = manifest(path)
    assert 'stage' in m and m['stage'] in ('PreGT', 'GT', 'PostGT', 'Published', None), 'stage: PreGT, GT, PostGT, Published, or null for a tool making no ground truth'
    if m['stage'] in ('GT', 'PostGT'):
        gt = m.get('groundTruth', {})
        # req/shell/ground-truth/folders: its ground-truth folders are under its root, named there, not here
        assert 'root' in m, 'a study that makes ground truth names its Drive root'
        assert not {'submissions', 'curated', 'label'} & gt.keys(), "the root's settings file names the ground-truth folders"
    assert isinstance(m.get('phases'), list), 'phases: the study\'s own steps, [] for none'
    keys = [p['key'] for p in m['phases']]
    assert len(set(keys)) == len(keys) and not {'load', 'submit'} & set(keys), 'a step\'s key is its own, and not one of the shell\'s'
    assert all(p.get('name') for p in m['phases'])


class Panels(HTMLParser):
    """A study's panels: each template's slot, and each box (a section of class box) a template holds."""
    def __init__(self, html):
        super().__init__(); self.slot, self.slots, self.boxes = None, [], []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'template':
            self.slot = a.get('data-slot'); self.slots.append(self.slot)
        elif tag == 'section' and 'box' in (a.get('class') or '').split():
            self.boxes.append((self.slot, a.get('id')))


# the slots inside the shell's own left-bar boxes, and the slots elsewhere on the page
BOX_SLOTS = {'processing', 'summary', 'tasks'}
PAGE_SLOTS = {'toolbar', 'toolbar-end', 'view-top', 'views', 'over-image', 'body'}


def test_the_left_bar_is_the_shells_and_a_study_fills_its_boxes():
    """req/shell/left-bar/shells: the shell lays out the left bar, its boxes Image, Processing, Ground Truth Tasks and
    Summary; a study adds no box anywhere, only its part inside the shell's boxes and the page's other slots."""
    page = open(os.path.join(WEB, 'index.html'), encoding='utf8').read()
    left = page[page.index('<aside id="left">'):page.index('</aside>', page.index('<aside id="left">'))]
    for bid, slot in (('processing-box', 'processing'), ('tasks-box', 'tasks'), ('summary-box', 'summary')):
        m = re.search(rf'<section class="box foldable[^"]*" id="{bid}"[^>]*>(.*?)</section>', left, re.S)
        assert m, f'the shell\'s left bar has no {bid}'
        assert f'data-slot-for="{slot}"' in m.group(1), f'{bid} holds the study\'s {slot} slot'
    assert 'data-slot-for="left"' not in page, 'the left bar has no slot of its own for a study\'s boxes'
    seen = 0
    for path in STUDIES:
        m = manifest(path)
        if 'panels' not in m['web']:
            continue
        p = Panels(open(os.path.join(os.path.dirname(path), m['web']['panels']), encoding='utf8').read())
        seen += len(p.slots)
        assert set(p.slots) <= BOX_SLOTS | PAGE_SLOTS, f"{m['id']} fills slots the shell has not: {set(p.slots) - BOX_SLOTS - PAGE_SLOTS}"
        assert not p.boxes, f"{m['id']} adds boxes of its own: {p.boxes}"
    assert seen >= 10, f'read only {seen} templates: the sweep is not finding them all'


def test_the_shell_lists_the_ground_truth_tasks_and_their_submit():
    """req/shell/ground-truth/tasks, req/shell/views/second: a study draws no task rows, progress bar or Submit Ground
    Truth of its own, names no submit button, marks no item view as only viewing, and never turns the item view's
    switch on or off; the shell has no Tasks view."""
    page = open(os.path.join(WEB, 'index.html'), encoding='utf8').read()
    assert 'id="tasks-bar"' not in page and 'tasks-end' not in page, 'the Tasks view is retired: no bar, no slot for it'
    seen = 0
    for path in STUDIES:
        m, base = manifest(path), os.path.dirname(path)
        assert 'button' not in (m.get('groundTruth') or {}), f"{m['id']}: Submit Ground Truth is the shell's"
        if 'panels' in m['web']:
            html = open(os.path.join(base, m['web']['panels']), encoding='utf8').read()
            seen += 1
            for what in ('id="gt-tasks"', 'id="gt-bar"', 'data-viewing'):
                assert what not in html, f"{m['id']} draws {what}: the shell lists the tasks"
            assert not re.search(r'>[^<]*Submit ground truth', html, re.I), f"{m['id']} has a Submit Ground Truth of its own"
        for js in glob.glob(os.path.join(base, 'web', '*.js')):
            assert not re.search(r'["\']#switch["\']', open(js, encoding='utf8').read()), f'{js}: the shell turns its switch on and off'
    assert seen >= 4


def test_the_shell_names_no_study():
    shell = glob.glob(os.path.join(WEB, '*.*')) + glob.glob(os.path.join(ROOT, 'dev', 'tools', 'build', '*.py'))
    found, files = [], [f for f in sorted(shell) if f.endswith(('.js', '.html', '.css', '.py'))]
    assert len(files) >= 10, f'read only {len(files)} of the shell\'s files: the sweep is not looking at them all'
    for f in files:
        for n, line in enumerate(open(f, encoding='utf8'), 1):
            found += [f'{os.path.basename(f)}:{n} {w}' for w in STUDY_WORDS.findall(line)]
    assert not found, 'the shell names a study\'s own words:\n' + '\n'.join(found)


def test_the_header_offers_the_studies_each_visitor_may_see_by_title(tmp_path):
    """req/shell/study/visibility: the build's list holds the listed studies and those shown to named accounts, with
    their accounts for the page to check; an unlisted one is left out."""
    import sys
    sys.path.insert(0, os.path.join(ROOT, 'dev', 'tools', 'build'))
    import build
    for sid, title, visibility in (('zeta', 'Zeta Counter', 'listed'), ('alpha', 'Alpha Viewer', 'listed'), ('test-only', 'A Fixture', 'unlisted'),
                                   ('mine', 'My Own', {'accounts': ['me@example.com']})):
        os.makedirs(tmp_path / 'studies' / sid)
        icon = dict(icon='web/icon.svg') if sid == 'zeta' else {}
        (tmp_path / 'studies' / sid / 'study.json').write_text(json.dumps(dict(id=sid, title=title, visibility=visibility, **icon)))
    assert build.studies(str(tmp_path)) == [{'id': 'alpha', 'title': 'Alpha Viewer'}, {'id': 'mine', 'title': 'My Own', 'accounts': ['me@example.com']},
                                            {'id': 'zeta', 'title': 'Zeta Counter', 'icon': 'web/icon.svg'}]


def test_the_build_vendors_every_studys_wheels():
    import sys
    sys.path.insert(0, os.path.join(ROOT, 'dev', 'tools', 'build'))
    import build
    assert set(build.wheels()) >= {w for p in STUDIES for w in manifest(p)['python']['wheels']}
