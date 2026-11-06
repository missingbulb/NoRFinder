"""The shell's states (req/checks/shell-states): from the element tree and its rules
(dev/requirements/shell-states.json), with each study's own elements grafted in from its states.json
(req/checks/spec-layout), every state the paths reach and what each element shows there, written as the
matrix (dev/requirements/shell-states.GENERATED.md) and as the browser test's expectations
(web-tests/shell-states.GENERATED.json). The shell's paths open the study it names; a study's own paths open it.

    python3 dev/tools/build/shell_states.py          # write both
    python3 dev/tools/build/shell_states.py --check  # exit 1 when either is out of date
"""
import copy
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')
RULES = os.path.join(ROOT, 'dev', 'requirements', 'shell-states.json')
STUDIES = os.path.join(ROOT, 'studies')
MATRIX = os.path.join(ROOT, 'dev', 'requirements', 'shell-states.GENERATED.md')
EXPECT = os.path.join(ROOT, 'web-tests', 'shell-states.GENERATED.json')

# what each action leaves changed; the browser test does the same action on the page
ACTIONS = {
    'load': ('Load', {'image': 'local', 'stack': False, 'counted': False, 'view': 'image'}),
    'stack': ('Load a stack', {'image': 'local', 'stack': True, 'counted': False, 'view': 'image'}),
    'count': ('Count', {'counted': True}),
    'items': ('Items', {'view': 'items'}),
    'image': ('Image', {'view': 'image'}),
    # choosing Ground Truth Tagger opens the study afresh on the same image (req/shell/account/role)
    'tagger': ('→ Tagger', {'role': 'tagger', 'counted': False, 'view': 'image'}),
    'folder': ('Folder', {'selected': 'folder'}),
    'preview': ('Preview', {'selected': 'image', 'image': 'preview', 'counted': False}),
    'original': ('Load Original', {'image': 'original'}),
    # from a preview, Edit Image opens the image itself (req/shell/data/edit)
    'edit': ('Edit Image', {'editing': True, 'image': 'original'}),
    'done': ('Done', {'editing': False}),
    'offline': ('Offline', {'online': False}),
    'online': ('Online', {'online': True}),
}
START = {'image': 'none', 'counted': False, 'view': 'image', 'selected': 'nothing', 'online': True, 'editing': False, 'stack': False,
         'notice': False, 'imageFits': True}
STATES = ('shown', 'disabled', 'held', 'folded', 'hidden')
# what the page shows of an element, as the browser reads it: on (shown, usable, a box open), off (shown, disabled),
# held (shown, saying it needs the internet, req/shell/offline/default), folded (a box shown folded), gone (not
# shown); unchecked where the case is undecided. What a held element holds keeps its own state.
SEEN = {'shown': 'on', 'disabled': 'off', 'held': 'held', 'folded': 'folded', 'hidden': 'gone', 'under-hidden': 'gone',
        'in-folded': 'gone'}
MARK = {'shown': '●', 'disabled': '◐', 'held': '⊖', 'folded': '▸', 'hidden': '○', 'under-hidden': '⊘', 'in-folded': '⋯'}


def derived(s):
    """What the rules may name besides the vars: the study makes ground truth for this user (req/shell/account/role)."""
    return {**s, 'makesTruth': s['role'] == 'tagger' and s['stage'] in ('GT', 'PostGT')}


def nodes(tree, parent=None, depth=0):
    for n in tree:
        yield n, parent, depth
        yield from nodes(n.get('children', []), n, depth + 1)


def check_rules(rules, tree, roots, paths):
    names = set(rules['vars']) | {'makesTruth'}
    seen = set()
    for n, _, _ in nodes(tree):
        assert n['name'] not in seen, f"two elements named {n['name']!r}"
        seen.add(n['name'])
        assert n.get('req', '').startswith('req/'), f"{n['name']} names no requirement"
        for case in n.get('rule', []):
            assert case['is'] in STATES, f"{n['name']}: {case['is']!r} is not a state"
            assert case.get('approval', 'owner') in ('owner', 'tentative', 'undecided'), n['name']
            for k, vs in case.get('when', {}).items():
                assert k in names, f"{n['name']}: no var {k!r}"
                allowed = rules['vars'].get(k, [False, True])
                assert all(v in allowed for v in vs), f"{n['name']}: {k} is never {vs}"
    for name, root in roots.items():
        for k, v in root.items():
            assert k in rules['vars'] and v in rules['vars'][k], f"root {name!r}: {k} is never {v!r}"
    for p in paths:
        assert p['root'] in roots, f"no root {p['root']!r}"
        assert all(a in ACTIONS for a in p['actions']), f"an action unknown on {p['root']}: {p['actions']}"


def facts(study):
    """What the study itself says, from its study.json and its panels: whether it opens images from the computer,
    has steps of its own after Load, and has an item view, and how it marks it (req/shell/views/second): shelved,
    never shown, or viewing, showing only what was found."""
    d = study['study']
    view = re.search(r'<[^>]*\bid="items-view"[^>]*>', study.get('panels', ''))
    marked = lambda m: bool(view) and re.search(rf'\s{m}[\s>=]', view.group(0)) is not None
    return {'fromComputer': 'local' in d['files']['from'], 'hasSteps': bool(d['phases']),
            'itemView': bool(view) and not marked('data-shelved'), 'itemViewing': marked('data-viewing')}


def walk(study, roots, paths):
    """Each path, as [(label, state)], the root's state first and then one after each action."""
    out = []
    for p in paths:
        s = {**START, **facts(study), **roots[p['root']]}
        states = [('Start', dict(s))]
        for a in p['actions']:
            label, change = ACTIONS[a]
            s = {**s, **change}
            # an image from the computer, open for whoever makes ground truth, is told it cannot be submitted
            # (req/shell/ground-truth/submit); the study opening afresh for a new tagger tells it again
            if a in ('load', 'stack', 'tagger'):
                s['notice'] = derived(s)['makesTruth'] and s['image'] == 'local'
            states.append((label, dict(s)))
        out.append((p, states))
    return out


def own(n, s, used, key):
    """The element's own state here: the first case matching, as (state, approval, req)."""
    d = derived(s)
    for i, case in enumerate(n.get('rule', [])):
        if all(d[k] in vs for k, vs in case.get('when', {}).items()):
            used.add((key, i))
            return case['is'], case.get('approval', 'owner'), case.get('req', n['req'])
    return 'shown', 'owner', n['req']


def cells(tree, s, used, key):
    """{name: (state, approval)} for every element: its own state, unless a parent hidden or folded hides it."""
    out = {}
    for n, parent, _ in nodes(tree):
        state, approval, _ = own(n, s, used, key(n))
        if parent is not None:
            up, up_approval = out[parent['name']]
            if up in ('hidden', 'under-hidden'):
                state, approval = 'under-hidden', up_approval
            elif up in ('folded', 'in-folded'):
                state, approval = 'in-folded', up_approval
        out[n['name']] = (state, approval)
    return out


def build(rules, studies):
    """studies: {id: its states.json, and its study.json as 'study'}. The shell's paths open rules['study'], each
    study's own paths open it; every study walked has the shell's tree with its grafts."""
    shell = {n['name'] for n, _, _ in nodes(rules['tree'])}
    walked = [(rules['study'], rules['roots'], rules['paths'])] + [
        (i, st.get('roots', {}), st['paths']) for i, st in sorted(studies.items()) if st.get('paths')]
    used, trees, paths, tables, unused = set(), {}, [], [], []
    for i, roots, ps in walked:
        tree = trees.get(i) or graft(copy.deepcopy(rules), studies[i])['tree']
        check_rules(rules, tree, roots, ps)
        key = lambda n, i=i: n['name'] if n['name'] in shell else f"{i}: {n['name']}"
        if i not in trees:
            trees[i] = tree
            unused += [(key(n), k) for n, _, _ in nodes(tree) for k in range(len(n.get('rule', [])))]
        title = studies[i]['study']['title']
        for p, states in walk(studies[i], roots, ps):
            rows = [(label, cells(tree, s, used, key)) for label, s in states]
            paths.append({'study': i, 'root': p['root'], 'stage': roots[p['root']]['stage'],
                          'signedIn': roots[p['root']]['signedIn'], 'role': roots[p['root']]['role'],
                          'actions': p['actions'],
                          'states': [{'label': label, 'expect': {k: (None if a == 'undecided' else SEEN[v]) for k, (v, a) in c.items()}}
                                     for label, c in rows]})
            tables.append((f"{title} · {p['root']}: {' · '.join(label for label, _ in rows[1:])}", tree, rows))
    unused = [f"{name}, case {k + 1}" for name, k in dict.fromkeys(unused) if (name, k) not in used]
    elements = {i: [{'name': n['name'], 'select': n['select'], 'control': bool(n.get('control')), 'box': bool(n.get('box')),
                     'parent': parent['name'] if parent else None} for n, parent, _ in nodes(tree)] for i, tree in trees.items()}
    return {'elements': elements, 'paths': paths}, markdown(tables), unused


def markdown(tables):
    lines = ['# The shell\'s states',
             '',
             'Generated by `dev/tools/build/shell_states.py` from [shell-states.json](shell-states.json) and each '
             'study\'s `states.json` (`req/checks/shell-states`): do not edit; change the rules and run it again.',
             '',
             'Each table is one path: the study it opens, a root (the study\'s stage, who is signed in, the role) and '
             'the actions taken from it, one column per state. ● shown · ◐ disabled · ⊖ held offline · ▸ folded · ○ hidden · '
             '⊘ its parent hidden · '
             '⋯ inside a folded box. `*` marks a tentative case, Claude\'s call not yet approved; `?` an undecided '
             'one, which nothing checks.',
             '']
    undecided = []
    for root, tree, rows in tables:
        lines += [f'## {root}', '', '| Element | ' + ' | '.join(label for label, _ in rows) + ' |',
                  '|---|' + '---|' * len(rows)]
        for n, _, depth in nodes(tree):
            marks = []
            for label, c in rows:
                state, approval = c[n['name']]
                if approval == 'undecided' and state not in ('under-hidden', 'in-folded'):
                    undecided.append(f'{root}, {label}: {n["name"]}')
                    marks.append('?')
                else:
                    marks.append(MARK[state] + ('*' if approval == 'tentative' and state not in ('under-hidden', 'in-folded') else ''))
            lines.append('| ' + '&nbsp;&nbsp;' * depth + n['name'] + ' | ' + ' | '.join(marks) + ' |')
        lines.append('')
    lines += ['## Undecided', '']
    lines += [f'- {u}' for u in undecided] or ['None.']
    return '\n'.join(lines) + '\n'


def graft(rules, study):
    """The rules with each of the study's grafts put in the tree: under the element it names, after the child it
    names, or first."""
    for g in study.get('grafts', []):
        under = [n for n, _, _ in nodes(rules['tree']) if n['name'] == g['under']]
        assert under, f"no element {g['under']!r} to graft under"
        children = under[0].setdefault('children', [])
        at = 0
        if 'after' in g:
            names = [c['name'] for c in children]
            assert g['after'] in names, f"{g['under']} holds no {g['after']!r}"
            at = names.index(g['after']) + 1
        children[at:at] = g['tree']
    return rules


def load():
    """(the shell's rules, {id: what each study's states.json says, with its study.json as 'study' and its
    panels' HTML as 'panels'})."""
    with open(RULES, encoding='utf-8') as f:
        rules = json.load(f)
    studies = {}
    for i in sorted(os.listdir(STUDIES)):
        if not os.path.exists(os.path.join(STUDIES, i, 'states.json')):
            continue
        with open(os.path.join(STUDIES, i, 'states.json'), encoding='utf-8') as f, \
                open(os.path.join(STUDIES, i, 'study.json'), encoding='utf-8') as g:
            studies[i] = {**json.load(f), 'study': json.load(g)}
        panels = studies[i]['study']['web'].get('panels')
        if panels:
            with open(os.path.join(STUDIES, i, panels), encoding='utf-8') as f:
                studies[i]['panels'] = f.read()
    return rules, studies


def outputs():
    expect, matrix, unused = build(*load())
    return json.dumps(expect, indent=1, ensure_ascii=False) + '\n', matrix, unused


def main(argv):
    expect, matrix, unused = outputs()
    if unused:
        print('cases no state reaches: ' + '; '.join(unused))
        return 1
    if '--check' in argv:
        stale = [p for p, text in ((EXPECT, expect), (MATRIX, matrix))
                 if not os.path.exists(p) or open(p, encoding='utf-8').read() != text]
        if stale:
            print('out of date, run dev/tools/build/shell_states.py: ' + ', '.join(stale))
            return 1
        return 0
    for p, text in ((EXPECT, expect), (MATRIX, matrix)):
        with open(p, 'w', encoding='utf-8') as f:
            f.write(text)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
