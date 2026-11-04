"""NoR mutation sweep: splice tricks from the repo's trick pool into a finder and report any signal.

  python3 mutate.py list                                   # every runnable trick, and what is missing here
  python3 mutate.py sweep [--base tl] [--kinds pre,verify] [--tricks a,b] [--out DIR]
  python3 mutate.py one 'pre:white-tophat@red' [--base tl] [--out DIR]
  python3 mutate.py view raw white-tophat ... [--out DIR]  # gridded tiles of each view, for a vision agent
  python3 mutate.py marks DIR/VIEW/marks.json --tiles DIR/tiles.json
  python3 mutate.py table [SPEC ...]                       # which versions keep each graded item: oracle bounds, disagreements

A mutation is one of:
  pre:<trick>@<chan>              the trick transforms a channel (green, red or both) before the finder runs
  verify:<trick>@<chan>:reject    the trick's map, averaged over each passing candidate's red segment, fails
                                  the passes in its lowest decile (of the passes' own values)
  verify:<trick>@<chan>:rescue    ... and un-fails filtered candidates at or above the passes' 90th percentile

The signal (what each mutant did that no registered finder does) is computed by the pool's
mutation_signal module; the algorithm-mutation skill says how to read it.
"""
import argparse, json, os, sys, time
import numpy as np
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', '..', '..', 'dev', 'tools', 'trick_pool'))
import nor_lab
import tricks as T
import mutation_signal as S

CHANS = ('green', 'red', 'both')
REJECT_Q, RESCUE_Q = 0.10, 0.90


def graded(labels):
    return [L for L in labels if L.get('label') in (0, 1)]


def kept(cands):
    return [(k['cx'], k['cy']) for k in cands if k['fail'] is None]


def parse(m):
    """'verify:unsharp-mask(r_u=1.5)@red:reject=0.2' -> ('verify', 'unsharp-mask', 'red', 'reject', {'r_u': 1.5}, 0.2)"""
    kind, rest = m.split(':', 1)
    tid, _, tail = rest.partition('@')
    tid, _, args = tid.partition('(')
    kw = {k: json.loads(v) for k, v in (a.split('=') for a in filter(None, args.rstrip(')').split(',')))}
    chan, _, mode = tail.partition(':')
    mode, _, q = mode.partition('=')
    return kind, tid, chan, mode or None, kw, float(q) if q else None


def _seg_mean(M, k):
    by, bx = k['box']; ys, xs = np.nonzero(k['red'])
    ys, xs = np.clip(ys + by, 0, M.shape[0] - 1), np.clip(xs + bx, 0, M.shape[1] - 1)
    return float(M[ys, xs].mean()) if len(ys) else float(M[int(k['cy']), int(k['cx'])])


def null_trick(tid):
    """'null-<seed>': what an idea-free change does in the same slot. For verify, a random map. For pre, a
    perturbation as strong as a real trick: a blur of random width and a smooth random illumination field."""
    seed = int(tid.split('-')[1])

    def fn(img, unit):
        rng = np.random.default_rng(seed)
        if not NULL_PRE[0]:
            return rng.random(img.shape)
        field = ndi.gaussian_filter(rng.normal(0, 1, img.shape), 8 * unit)
        field = 1 + 0.5 * field / max(np.abs(field).max(), 1e-12)
        return ndi.gaussian_filter(img, rng.uniform(0.2, 0.8) * unit) * field
    return fn


NULL_PRE = [False]


def trick_fn(tid, kind):
    if tid.startswith('null-'):
        NULL_PRE[0] = kind == 'pre'; return null_trick(tid)
    return T.TRICKS[tid]


def run_mutant(m, base, data, unit):
    kind, tid, chan, mode, kw, q = parse(m)
    c, n, um, bm = data; fn0 = trick_fn(tid, kind); fn = lambda img, u: fn0(img, u, **kw)
    pick = lambda img, ch: fn(img, unit) if chan in (ch, 'both') else img
    if kind == 'pre':
        c2, n2 = pick(c, 'green'), pick(n, 'red')
        return nor_lab.run(base, (np.maximum(c2, 0), np.maximum(n2, 0), um, bm))[0]
    cands, _ = nor_lab.run(base, data)
    M = fn(c if chan == 'green' else n if chan == 'red' else c + n, unit)
    v = {i: _seg_mean(M, k) for i, k in enumerate(cands) if 'red' in k}
    pv = np.array([v[i] for i, k in enumerate(cands) if k['fail'] is None and i in v])
    if not len(pv):
        return cands
    out = [dict(k) for k in cands]
    if mode == 'reject':
        t = np.quantile(pv, q or REJECT_Q)
        for i, k in enumerate(out):
            if k['fail'] is None and i in v and v[i] < t:
                k['fail'] = 'mutation'
    elif mode == 'rescue':
        t = np.quantile(pv, q or RESCUE_Q)
        for i, k in enumerate(out):
            if k['fail'] not in (None, 'no green') and i in v and v[i] >= t:
                k['fail'] = None
    return out


NULLS = 8


def null_mutations(kinds):
    out = []
    for i in range(NULLS):
        if 'pre' in kinds:
            out += [f'pre:null-{i}@{ch}' for ch in CHANS]
        if 'verify' in kinds:
            out += [f'verify:null-{i}@{ch}:{mo}' for ch in ('green', 'red') for mo in ('reject', 'rescue')]
    return out


def mutations(kinds, only=None):
    av = T.available(); out = []
    for tid, kind in T.KIND.items():
        if av[tid] or (only and tid not in only):
            continue
        if kind == 'pre' and 'pre' in kinds:
            out += [f'pre:{tid}@{ch}' for ch in CHANS]
        if 'verify' in kinds:
            out += [f'verify:{tid}@{ch}:{mo}' for ch in ('green', 'red') for mo in ('reject', 'rescue')]
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('cmd'); ap.add_argument('specs', nargs='*')
    ap.add_argument('--base', default='tl'); ap.add_argument('--kinds', default='pre,verify')
    ap.add_argument('--tricks'); ap.add_argument('--out', default=os.path.join(HERE, '.cache', 'mutate'))
    ap.add_argument('--labels', default=nor_lab.LABELS); ap.add_argument('--tiles'); a = ap.parse_args()
    if a.cmd == 'list':
        for tid, miss in sorted(T.available().items()):
            print(f"{T.KIND[tid]:4s} {tid:30s} {'ok' if not miss else 'missing ' + miss}")
        return
    data = nor_lab.load(); items = graded(nor_lab.read_labels(a.labels)); y = np.array([L['label'] for L in items])
    H = lambda cands: S.hits(kept(cands), items, nor_lab.radius)
    registry = {}
    for name in nor_lab.finders():
        registry[name] = H(nor_lab.run(name, data)[0])
    base_c, info = nor_lab.run(a.base, data); hb = H(base_c); unit = info['unit']
    if a.cmd == 'table':
        return table({k: registry[k] if k in registry else H(nor_lab.run(k, data)[0]) for k in (a.specs or registry)}, items, y)
    if a.cmd in ('view', 'marks'):
        os.makedirs(a.out, exist_ok=True)
        return view(a.specs, data, unit, items, registry, a.out) if a.cmd == 'view' else marks(a.specs[0], a.tiles, items, registry)
    ms =a.specs if a.cmd == 'one' else mutations(a.kinds.split(','), a.tricks and set(a.tricks.split(',')))
    sk = [tid for tid, miss in T.available().items() if miss]
    print(f"base {a.base}: tp {(hb & (y == 1)).sum()} fp {(hb & (y == 0)).sum()} | registry {', '.join(registry)} | "
          f"never found by any: {((y == 1) & ~np.array(list(registry.values())).any(0)).sum()} real | "
          f"kept by all: {((y == 0) & np.array(list(registry.values())).all(0)).sum()} false | not runnable here: {', '.join(sk) or 'none'}")
    os.makedirs(a.out, exist_ok=True); rows = []
    null, bar = {}, {}
    last = os.path.join(a.out, 'sweep.json')
    if a.cmd == 'one' and os.path.exists(last):
        bar = {tuple(k.split('|')): tuple(v) for k, v in json.load(open(last)).get('chance', {}).items()}
        null = bool(bar); print(f'chance bar from the last sweep in {a.out}' if bar else 'no chance bar: run a sweep first')
    elif a.cmd == 'one':
        print('no chance bar: run a sweep first, so its nulls are in --out')
    if a.cmd == 'sweep':
        for m in null_mutations(a.kinds.split(',')):
            s = S.signal(y, registry, hb, H(run_mutant(m, a.base, data, unit))); kind, _, chan, mode = parse(m)[:4]
            null.setdefault((kind, chan, mode), []).append((len(s['rescued_never']), len(s['rejected_always'])))
        bar = {k: (max(v[0] for v in vs), max(v[1] for v in vs)) for k, vs in null.items()}
        print('chance (most of ' + str(NULLS) + ' null mutants, never+ / always-): ' + ', '.join(f"{k[0]}@{k[1]}{':' + k[2] if k[2] else ''} {b[0]}/{b[1]}" for k, b in bar.items()))
    print(f"{'mutation':46s}  tp  fp  dtp dfp  P(better) never+ always-  secs")
    for m in ms:
        t = time.time()
        try:
            cm = run_mutant(m, a.base, data, unit)
        except Exception as e:  # a trick that breaks on this image is a result too: report it and go on
            print(f"{m:46s}  error: {type(e).__name__}: {str(e)[:60]}"); rows.append(dict(mutation=m, error=repr(e))); continue
        s = S.signal(y, registry, hb, H(cm), bar.get(parse(m)[:1] + parse(m)[2:4]) if null else None)
        lens = lambda cs: [k['length_px'] for k in cs if k['fail'] is None and 'length_px' in k]
        s['stats'] = S.stat_shift([L.get('length_px') for L in items if L.get('measured') in ('adjusted', 'approved')], lens(base_c), lens(cm))
        s['mutation'] = m; s['secs'] = round(time.time() - t, 1)
        s['items'] = {k: [items[i].get('id', i) for i in s[k]] for k in ('rescued_never', 'rejected_always', 'lost_real')}
        rows.append(s)
        flag = '  <- signal' if s['signal'] else ''
        print(f"{m:46s} {s['tp']:3d} {s['fp']:3d} {s['d_tp']:+4d} {s['d_fp']:+3d}   {s['p_better']:.2f}    "
              f"{len(s['rescued_never']):3d}    {len(s['rejected_always']):3d}   {s['secs']:4.0f}{flag}", flush=True)
        if s['signal']:
            sheet(m, cm, items, s, data, a.out)
    chance = {'|'.join(str(x) for x in k): v for k, v in bar.items()} if a.cmd == 'sweep' else {}
    json.dump(dict(base=a.base, unit=unit, chance=chance, rows=rows), open(os.path.join(a.out, 'sweep.json'), 'w'), indent=1, default=str)


TILE, ZOOM, GRID = 160, 3, 20


def tile_origins(items, registry, n=6):
    """tiles over the hard part first: real items no version finds, then false ones every version keeps,
    then plain successes; each tile is placed once and holds whatever other items fall inside it"""
    R = np.array(list(registry.values())); y = np.array([L['label'] for L in items])
    order = list(np.nonzero((y == 1) & ~R.any(0))[0]) + list(np.nonzero((y == 0) & R.all(0))[0]) + list(np.nonzero((y == 1) & R.all(0))[0])
    out = []
    for i in order:
        x0, y0 = int(items[i]['x']) - TILE // 2, int(items[i]['y']) - TILE // 2
        if all(abs(x0 - a) > TILE // 2 or abs(y0 - b) > TILE // 2 for a, b in out):
            out.append((x0, y0))
        if len(out) == n:
            break
    return out


def view(names, data, unit, items, registry, out):
    from PIL import Image, ImageDraw
    import naive_nor as nn_
    c, n, um, bm = data; H, W = c.shape
    origins = [(min(max(0, x0), W - TILE), min(max(0, y0), H - TILE)) for x0, y0 in tile_origins(items, registry)]
    json.dump(dict(tile=TILE, zoom=ZOOM, grid=GRID, origins=origins), open(os.path.join(out, 'tiles.json'), 'w'))
    for name in names:
        c2, n2 = (c, n) if name == 'raw' else (T.TRICKS[name](c, unit), T.TRICKS[name](n, unit))
        rgb = np.zeros((H, W, 3), np.uint8); rgb[..., 0] = nn_.to8(np.maximum(n2, 0)); rgb[..., 1] = nn_.to8(np.maximum(c2, 0))
        d = os.path.join(out, name); os.makedirs(d, exist_ok=True)
        for t, (x0, y0) in enumerate(origins):
            im = Image.fromarray(rgb[y0:y0 + TILE, x0:x0 + TILE]).resize((TILE * ZOOM, TILE * ZOOM), Image.NEAREST)
            dr = ImageDraw.Draw(im)
            for g in range(0, TILE, GRID):
                dr.line([(g * ZOOM, 0), (g * ZOOM, TILE * ZOOM)], fill=(90, 90, 160)); dr.line([(0, g * ZOOM), (TILE * ZOOM, g * ZOOM)], fill=(90, 90, 160))
                dr.text((g * ZOOM + 2, 2), str(g), fill=(200, 200, 255)); dr.text((2, g * ZOOM + 2), str(g), fill=(200, 200, 255))
            im.save(os.path.join(d, f'tile_{t}.png'))
        print(f'{name}: {len(origins)} tiles -> {d}')


def marks(path, tiles, items, registry):
    """an agent's marks on the tiles, scored against the graded items inside the tiles, beside the registry"""
    tj = json.load(open(tiles)); M = json.load(open(path))['marks']
    xy = [(tj['origins'][m['tile']][0] + m['x'], tj['origins'][m['tile']][1] + m['y']) for m in M if m.get('sure', 1) >= 0.5]
    inside = [i for i, L in enumerate(items) if any(x0 <= L['x'] < x0 + tj['tile'] and y0 <= L['y'] < y0 + tj['tile'] for x0, y0 in tj['origins'])]
    sub = [items[i] for i in inside]; y = np.array([L['label'] for L in sub]); h = S.hits(xy, sub, nor_lab.radius)
    print(f"marks {len(xy)} | in tiles: {int((y == 1).sum())} real, {int((y == 0).sum())} false | agent tp {int((h & (y == 1)).sum())} fp {int((h & (y == 0)).sum())}")
    for name, hr in registry.items():
        hr = hr[inside]
        print(f"  vs {name:8s} tp {int((hr & (y == 1)).sum())} fp {int((hr & (y == 0)).sum())} | agent finds {int((h & ~hr & (y == 1)).sum())} real it misses, "
              f"rejects {int((~h & hr & (y == 0)).sum())} false it keeps")


def table(hv, items, y):
    """the fusing-algorithms step 2 read: each version's P/R, the union's recall and the intersection's
    precision (the bounds no vote can pass), and the graded items exactly one version keeps"""
    pr = lambda h: (int((h & (y == 1)).sum()), int((h & (y == 0)).sum()))
    for name, h in hv.items():
        tp, fp = pr(h); print(f"{name:12s} tp {tp:3d} fp {fp:3d}  P {tp / max(1, tp + fp):.2f} R {tp / max(1, (y == 1).sum()):.2f}")
    H = np.array(list(hv.values())); U, I = H.any(0), H.all(0)
    (tu, fu), (ti, fi) = pr(U), pr(I)
    print(f"{'union':12s} tp {tu:3d} fp {fu:3d}  R {tu / max(1, (y == 1).sum()):.2f}  (no OR vote recalls more)")
    print(f"{'intersection':12s} tp {ti:3d} fp {fi:3d}  P {ti / max(1, ti + fi):.2f}  (no AND vote is more precise)")
    for j, name in enumerate(hv):
        only = H[j] & (H.sum(0) == 1)
        print(f"only {name:8s} real {[items[i].get('id', i) for i in np.nonzero(only & (y == 1))[0]]} false {[items[i].get('id', i) for i in np.nonzero(only & (y == 0))[0]]}")


def sheet(m, cands, items, s, data, out):
    """the items behind the signal, as tiles: what it rescued (pink) and what it rejected (blue)"""
    rgb = nor_lab._rgb(data[0], data[1]); tiles, labs = [], []
    for key, col, tag in (('rescued_never', (255, 105, 200), '+'), ('rejected_always', (0, 140, 255), 'x'), ('lost_real', (255, 255, 0), '-')):
        for i in s[key]:
            L = items[i]
            k = min(cands, key=lambda k: np.hypot(k['cx'] - L['x'], k['cy'] - L['y']))
            tiles.append(nor_lab._tile(rgb, k, color=col)); labs.append(f"{tag}{L.get('id', i)}")
    nor_lab.sheet(tiles, labs, os.path.join(out, m.replace(':', '_').replace('@', '_') + '.png'), cols=8,
                  title=f'{m}: + never found before, x always kept before, - real the base found and this lost')


if __name__ == '__main__':
    main()
