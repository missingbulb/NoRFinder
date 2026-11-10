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
    # a role chosen: to or from Ground Truth Tagger, the study opens afresh on the same image (req/shell/account/role)
    'tagger': ('→ Tagger', {'role': 'tagger'}),
    'folder': ('Folder', {'selected': 'folder'}),
    'preview': ('Preview', {'selected': 'image', 'image': 'preview', 'stack': False, 'counted': False}),
    'zpreview': ('Preview a z-stack', {'selected': 'image', 'image': 'preview', 'stack': True, 'counted': False}),
    'original': ('Load Original', {'image': 'original'}),
    # from a preview, Edit Image opens the image itself (req/shell/data/edit)
    'edit': ('Edit Image', {'editing': True, 'image': 'original'}),
    'done': ('Done', {'editing': False}),
    'offline': ('Offline', {'online': False}),
    'online': ('Online', {'online': True}),
    'unload': ('Unload', {'image': 'none', 'stack': False, 'counted': False, 'view': 'image'}),
    # the study's images in its Drive folder, the one a user of a study that opens none from the computer takes
    'drive': ('Load from Drive', {'image': 'original', 'stack': False, 'counted': False, 'view': 'image'}),
    'viewer': ('→ Viewer', {'role': 'viewer'}),
    'data': ('→ Study Manager', {'role': 'data'}),
    # to another study and Back to this one, which opens afresh, with no image
    'restudy': ('Away and back', {'image': 'none', 'stack': False, 'counted': False, 'view': 'image'}),
    'ok': ('OK', {'notice': False}),
    'zoom': ('Zoom in', {'imageFits': False}),
}
ROLES = ('tagger', 'viewer', 'data')
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
    has steps of its own after Load, has an item view not marked shelved, never shown (req/shell/views/second), and
    shows a z-stack in 3D (req/shell/viewer-3d)."""
    d = study['study']
    view = re.search(r'<[^>]*\bid="items-view"[^>]*>', study.get('panels', ''))
    shelved = bool(view) and re.search(r'\sdata-shelved[\s>=]', view.group(0)) is not None
    return {'fromComputer': 'local' in d['files']['from'], 'hasSteps': bool(d['phases']), 'itemView': bool(view) and not shelved,
            'shows3d': d.get('viewer') == 'image3d'}


def walk(study, roots, paths):
    """Each path, as [(label, state)], the root's state first and then one after each action."""
    out = []
    for p in paths:
        s = {**START, **facts(study), **roots[p['root']]}
        states = [('Start', dict(s))]
        for a in p['actions']:
            label, change = ACTIONS[a]
            afresh = a in ROLES and (s['role'] == 'tagger') != (change['role'] == 'tagger')
            s = {**s, **change, **({'counted': False, 'view': 'image'} if afresh else {})}
            # an image from the computer, open for whoever makes ground truth, is told it cannot be submitted
            # (req/shell/ground-truth/submit); the study opening afresh for a new tagger tells it again
            if a in ('load', 'stack', 'drive', 'unload', 'restudy') or afresh:
                s['notice'] = derived(s)['makesTruth'] and s['image'] == 'local'
            states.append((label, dict(s)))
        out.append((p, states))
    return out


DEFAULT = -1  # an element's own state when none of its cases matches: as its parent shows


def own(n, s):
    """The element's own state here: the first case matching, as (state, approval, req, which case, or DEFAULT)."""
    d = derived(s)
    for i, case in enumerate(n.get('rule', [])):
        if all(d[k] in vs for k, vs in case.get('when', {}).items()):
            return case['is'], case.get('approval', 'owner'), case.get('req', n['req']), i
    return 'shown', 'owner', n['req'], DEFAULT


def cells(tree, s, used, seen, key):
    """{name: (state, approval)} for every element: its own state, unless a parent hidden or folded hides it. used
    gains (element, case) for each case deciding here; seen, those of them the browser can see decide, no parent
    hiding the element and the case not undecided."""
    out = {}
    for n, parent, _ in nodes(tree):
        state, approval, _, case = own(n, s)
        used.add((key(n), case))
        if parent is not None:
            up, up_approval = out[parent['name']]
            if up in ('hidden', 'under-hidden'):
                state, approval = 'under-hidden', up_approval
            elif up in ('folded', 'in-folded'):
                state, approval = 'in-folded', up_approval
        if state not in ('under-hidden', 'in-folded') and approval != 'undecided':
            seen.add((key(n), case))
        out[n['name']] = (state, approval)
    return out


def cases(n):
    """The cases an element can be decided by: each of its own, and its default unless a case always matches."""
    rule = n.get('rule', [])
    return list(range(len(rule))) + ([] if any(not c.get('when') for c in rule) else [DEFAULT])


def build(rules, studies):
    """studies: {id: its states.json, and its study.json as 'study'}. The shell's paths open rules['study'], each
    study's own paths open it; every study walked has the shell's tree with its grafts."""
    shell = {n['name'] for n, _, _ in nodes(rules['tree'])}
    walked = [(rules['study'], rules['roots'], rules['paths'])] + [
        (i, st.get('roots', {}), st['paths']) for i, st in sorted(studies.items()) if st.get('paths')]
    used, seen, trees, paths, tables, every = set(), set(), {}, [], [], []
    shows, steady, unwalked, soft, reached, acted = {}, set(), set(), set(), set(), set()
    for i, roots, ps in walked:
        tree = trees.get(i) or graft(copy.deepcopy(rules), studies[i])['tree']
        check_rules(rules, tree, roots, ps)
        # an element differing in the study has its cases counted as the study's
        own = set(studies[i].get('differ', {}))
        key = lambda n, i=i, own=own: n['name'] if n['name'] in shell and n['name'] not in own else f"{i}: {n['name']}"
        if i not in trees:
            trees[i] = tree
            every += [(key(n), k) for n, _, _ in nodes(tree) for k in cases(n)]
            steady |= {key(n) for n, _, _ in nodes(tree) if n.get('steady')}
            # an element marked unwalked: what it holds is unwalked with it, and so are its own cases no state shows
            off = set()
            for n, parent, _ in nodes(tree):
                if parent is not None and (parent.get('unwalked') or parent['name'] in off):
                    off.add(n['name'])
            unwalked |= {(key(n), k) for n, _, _ in nodes(tree) for k in cases(n)
                         if n['name'] in off or (k != DEFAULT and n['rule'][k].get('unwalked'))}
            soft |= {(key(n), k) for n, _, _ in nodes(tree) for k in cases(n) if n.get('unwalked')}
            # nothing checks an undecided case: the matrix lists it
            soft |= {(key(n), k) for n, _, _ in nodes(tree) for k in cases(n) if k != DEFAULT and n['rule'][k].get('approval') == 'undecided'}
        title = studies[i]['study']['title']
        for p, states in walk(studies[i], roots, ps):
            acted |= set(p['actions'])
            reached |= {(k, json.dumps(v)) for _, s in states for k, v in s.items()}
            rows = [(label, cells(tree, s, used, seen, key)) for label, s in states]
            for n, _, _ in nodes(tree):
                shows.setdefault(key(n), set()).update(SEEN[c[n['name']][0]] for _, c in rows if c[n['name']][1] != 'undecided')
            paths.append({'study': i, 'root': p['root'], 'stage': roots[p['root']]['stage'],
                          'signedIn': roots[p['root']]['signedIn'], 'role': roots[p['root']]['role'],
                          'actions': p['actions'],
                          'states': [{'label': label, 'expect': {k: (None if a == 'undecided' else SEEN[v]) for k, (v, a) in c.items()}}
                                     for label, c in rows]})
            tables.append((f"{title} · {p['root']}: {' · '.join(label for label, _ in rows[1:])}", tree, rows))
    every = list(dict.fromkeys(every))
    case = lambda k: 'its default' if k == DEFAULT else f'case {k + 1}'
    names = list(dict.fromkeys(name for name, _ in every))
    gaps = {
        'cases no state reaches': [f"{name}, {case(k)}" for name, k in every if (name, k) not in used],
        # a case the browser never sees decide checks nothing: a parent hides the element wherever it decides; one
        # marked unwalked says why no path shows it
        'cases decided only where a parent hides the element, and not marked unwalked': [
            f"{name}, {case(k)}" for name, k in every if (name, k) in used and (name, k) not in seen and (name, k) not in unwalked | soft],
        'cases marked unwalked that a state shows': [f"{name}, {case(k)}" for name, k in every if (name, k) in seen and (name, k) in unwalked],
        # an element showing the same in every state checks only that it is there: one marked steady says why it never changes
        'elements every state shows the same, and not marked steady': [
            n for n in names if len(shows[n]) < 2 and n not in steady and not all((n, k) in unwalked | soft for m, k in every if m == n)],
        'elements marked steady that states show differently': [n for n in names if len(shows[n]) > 1 and n in steady],
        'actions no path takes': [a for a in ACTIONS if a not in acted],
        'values of the vars no state has': [f"{k} {json.dumps(v)}" for k, vs in rules['vars'].items() for v in vs
                                            if (k, json.dumps(v)) not in reached],
    }
    elements = {i: [{'name': n['name'], 'select': n['select'], 'control': bool(n.get('control')), 'box': bool(n.get('box')),
                     'parent': parent['name'] if parent else None} for n, parent, _ in nodes(tree)] for i, tree in trees.items()}
    return {'elements': elements, 'paths': paths}, markdown(tables), {k: v for k, v in gaps.items() if v}


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
    names, or first; and a shell element as the study's `differ` says it differs there: its rule, and why it is steady."""
    for name, fields in study.get('differ', {}).items():
        el = [n for n, _, _ in nodes(rules['tree']) if n['name'] == name]
        assert el, f"no element {name!r} to differ"
        assert set(fields) <= {'rule', 'steady', 'unwalked'}, f"{name}: a study's element differs in its rule alone"
        # a rule of the study's own says for itself whether it is steady there
        if 'rule' in fields and 'steady' not in fields:
            el[0].pop('steady', None)
        el[0].update(fields)
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
    expect, matrix, gaps = build(*load())
    return json.dumps(expect, indent=1, ensure_ascii=False) + '\n', matrix, gaps


def main(argv):
    expect, matrix, gaps = outputs()
    if gaps:
        for kind, what in gaps.items():
            print(f'{kind}: ' + '; '.join(what))
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
