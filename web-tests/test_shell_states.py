"""req/checks/shell-states: the shell's element tree and its rules (dev/requirements/shell-states.json) turn into the matrix
and the browser test's expectations as the requirement says; the generated files are up to date, every element the tree
names is on the page, and the shell's elements not in the tree yet are counted."""
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

# the shell's elements, by id, that the tree does not hold yet: lower it as the tree grows
NOT_IN_TREE = 69

# an invented page: a box holding a button, beside a panel
PAGE = {
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


def expected(rules):
    expect, matrix, unused = shell_states.build(rules)
    return [[s['expect'] for s in p['states']] for p in expect['paths']][0], matrix, unused


def test_each_state_is_one_more_action_and_each_element_shows_as_its_rules_and_its_parents_say():
    states, matrix, unused = expected(PAGE)
    assert not unused
    # no image: the box folded, the button inside it with it
    assert states[0]['Box'] == 'folded' and states[0]['Button'] == 'gone'
    # loaded: the box open, the button off until counted, then on
    assert (states[1]['Box'], states[1]['Button']) == ('on', 'off')
    assert (states[2]['Box'], states[2]['Button']) == ('on', 'on')
    # the tagger: the box hidden, and the button under it gone though its own case says on
    assert (states[3]['Box'], states[3]['Button']) == ('gone', 'gone')
    # an undecided case is not checked; a tentative one is, and the matrix marks it
    assert states[2]['Panel'] is None and states[3]['Panel'] == 'on'
    assert '| Panel | ● | ● | ? | ●* |' in matrix and '- acme: Load · Count · → Tagger, Count: Panel' in matrix


def test_a_case_no_state_reaches_is_reported():
    rules = copy.deepcopy(PAGE)
    rules['paths'][0]['actions'] = ['load']
    _, _, unused = expected(rules)
    assert unused == ['Box, case 2', 'Panel, case 1', 'Panel, case 2']


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
        shell_states.build(rules)


def test_the_generated_files_are_up_to_date():
    assert shell_states.main(['--check']) == 0, 'run python3 dev/tools/build/shell_states.py'


class Ids(HTMLParser):
    """The ids of a page's body, and which of them sit in what a dialog, popup, menu, template or icon holds: those
    show only once opened, and are not the state's."""
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}

    def __init__(self):
        super().__init__()
        self.stack, self.state, self.opened = [], [], []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        inside = tag in ('head', 'dialog', 'template', 'svg') or 'popover' in a or 'pop' in (a.get('class') or '').split()
        if 'id' in a:
            (self.opened if inside or any(self.stack) else self.state).append(a['id'])
        if tag not in self.VOID:
            self.stack.append(inside)

    def handle_endtag(self, tag):
        if tag not in self.VOID and self.stack:
            self.stack.pop()


def page_ids(*files):
    p = Ids()
    for f in files:
        with open(os.path.join(ROOT, f), encoding='utf-8') as h:
            p.feed(h.read())
    return p


def tree():
    with open(shell_states.RULES, encoding='utf-8') as f:
        return list(shell_states.nodes(json.load(f)['tree']))


def lead(select):
    return re.match(r'#([\w-]+)', select).group(1)


def test_every_element_the_tree_names_is_on_the_page():
    """By the id its selector starts from; one the page makes as it runs, from its parent's."""
    p = page_ids('web/index.html', 'studies/fixture/web/fixture.html')
    ids = set(p.state) | set(p.opened)
    checked = 0
    for n, parent, _ in tree():
        owner = parent if n.get('made') else n
        assert lead(owner['select']) in ids, f"{n['name']}: no #{lead(owner['select'])} on the page"
        checked += 1
    assert checked >= 35


def test_the_shell_elements_not_in_the_tree_yet_are_counted():
    p = page_ids('web/index.html')
    held = {lead(n['select']) for n, _, _ in tree()}
    left = [i for i in p.state if i not in held]
    assert len(p.state) > 100
    assert len(left) == NOT_IN_TREE, f'{len(left)} of the shell\'s elements are not in the tree (was {NOT_IN_TREE}): set NOT_IN_TREE'
