#!/usr/bin/env python3
"""The extraction lab: every vessel-extraction version, run and scored the same way.

Versions live side by side (VERSIONS below); none is deleted when a newer one wins, so an idea that
plateaued stays readable and runnable. Every run measures each edge's start and end width and scores
the graph with score.py; the card goes into the model file as "score".

    python3 analysis/extraction/lab.py run VERSION STACK.tif OUT.json
    python3 analysis/extraction/lab.py cmp [VERSION ...] [--stacks NAME ...]   # table over the owner's stacks
    python3 analysis/extraction/lab.py render VERSION [VERSION ...] --stack NAME --out OUT.png [--box X0 Y0 X1 Y1]
    python3 analysis/extraction/lab.py grade [VERSION ...]                     # against the provisional labels

Stacks are the CD31 trimmed files in data/raw/ (python3 analysis/stack_sources.py), named by their stem.
Runs are cached in analysis/extraction/runs/ (not committed) by version, stack and the version's source.
"""
import argparse, glob, hashlib, importlib, json, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..'))
import score as sc
import vessel_model as vm

VERSIONS = {'v1': 'v1_flat_skeleton', 'v2': 'v2_scored_repair', 'v3': 'v3_geodesic_bridges', 'v4': 'v4_line_evidence', 'v5': 'v5_no_short_islands'}
DEFAULT = 'v5'
DATA = os.path.join(HERE, '..', '..', 'data', 'raw')
RUNS = os.path.join(HERE, 'runs')


def stacks(names=None):
    paths = sorted(glob.glob(os.path.join(DATA, 'cd31_*.tif')))
    found = {os.path.basename(p)[:-4]: p for p in paths}
    if names:
        return {n: found[n] for n in names}
    return found


def source_hash(version):
    """A version's cache key: its own source, the scorer, and the v1 tracer every version starts from."""
    h = hashlib.sha256()
    for f in sorted(set(VERSIONS[v] + '.py' for v in VERSIONS if v <= version)) + ['score.py', os.path.join('..', 'vessel_model.py')]:
        h.update(open(os.path.join(HERE, f), 'rb').read())
    return h.hexdigest()[:10]


def run(version, path, z_cache={}):
    mod = importlib.import_module(VERSIONS[version])
    vol, um, z_step = vm.read_cd31(path, None)
    t = time.time()
    m = mod.extract(vol, um, os.path.basename(path), z_step)
    t_extract = time.time() - t
    flat = sc.flat_signal(vol, um)
    card = sc.score(m, flat)
    m['score'] = {k: v for k, v in card.items() if not k.startswith('_')}
    m['score']['seconds'] = round(t_extract, 1)
    return m, card


def cached(version, name, path):
    os.makedirs(RUNS, exist_ok=True)
    f = os.path.join(RUNS, f'{version}-{source_hash(version)}-{name}.json')
    if os.path.exists(f):
        return json.load(open(f)), True
    m, card = run(version, path)
    m['_flags'] = card['_flags']
    json.dump(m, open(f, 'w'), separators=(',', ':'))
    return m, False


COLS = ['plausibility', 'edges', 'junctions', 'on_signal', 'short_loops', 'interior_ends', 'degree4_rate', 'narrow_junctions', 'steep_junctions',
        'taper_conflicts', 'median_segment_um', 'seconds']


def cmp(versions, names):
    rows = []
    for name, path in stacks(names).items():
        for v in versions:
            m, hit = cached(v, name, path)
            rows.append([name, v] + [m['score'].get(c) for c in COLS] + ['cached' if hit else 'fresh'])
    head = ['stack', 'version'] + COLS + ['run']
    print('| ' + ' | '.join(head) + ' |')
    print('|' + '---|' * len(head))
    for r in rows:
        print('| ' + ' | '.join(str(x) for x in r) + ' |')
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    r = sub.add_parser('run'); r.add_argument('version'); r.add_argument('stack'); r.add_argument('out')
    c = sub.add_parser('cmp'); c.add_argument('versions', nargs='*'); c.add_argument('--stacks', nargs='*')
    d = sub.add_parser('render'); d.add_argument('versions', nargs='+'); d.add_argument('--stack', required=True); d.add_argument('--out', required=True)
    d.add_argument('--box', type=float, nargs=4); d.add_argument('--scale', type=int, default=2); d.add_argument('--ids', action='store_true')
    g = sub.add_parser('grade'); g.add_argument('versions', nargs='*')
    a = ap.parse_args()
    if a.cmd == 'run':
        m, card = run(a.version, a.stack)
        json.dump(m, open(a.out, 'w'), separators=(',', ':'))
        print(' · '.join(f'{k} {v}' for k, v in m['score'].items()))
    elif a.cmd == 'cmp':
        cmp(a.versions or list(VERSIONS), a.stacks)
    elif a.cmd == 'render':
        import render
        versions, out = a.versions, a.out
        path = stacks([a.stack])[a.stack]
        models = [cached(v, a.stack, path)[0] for v in versions]
        vol, um, _ = vm.read_cd31(path, None)
        flat = sc.flat_signal(vol, um)
        cards = [{'_flags': m.get('_flags', {}), **m['score']} for m in models]
        titles = [f"{m['algorithm']} · plausibility {m['score']['plausibility']}" for m in models]
        render.render(flat, models, cards, a.box, a.scale, a.ids, titles).save(out)
    elif a.cmd == 'grade':
        import fake_truth
        fake_truth.grade_versions(a.versions or list(VERSIONS))


if __name__ == '__main__':
    main()
