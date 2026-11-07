"""req/checks/shell-states: the shell's element tree and its rules (dev/requirements/shell-states.json) turn into the matrix
and the browser test's expectations as the requirement says; the generated files are up to date, every element the tree
names is on the page, and every element of the shell's page is in the tree."""
import copy
import importlib.util
import json
import os
import re
from html.parser import HTMLParser

import pytest

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
spec = importlib.util.spec_from_file_location('shell_states', os.path.join(ROOT, 'dev', 'tools', 'build', 'shell_states.py'))
shell_states = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shell_states)

# an invented page: a box holding a button, beside a panel
PAGE = {
    'study': 'acme',
    'vars': {'stage': ['GT'], 'signedIn': [True], 'role': ['viewer', 'tagger'], 'image': ['none', 'local'],
             'counted': [False, True], 'view': ['image'], 'selected': ['nothing']},
    'roots': {'acme': {'stage': 'GT', 'signedIn': True, 'role': 'viewer'}},
    'paths': [{'root': 'acme', 'actions': ['load', 'count', 'tagger']}],
    'tree': [
        {'name': 'Box', 'select': '#box', 'box': True, 'req': 'req/checks/shell-states',
         'rule': [{'when': {'image': ['none']}, 'is': 'folded'}, {'when': {'role': ['tagger']}, 'is': 'hidden'}],
         'children': [{'name': 'Button', 'select': '#button', 'control': True, 'req': 'req/checks/shell-states',
                       'rule': [{'when': {'counted': [False]}, 'is': 'disabled'}]}]},
        {'name': 'Panel', 'select': '#panel', 'req': 'req/checks/shell-states',
         'rule': [{'when': {'makesTruth': [True]}, 'is': 'shown', 'approval': 'tentative'},
                  {'when': {'counted': [True]}, 'is': 'hidden', 'approval': 'undecided'}]},
    ],
}


# the study the invented page's paths open, as its study.json and its states.json would say
ACME = {'study': {'title': 'Acme', 'files': {'from': ['drive']}, 'phases': [{'key': 'count'}]}}


def expected(rules, studies=None):
    expect, matrix, unused = shell_states.build(rules, studies or {'acme': ACME})
    return [[s['expect'] for s in p['states']] for p in expect['paths']][0], matrix, unused


def test_each_state_is_one_more_action_and_each_element_shows_as_its_rules_and_its_parents_say():
    states, matrix, gaps = expected(PAGE)
    assert 'cases no state reaches' not in gaps
    # no image: the box folded, the button inside it with it
    assert states[0]['Box'] == 'folded' and states[0]['Button'] == 'gone'
    # loaded: the box open, the button off until counted, then on
    assert (states[1]['Box'], states[1]['Button']) == ('on', 'off')
    assert (states[2]['Box'], states[2]['Button']) == ('on', 'on')
    # the tagger: the box hidden, and the button under it gone though its own case says on
    assert (states[3]['Box'], states[3]['Button']) == ('gone', 'gone')
    # an undecided case is not checked; a tentative one is, and the matrix marks it
    assert states[2]['Panel'] is None and states[3]['Panel'] == 'on'
    assert '| Panel | ● | ● | ? | ●* |' in matrix and '- Acme · acme: Load · Count · → Tagger, Count: Panel' in matrix


def test_a_case_no_state_reaches_is_reported():
    rules = copy.deepcopy(PAGE)
    rules['paths'][0]['actions'] = ['load']
    _, _, gaps = expected(rules)
    assert gaps['cases no state reaches'] == ['Box, case 2', 'Button, its default', 'Panel, case 1', 'Panel, case 2']


def test_a_case_decided_only_behind_a_hidden_or_folded_parent_is_reported_unless_marked_unwalked():
    """The browser reads such an element as gone whatever its case says, so the case checks nothing."""
    rules = copy.deepcopy(PAGE)
    # the button off only while the box is folded, before anything is loaded
    rules['tree'][0]['children'][0]['rule'] = [{'when': {'image': ['none']}, 'is': 'disabled'}]
    _, _, gaps = expected(rules)
    assert gaps['cases decided only where a parent hides the element, and not marked unwalked'] == ['Button, case 1']
    rules['tree'][0]['children'][0]['rule'][0]['unwalked'] = 'the box is folded until then'
    _, _, gaps = expected(rules)
    assert 'cases decided only where a parent hides the element, and not marked unwalked' not in gaps
    # what an element marked unwalked holds goes unwalked with it; a mark a state shows wrong is reported
    rules['tree'][0]['children'][0]['rule'][0].pop('unwalked')
    rules['tree'][0]['unwalked'] = 'never opened'
    _, _, gaps = expected(rules)
    assert 'cases decided only where a parent hides the element, and not marked unwalked' not in gaps
    assert gaps['cases marked unwalked that a state shows'] == ['Button, its default']


def test_an_element_every_state_shows_the_same_is_reported_unless_marked_steady():
    """A page that always shows it so passes whatever its rules say elsewhere."""
    _, _, gaps = expected(PAGE)
    assert gaps['elements every state shows the same, and not marked steady'] == ['Panel']
    rules = copy.deepcopy(PAGE)
    rules['tree'][1]['steady'] = 'always shown'
    _, _, gaps = expected(rules)
    assert 'elements every state shows the same, and not marked steady' not in gaps
    # and a steady mark on one that changes is reported too
    rules['tree'][0]['steady'] = 'always shown'
    _, _, gaps = expected(rules)
    assert gaps['elements marked steady that states show differently'] == ['Box']


def test_an_action_no_path_takes_and_a_value_no_state_has_are_reported():
    _, _, gaps = expected(PAGE)
    assert 'load' not in gaps['actions no path takes'] and 'stack' in gaps['actions no path takes']
    assert 'values of the vars no state has' not in gaps
    rules = copy.deepcopy(PAGE)
    rules['vars']['view'] = ['image', 'items']
    _, _, gaps = expected(rules)
    assert gaps['values of the vars no state has'] == ['view "items"']


def test_a_study_restates_a_shell_element_where_it_differs():
    studies = {'acme': {**ACME, 'differ': {'Panel': {'rule': [{'is': 'hidden'}], 'steady': 'never shown in this study'}}}}
    expect, _, gaps = shell_states.build(copy.deepcopy(PAGE), studies)
    assert {s['expect']['Panel'] for s in expect['paths'][0]['states']} == {'gone'}
    assert 'Panel' not in gaps.get('elements every state shows the same, and not marked steady', [])
    with pytest.raises(AssertionError, match='differs in its rule alone'):
        shell_states.build(copy.deepcopy(PAGE), {'acme': {**ACME, 'differ': {'Panel': {'select': '#other'}}}})


@pytest.mark.parametrize('break_it, says', [
    (lambda r: r['tree'][1].update(rule=[{'is': 'gone'}]), 'is not a state'),
    (lambda r: r['tree'][1].update(rule=[{'when': {'colour': ['red']}, 'is': 'hidden'}]), "no var 'colour'"),
    (lambda r: r['tree'][1].update(rule=[{'when': {'role': ['data']}, 'is': 'hidden'}]), 'is never'),
    (lambda r: r['tree'][1].update(rule=[{'is': 'hidden', 'approval': 'maybe'}]), 'Panel'),
    (lambda r: r['tree'][1].pop('req'), 'names no requirement'),
    (lambda r: r['tree'][1].update(name='Box'), 'two elements named'),
    (lambda r: r['paths'][0].update(root='elsewhere'), 'no root'),
    (lambda r: r['paths'][0]['actions'].append('dance'), 'an action unknown'),
])
def test_rules_the_generator_cannot_read_are_refused(break_it, says):
    rules = copy.deepcopy(PAGE)
    break_it(rules)
    with pytest.raises(AssertionError, match=re.escape(says)):
        shell_states.build(rules, {'acme': ACME})


def test_the_generated_files_are_up_to_date():
    assert shell_states.main(['--check']) == 0, 'run python3 dev/tools/build/shell_states.py'


class Ids(HTMLParser):
    """The ids of a page's body, and which of them sit in what a dialog, popup, menu, disclosure, template or icon
    holds: those show only once opened, and are not the state's. A study's panels are the templates of its slots,
    whose content the shell puts on the page: theirs are the state's."""
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}

    def __init__(self):
        super().__init__()
        self.stack, self.tags_open, self.state, self.opened, self.tags = [], [], [], [], set()

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.tags.add(tag)
        slot = tag == 'template' and 'data-slot' in a
        # what a disclosure holds beside its summary shows once it is opened
        disclosed = bool(self.tags_open) and self.tags_open[-1] == 'details' and tag != 'summary'
        inside = not slot and (tag in ('head', 'dialog', 'template', 'svg') or 'popover' in a
                               or 'pop' in (a.get('class') or '').split() or disclosed)
        if 'id' in a:
            (self.opened if inside or any(self.stack) else self.state).append(a['id'])
        if tag not in self.VOID:
            self.stack.append(inside)
            self.tags_open.append(tag)

    def handle_endtag(self, tag):
        if tag not in self.VOID and self.stack:
            self.stack.pop()
            self.tags_open.pop()


def page_ids(*files):
    p = Ids()
    for f in files:
        with open(os.path.join(ROOT, f), encoding='utf-8') as h:
            p.feed(h.read())
    return p


def tree():
    """The shell's own tree, no study grafted in."""
    return list(shell_states.nodes(shell_states.load()[0]['tree']))


def study_trees():
    """{id: [(element, parent, depth)]} for each study the paths walk, its elements grafted in."""
    rules, studies = shell_states.load()
    expect, _, _ = shell_states.build(rules, studies)
    return {i: [(e, next((x for x in els if x['name'] == e['parent']), None)) for e in els] for i, els in expect['elements'].items()}, studies


def lead(select):
    """The id a selector starts from, or the tag of one naming an element by its tag."""
    return re.match(r'#?([\w-]+)', select).group(1)


def test_every_element_the_tree_names_is_on_the_page():
    """By the id its selector starts from, on the shell's page or the panels of the study the tree is walked on; one
    the page makes as it runs, from the nearest it is in that the page does not make."""
    trees, studies = study_trees()
    made = {n['name'] for n, _, _ in shell_states.nodes(shell_states.load()[0]['tree']) if n.get('made')}
    made |= {n['name'] for st in studies.values() for g in st.get('grafts', []) for n, _, _ in shell_states.nodes(g['tree']) if n.get('made')}
    checked = 0
    for i, els in trees.items():
        panels = studies[i]['study']['web'].get('panels')
        p = page_ids('web/index.html', *([f'studies/{i}/{panels}'] if panels else []))
        ids = set(p.state) | set(p.opened) | p.tags
        up = dict((e['name'], parent) for e, parent in els)
        for e, parent in els:
            owner = e
            while owner['name'] in made:
                owner = up[owner['name']]
            assert lead(owner['select']) in ids, f"{i}: {e['name']}: no #{lead(owner['select'])} on the page"
            checked += 1
    assert len(trees) >= 5 and checked >= 5 * 100


def test_every_shell_element_is_in_the_tree():
    """An element the shell's page gains is given its place in the tree, and its rules, in the same change."""
    p = page_ids('web/index.html')
    held = {lead(n['select']) for n, _, _ in tree()}
    left = [i for i in p.state if i not in held]
    assert len(p.state) > 100
    assert not left, f'not in dev/requirements/shell-states.json: {left}'


def test_every_element_of_a_studys_panels_is_in_its_tree():
    """An element a study's panels gain is given its place in the tree, grafted from its states.json, in the same
    change."""
    trees, studies = study_trees()
    left, seen = {}, 0
    for i, els in trees.items():
        panels = studies[i]['study']['web'].get('panels')
        if not panels:
            continue
        p = page_ids(f'studies/{i}/{panels}')
        held = {lead(e['select']) for e, _ in els}
        seen += len(p.state)
        if [x for x in p.state if x not in held]:
            left[i] = [x for x in p.state if x not in held]
    assert seen > 80, f'{seen} ids in the studies\' panels: the sweep is not reading them'
    assert not left, f'not in the studies\' states.json: {left}'


class Tags(HTMLParser):
    """Each id's tag and classes."""
    def __init__(self):
        super().__init__()
        self.of = {}

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            self.of[a['id']] = (tag, (a.get('class') or '').split())


def test_the_tree_says_which_elements_are_boxes_and_controls_as_the_page_does():
    """The walk reads an element folded only if the tree calls it a box, and disabled only if a control: one the
    page makes a box or a control, and the tree does not, would read as shown whatever it is."""
    trees, studies = study_trees()
    wrong, checked = [], 0
    for i, els in trees.items():
        p = Tags()
        panels = studies[i]['study']['web'].get('panels')
        for f in ['web/index.html'] + ([f'studies/{i}/{panels}'] if panels else []):
            with open(os.path.join(ROOT, f), encoding='utf-8') as h:
                p.feed(h.read())
        for e, _ in els:
            m = re.fullmatch(r'#([\w-]+)', e['select'])
            if not m or m.group(1) not in p.of:
                continue
            tag, classes = p.of[m.group(1)]
            checked += 1
            if ('box' in classes) != e['box'] or (tag in ('button', 'input', 'select', 'textarea')) != e['control']:
                wrong.append(f"{i}: {e['name']}")
    assert checked > 400
    assert not wrong, f'box or control as the page does not say: {wrong}'


def test_the_shell_tree_holds_only_the_shells_page():
    """req/checks/spec-layout: what a study's own panels hold is given by that study, in its states.json."""
    with open(shell_states.RULES, encoding='utf-8') as f:
        own = list(shell_states.nodes(json.load(f)['tree']))
    p = page_ids('web/index.html')
    ids = set(p.state) | set(p.opened) | p.tags
    assert len(own) >= 80, f'the shell tree has {len(own)} elements: the sweep is not reading it'
    up = {n['name']: parent for n, parent, _ in own}

    def owner(n):
        while n.get('made'):
            n = up[n['name']]
        return n
    strays = [n['name'] for n, _, _ in own if lead(owner(n)['select']) not in ids]
    assert not strays, f'not the shell\'s, in dev/requirements/shell-states.json: {strays}'


@pytest.mark.parametrize('study, panels, says', [
    ({'files': {'from': ['local', 'drive']}, 'phases': []}, '', {'fromComputer': True, 'hasSteps': False, 'itemView': False}),
    ({'files': {'from': ['drive']}, 'phases': [{}]}, '<div id="items-view" hidden>', {'fromComputer': False, 'hasSteps': True, 'itemView': True}),
    ({'files': {'from': ['drive']}, 'phases': [{}]}, '<div id="items-view" data-shelved hidden>', {'itemView': False}),
    ({'files': {'from': ['drive']}, 'phases': [{}]}, '<div id="items-view-more" data-shelved></div><div id="items-view">', {'itemView': True}),
])
def test_what_a_study_says_of_itself_is_read_from_its_descriptor_and_panels(study, panels, says):
    got = shell_states.facts({'study': study, 'panels': panels})
    assert {k: got[k] for k in says} == says


def test_each_study_walks_the_shells_tree_with_its_own_grafts():
    """A study's paths open it, on the shell's tree with its elements alone grafted in; the shell's paths open the
    study it names."""
    studies = {'acme': ACME, 'other': {**ACME, 'study': {**ACME['study'], 'title': 'Other'},
               'grafts': [{'under': 'Box', 'tree': [{'name': 'Own', 'select': '#own', 'req': 'req/checks/shell-states'}]}],
               'roots': {'own root': {'stage': 'GT', 'signedIn': True, 'role': 'tagger'}},
               'paths': [{'root': 'own root', 'actions': ['load']}]}}
    expect, matrix, _ = shell_states.build(copy.deepcopy(PAGE), studies)
    assert [(p['study'], p['root']) for p in expect['paths']] == [('acme', 'acme'), ('other', 'own root')]
    assert 'Own' in [e['name'] for e in expect['elements']['other']] and 'Own' not in [e['name'] for e in expect['elements']['acme']]
    # the tagger's box hidden there, and what it holds of the study's with it
    assert expect['paths'][1]['states'][1]['expect']['Own'] == 'gone' and '## Other · own root: Load' in matrix


def test_a_study_grafts_its_elements_where_it_names():
    rules = shell_states.graft(copy.deepcopy(PAGE), {'grafts': [
        {'under': 'Box', 'after': 'Button', 'tree': [{'name': 'After', 'select': '#after', 'req': 'req/checks/spec-layout'}]},
        {'under': 'Box', 'tree': [{'name': 'First', 'select': '#first', 'req': 'req/checks/spec-layout'}]},
        {'under': 'Panel', 'tree': [{'name': 'Only', 'select': '#only', 'req': 'req/checks/spec-layout'}]}]})
    assert [c['name'] for c in rules['tree'][0]['children']] == ['First', 'Button', 'After']
    assert [c['name'] for c in rules['tree'][1]['children']] == ['Only']
    with pytest.raises(AssertionError, match='no element'):
        shell_states.graft(copy.deepcopy(PAGE), {'grafts': [{'under': 'Nowhere', 'tree': []}]})
    with pytest.raises(AssertionError, match='holds no'):
        shell_states.graft(copy.deepcopy(PAGE), {'grafts': [{'under': 'Box', 'after': 'Panel', 'tree': []}]})
