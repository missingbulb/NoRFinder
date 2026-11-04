"""The shell's states (req/checks/shell-states): from the element tree and its rules
(dev/requirements/shell-states.json), every state its paths reach and what each element shows there, written as the
matrix (dev/requirements/shell-states.GENERATED.md) and as the browser test's expectations
(web-tests/shell-states.GENERATED.json).

    python3 dev/tools/build/shell_states.py          # write both
    python3 dev/tools/build/shell_states.py --check  # exit 1 when either is out of date
"""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')
RULES = os.path.join(ROOT, 'dev', 'requirements', 'shell-states.json')
MATRIX = os.path.join(ROOT, 'dev', 'requirements', 'shell-states.GENERATED.md')
EXPECT = os.path.join(ROOT, 'web-tests', 'shell-states.GENERATED.json')

# what each action leaves changed; the browser test does the same action on the page
ACTIONS = {
    'load': ('Load', {'image': 'local', 'counted': False, 'view': 'image'}),
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
         'fromComputer': False, 'notice': False, 'imageFits': True}
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


def check_rules(rules):
    names = set(rules['vars']) | {'makesTruth'}
    seen = set()
    for n, _, _ in nodes(rules['tree']):
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
    for p in rules['paths']:
        assert p['root'] in rules['roots'], f"no root {p['root']!r}"
        assert all(a in ACTIONS for a in p['actions']), f"an action unknown on {p['root']}: {p['actions']}"


def walk(rules):
    """Each path, as [(label, state)], the root's state first and then one after each action."""
    out = []
    for p in rules['paths']:
        s = {**START, **rules['roots'][p['root']]}
        states = [('Start', dict(s))]
        for a in p['actions']:
            label, change = ACTIONS[a]
            s = {**s, **change}
            # an image from the computer, open for whoever makes ground truth, is told it cannot be submitted
            # (req/shell/ground-truth/submit); the study opening afresh for a new tagger tells it again
            if a in ('load', 'tagger'):
                s['notice'] = derived(s)['makesTruth'] and s['image'] == 'local'
            states.append((label, dict(s)))
        out.append((p, states))
    return out


def own(n, s, used):
    """The element's own state here: the first case matching, as (state, approval, req)."""
    d = derived(s)
    for i, case in enumerate(n.get('rule', [])):
        if all(d[k] in vs for k, vs in case.get('when', {}).items()):
            used.add((n['name'], i))
            return case['is'], case.get('approval', 'owner'), case.get('req', n['req'])
    return 'shown', 'owner', n['req']


def cells(rules, s, used):
    """{name: (state, approval)} for every element: its own state, unless a parent hidden or folded hides it."""
    out = {}
    for n, parent, _ in nodes(rules['tree']):
        state, approval, _ = own(n, s, used)
        if parent is not None:
            up, up_approval = out[parent['name']]
            if up in ('hidden', 'under-hidden'):
                state, approval = 'under-hidden', up_approval
            elif up in ('folded', 'in-folded'):
                state, approval = 'in-folded', up_approval
        out[n['name']] = (state, approval)
    return out


def build(rules):
    check_rules(rules)
    used, paths, tables = set(), [], []
    elements = [{'name': n['name'], 'select': n['select'], 'control': bool(n.get('control')), 'box': bool(n.get('box')),
                 'parent': parent['name'] if parent else None} for n, parent, _ in nodes(rules['tree'])]
    for p, states in walk(rules):
        root = p['root']
        rows = []
        for label, s in states:
            c = cells(rules, s, used)
            rows.append((label, c))
        paths.append({'root': root, 'study': {'stage': rules['roots'][root]['stage']},
                      'signedIn': rules['roots'][root]['signedIn'], 'role': rules['roots'][root]['role'],
                      'actions': p['actions'],
                      'states': [{'label': label, 'expect': {k: (None if a == 'undecided' else SEEN[v]) for k, (v, a) in c.items()}}
                                 for label, c in rows]})
        tables.append((f"{root}: {' · '.join(label for label, _ in rows[1:])}", rows))
    unused = [f"{n['name']}, case {i + 1}" for n, _, _ in nodes(rules['tree']) for i in range(len(n.get('rule', [])))
              if (n['name'], i) not in used]
    return {'elements': elements, 'paths': paths}, markdown(rules, tables), unused


def markdown(rules, tables):
    lines = ['# The shell\'s states',
             '',
             'Generated by `dev/tools/build/shell_states.py` from [shell-states.json](shell-states.json) '
             '(`req/checks/shell-states`): do not edit; change the rules and run it again.',
             '',
             'Each table is one path: a root (the study\'s stage, who is signed in, the role) and the actions taken '
             'from it, one column per state. ● shown · ◐ disabled · ⊖ held offline · ▸ folded · ○ hidden · '
             '⊘ its parent hidden · '
             '⋯ inside a folded box. `*` marks a tentative case, Claude\'s call not yet approved; `?` an undecided '
             'one, which nothing checks.',
             '']
    undecided = []
    for root, rows in tables:
        lines += [f'## {root}', '', '| Element | ' + ' | '.join(label for label, _ in rows) + ' |',
                  '|---|' + '---|' * len(rows)]
        for n, _, depth in nodes(rules['tree']):
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


def outputs():
    with open(RULES, encoding='utf-8') as f:
        rules = json.load(f)
    expect, matrix, unused = build(rules)
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
