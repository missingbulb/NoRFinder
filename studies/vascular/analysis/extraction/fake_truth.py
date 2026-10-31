#!/usr/bin/env python3
"""Provisional ("fake") ground truth: a capable model's verdicts on traced vessels, to optimise towards
until the owner's corrected models exist.

A judge is shown one tile of a stack twice, the flattened signal alone and the same with every traced
edge numbered (the v1 draft with its low-confidence candidates, plus the edges later versions added),
all drawn alike so it does not know which the extractor trusted. It says of each numbered edge whether
it is a vessel, and draws the vessels nobody traced, by grid coordinates. Each verdict is stored with
the edge's own curve in µm, so any version can be graded against it by where its vessels lie, not by
edge ids. The labels are a model's eye, not the owner's: every number graded against them is a proxy.

    python3 analysis/extraction/fake_truth.py tiles OUTDIR        # tile PNGs + a manifest for the judges
    python3 analysis/extraction/fake_truth.py collect OUTDIR      # judges' answers -> labels/<set>.json
    python3 analysis/extraction/lab.py grade [VERSION ...]
"""
import argparse, glob, json, os, sys

import numpy as np
from PIL import Image, ImageDraw
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..'))
import lab, render
import score as sc
import vessel_model as vm

LABELS = os.path.join(HERE, 'labels')
SET = 'fable-v1'
# One tile per stack, plus a second on frontal r1's speckled lower right, where v1's candidates are thickest.
# Boxes in µm (x0, y0, x1, y1); 160 µm is about four median capillary segments across.
TILES = [
    ('cd31_frontal_x20_r_1_slices1-12', (20, 180, 180, 340)),
    ('cd31_frontal_x20_r_1_slices1-12', (420, 420, 580, 580)),
    ('cd31_frontal_x20_r_2_slices6-29', (250, 250, 410, 410)),
    ('cd31_ca1_x20_r_1_slices13-30', (250, 250, 410, 410)),
    ('cd31_ca1_x20_r_2_slices1-24', (250, 250, 410, 410)),
]
SCALE = 4
GRID_UM = 20
COVER_UM = 2.5        # a labelled curve is covered where a version's vessel runs within this of it (about a capillary radius)
COVERED = 0.5         # ... over at least half its length


def curves_for_judging(name, path):
    """v1 with its candidates, plus every edge a later version added that v1 has nowhere near."""
    base, _ = lab.cached('v1', name, path)
    um = base['um_per_px']
    out = [(e, base) for e in base['edges'] if e['a'] != e['b']]
    nodes = {n['id']: n for n in base['nodes']}
    pts = np.vstack([sc.sample_edge(e, nodes, um)[0][:, :2] for e, _ in out]) * um
    tree = cKDTree(pts)
    for v in lab.VERSIONS:
        if v == 'v1':
            continue
        m, _ = lab.cached(v, name, path)
        mn = {n['id']: n for n in m['nodes']}
        for e in m['edges']:
            if e['a'] == e['b'] or e.get('state') == 'rejected':
                continue
            xy = sc.sample_edge(e, mn, um)[0][:, :2] * um
            if np.mean(tree.query(xy)[0] > COVER_UM) > 0.5:
                out.append((e, m))
    return out


def tiles(outdir):
    os.makedirs(outdir, exist_ok=True)
    manifest = []
    for t, (name, box) in enumerate(TILES, 1):
        path = lab.stacks([name])[name]
        vol, um, _ = vm.read_cd31(path, None)
        flat = sc.flat_signal(vol, um)
        x0, y0, x1, y1 = [int(round(v / um)) for v in box]
        plain = render.base(flat, (x0, y0, x1, y1), SCALE)
        traced = plain.copy()
        d = ImageDraw.Draw(traced)
        f = render.font(15)
        edges = []
        k = 0
        for e, m in curves_for_judging(name, path):
            nodes = {n['id']: n for n in m['nodes']}
            xy, rad = sc.sample_edge(e, nodes, um)
            P = (xy[:, :2] - [x0, y0] + .5) * SCALE
            inside = (P[:, 0] >= 0) & (P[:, 0] < plain.size[0]) & (P[:, 1] >= 0) & (P[:, 1] < plain.size[1])
            if inside.mean() < 0.3:
                continue
            k += 1
            d.line([tuple(p) for p in P], fill=render.OK, width=1)
            q = P[inside][len(P[inside]) // 2]
            d.text((q[0] + 3, q[1] - 8), str(k), fill=(255, 230, 0), font=f, stroke_width=2, stroke_fill=(0, 0, 0))
            edges.append({'n': k, 'curve_um': np.round(xy[:, :2] * um + um / 2, 2)[::4].tolist() + [list(np.round(xy[-1, :2] * um + um / 2, 2))],
                          'from': m.get('algorithm'), 'state': e.get('state', 'vessel')})
        for img in (plain, traced):
            g = ImageDraw.Draw(img)
            for v in range(0, int(box[2] - box[0]) + 1, GRID_UM):
                X = v / um * SCALE
                g.line([(X, 0), (X, img.size[1])], fill=(90, 90, 90), width=1)
                g.text((X + 2, 2), str(v), fill=(160, 160, 160), font=render.font(12))
            for v in range(0, int(box[3] - box[1]) + 1, GRID_UM):
                Y = v / um * SCALE
                g.line([(0, Y), (img.size[0], Y)], fill=(90, 90, 90), width=1)
                g.text((2, Y + 2), str(v), fill=(160, 160, 160), font=render.font(12))
        both = Image.new('RGB', (plain.size[0] * 2 + 10, plain.size[1]), (40, 40, 40))
        both.paste(plain, (0, 0)); both.paste(traced, (plain.size[0] + 10, 0))
        png = os.path.join(outdir, f'tile{t}.png')
        both.save(png)
        manifest.append({'tile': t, 'stack': name, 'box_um': box, 'png': png, 'edges': edges})
        print(f'tile{t}: {name} {box}, {len(edges)} numbered edges')
    json.dump(manifest, open(os.path.join(outdir, 'manifest.json'), 'w'))


def collect(outdir):
    """Merge each tile's answers (tileN.answer.json) into one label file of curves in µm."""
    manifest = json.load(open(os.path.join(outdir, 'manifest.json')))
    out = {'_about': ('Provisional labels, judged by a model (Fable) from tile renders of the flattened stack, not by the '
                      'owner: a proxy to optimise towards until corrected models exist. curves: a traced edge with '
                      'verdict "vessel", "not" or "unsure", as points in µm from the image\'s top-left. missed: vessels '
                      'the judge saw with no trace, as rough polylines in µm. box_um: the judged tile; outside it '
                      'nothing is labelled.'), 'set': SET, 'tiles': []}
    for t in manifest:
        ans = json.load(open(os.path.join(outdir, f"tile{t['tile']}.answer.json")))
        verdict = {int(k): v for k, v in ans['edges'].items()}
        bx, by = t['box_um'][:2]
        out['tiles'].append({
            'stack': t['stack'], 'box_um': t['box_um'],
            'curves': [{'verdict': verdict.get(e['n'], 'unsure'), 'curve_um': e['curve_um']} for e in t['edges']],
            'missed': [[[bx + x, by + y] for x, y in line] for line in ans.get('missed', [])],
            'notes': ans.get('notes', ''),
        })
    json.dump(out, open(os.path.join(LABELS, f'{SET}.json'), 'w'), indent=0)


def densify(line, step=1.0):
    P = np.asarray(line, float)
    out = [P[0]]
    for a, b in zip(P[:-1], P[1:]):
        n = max(int(np.linalg.norm(b - a) / step), 1)
        out.extend(a + (b - a) * (np.arange(1, n + 1) / n)[:, None])
    return np.array(out)


def coverage(curve, tree, tol):
    pts = densify(curve)
    return float(np.mean(tree.query(pts)[0] <= tol)) if tree is not None else 0.0


def grade(model, labels):
    """Recall on the judged vessels, how many judged non-vessels the model keeps, and recall on the missed ones."""
    um = model['um_per_px']
    nodes = {n['id']: n for n in model['nodes']}
    pts = [sc.sample_edge(e, nodes, um)[0][:, :2] * um + um / 2 for e in model['edges']
           if e.get('state', 'vessel') in ('vessel', 'accepted') and e['a'] != e['b']]
    tree = cKDTree(np.vstack(pts)) if pts else None
    g = {'vessel': [0, 0], 'not': [0, 0], 'missed': [0, 0]}
    for t in labels:
        if t['stack'] != model['source'][:-4]:
            continue
        for c in t['curves']:
            if c['verdict'] in ('vessel', 'not'):
                g[c['verdict']][1] += 1
                g[c['verdict']][0] += coverage(c['curve_um'], tree, COVER_UM) >= COVERED
        for line in t['missed']:
            g['missed'][1] += 1
            g['missed'][0] += coverage(line, tree, 2 * COVER_UM) >= COVERED   # the judge's lines are rough
    return g


def grade_versions(versions):
    files = sorted(glob.glob(os.path.join(LABELS, '*.json')))
    if not files:
        raise SystemExit('no labels yet: run fake_truth.py tiles, have the judges answer, then collect')
    for f in files:
        L = json.load(open(f))
        names = sorted({t['stack'] for t in L['tiles']})
        print(f"labels {L['set']} ({os.path.basename(f)}), judged by a model, not the owner: every number is a proxy")
        print('| version | vessels found | non-vessels kept | missed ones found | F1 (vessels vs kept non-vessels) |')
        print('|---|---|---|---|---|')
        for v in versions:
            tot = {'vessel': [0, 0], 'not': [0, 0], 'missed': [0, 0]}
            for name in names:
                m, _ = lab.cached(v, name, lab.stacks([name])[name])
                for k, (a, b) in grade(m, L['tiles']).items():
                    tot[k][0] += a; tot[k][1] += b
            tp, P = tot['vessel']; fp, N = tot['not']; mf, M = tot['missed']
            prec = tp / max(tp + fp, 1); rec = tp / max(P, 1)
            f1 = 2 * prec * rec / max(prec + rec, 1e-9)
            print(f'| {v} | {tp}/{P} | {fp}/{N} | {mf}/{M} | {f1:.3f} |')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('cmd', choices=['tiles', 'collect']); ap.add_argument('outdir')
    a = ap.parse_args()
    (tiles if a.cmd == 'tiles' else collect)(a.outdir)


if __name__ == '__main__':
    main()
