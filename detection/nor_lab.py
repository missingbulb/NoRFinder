"""NoR lab: one command to run a candidate finder, score it against reference labels,
and write compact review sheets.  Keeps every experiment cheap (cached input, one-line
summary) so a change can be judged by numbers first and pictures second.

  python3 nor_lab.py run  [--method fill] [--set key=val ...] [--sheets OUTDIR] [--labels FILE]
  python3 nor_lab.py cmp  'fill' 'fill:half=0.3' 'tl'        # side by side, one line each
  python3 nor_lab.py ablate BASE VARIANT ...                  # keep/drop verdicts, paired bootstrap on labels
"""
import os, sys, json, time, argparse, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import nor3, naive_nor as nn_
from PIL import Image, ImageDraw, ImageFont

TIF = os.environ.get('NOR_TIF', os.path.join(HERE, '..', 'data', 'raw', 'Left Up- Edited', 'Slide5_4AP_NoR.sld - Slice1_up_left2.tif'))
# processing artifact, never committed (detection/.cache/ is gitignored); NOR_CACHE_DIR can point elsewhere
CACHE = os.path.join(os.environ.get('NOR_CACHE_DIR', os.path.join(HERE, '.cache')), 'cache_' + os.path.basename(TIF).replace(' ', '_') + '.npz')
LABELS = os.path.join(HERE, 'lab', 'labels_claude_v1.json') if os.path.exists(os.path.join(HERE, 'lab')) else os.path.join(HERE, 'labels_claude_v1.json')
MATCH_PX = 5          # a pass within this distance of a labelled spot counts as that spot

def load():
    if os.path.exists(CACHE):
        z = np.load(CACHE); return z['c'], z['n'], float(z['um']), z['bm']
    c, n, um, d = nn_.load(TIF); bm = nn_.blue_mask(d); os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    np.savez_compressed(CACHE, c=c, n=n, um=um or 0.0, bm=bm); return c, n, um, bm

def finders():
    f = {'fill': (nor3.segment_fill, nor3.P3), 'walk': (nor3.segment_walk, nor3.P2), 'blobs': (nor3.segment, nor3.P)}
    try:
        import nor_tl; f['tl'] = (nor_tl.segment_tl, nor_tl.PT)
    except ImportError:
        pass
    try:
        import nor_rf; f['rf'] = (nor_rf.segment_rf, nor_rf.PR); f['tl_post'] = (nor_rf.segment_tl_post, nor_tl.PT)
    except ImportError:
        pass
    return f

def parse(spec):
    """'fill:half=0.3,bend=20' -> ('fill', {'half': 0.3, 'bend': 20})"""
    name, _, rest = spec.partition(':'); ov = {}
    for kv in filter(None, rest.split(',')):
        k, v = kv.split('='); ov[k] = json.loads(v)
    return name, ov

def run(spec, data=None):
    name, ov = parse(spec); fn, P = finders()[name]
    c, n, um, bm = data or load()
    t = time.time(); cands, info = fn(c, n, bm, dict(P, **ov)); info['secs'] = time.time() - t
    return cands, info

def score(cands, labels):
    ps = np.array([(k['cx'], k['cy']) for k in cands if k['fail'] is None]).reshape(-1, 2)
    al = np.array([(k['cx'], k['cy']) for k in cands]).reshape(-1, 2)
    tp = fp = fn = 0; missed = []
    for L in labels:
        if L['label'] is None: continue
        hit = len(ps) and np.hypot(*(ps - (L['x'], L['y'])).T).min() <= MATCH_PX
        if L['label'] == 1:
            if hit: tp += 1
            else:
                fn += 1
                dd = np.hypot(*(al - (L['x'], L['y'])).T) if len(al) else np.array([1e9])
                j = int(dd.argmin()); why = cands[j]['fail'] if dd[j] <= MATCH_PX else 'not found'
                missed.append((L, why, j if dd[j] <= MATCH_PX else None))
        elif hit: fp += 1
    return dict(tp=tp, fp=fp, fn=fn, prec=tp / max(1, tp + fp), rec=tp / max(1, tp + fn)), missed

def summary(spec, cands, info, sc, missed):
    from collections import Counter
    fails = Counter(k['fail'] or 'pass' for k in cands)
    shown = sum(v for k, v in fails.items() if k != 'no green')
    lett = ' '.join(f"{nor3.REASONS[k][0]}{v}" for k, v in sorted(fails.items(), key=lambda x: -x[1]) if k in nor3.REASONS)
    why = Counter(m[1] for m in missed)
    whys = ' '.join(f"{nor3.REASONS[k][0] if k in nor3.REASONS else k}:{v}" for k, v in why.items())
    return (f"{spec:34s} pass {fails['pass']:4d}/{shown:4d} | P {sc['prec']:.2f} R {sc['rec']:.2f} "
            f"(tp {sc['tp']} fp {sc['fp']} fn {sc['fn']}) | {lett} | missed-by {whys} | {info['secs']:.0f}s")

# ---------- review sheets ----------
def _rgb(c, n):
    rgb = np.zeros(c.shape + (3,), np.uint8); rgb[..., 0] = nn_.to8(n); rgb[..., 1] = nn_.to8(c); return rgb

def _tile(rgb, k, S=24, Z=4, outline=True, color=(255, 255, 0)):
    H, W = rgb.shape[:2]; cx, cy = int(round(k['cx'])), int(round(k['cy']))
    y0, x0 = cy - S // 2, cx - S // 2; t = np.zeros((S, S, 3), np.uint8)
    a, b, c_, d = max(0, y0), max(0, x0), min(H, y0 + S), min(W, x0 + S)
    t[a - y0:c_ - y0, b - x0:d - x0] = rgb[a:c_, b:d]
    t = np.repeat(np.repeat(t, Z, 0), Z, 1)
    if outline and 'red' in k:
        by, bx = k['box']; m = np.zeros((S, S), bool)
        for seg in [k['red']] + list(k.get('greens', [])):
            ys, xs = np.nonzero(seg); ys = ys + by - y0; xs = xs + bx - x0
            ok = (ys >= 0) & (ys < S) & (xs >= 0) & (xs < S); m[ys[ok], xs[ok]] = True
        from scipy import ndimage as ndi
        M = np.repeat(np.repeat(m, Z, 0), Z, 1); ring = M & ~ndi.binary_erosion(M)
        t[ring] = (0.4 * t[ring] + 0.6 * np.array(color)).astype(np.uint8)
    return t

def sheet(tiles, labels, path, cols=12, title=''):
    if not tiles: return
    h, w = tiles[0].shape[:2]; R = (len(tiles) + cols - 1) // cols
    im = Image.new('RGB', (cols * (w + 2), R * (h + 2) + 18), (50, 50, 50)); d = ImageDraw.Draw(im)
    f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 11)
    d.text((4, 2), title, fill=(255, 255, 255), font=f)
    for i, (t, l) in enumerate(zip(tiles, labels)):
        r, q = divmod(i, cols); X, Y = q * (w + 2), 18 + r * (h + 2)
        im.paste(Image.fromarray(t), (X, Y)); d.text((X + 2, Y + 1), l, fill=(255, 255, 0), font=f)
    im.save(path)

def sheets(out, cands, missed, data, per=48):
    os.makedirs(out, exist_ok=True); rgb = _rgb(data[0], data[1])
    ok = [k for k in cands if k['fail'] is None]
    sheet([_tile(rgb, k, color=(255, 105, 200)) for k in ok[:per]], [str(i) for i in range(len(ok))], f'{out}/pass.png',
          title=f'passes (first {per} of {len(ok)}, brightest red first)')
    for reason, (L, _) in nor3.REASONS.items():
        rj = [k for k in cands if k['fail'] == reason]
        if not rj: continue
        rj.sort(key=lambda k: -k.get('red_mean', 0))   # the most convincing rejects first: that is where false negatives hide
        sheet([_tile(rgb, k, color=(0, 140, 255)) for k in rj[:per]], [f'{L}{i}' for i in range(len(rj))], f'{out}/reject_{L}.png',
              title=f'{L}: {nor3.REASON_TEXT[reason]} ({len(rj)}, strongest red first)')
    if missed:
        ts = []
        for L_, why, j in missed:
            k = cands[j] if j is not None else {'cx': L_['x'], 'cy': L_['y']}
            ts.append(_tile(rgb, k, color=(0, 140, 255)))
        sheet(ts, [(nor3.REASONS[w][0] if w in nor3.REASONS else '-') + str(L_['id']) for L_, w, _ in missed],
              f'{out}/missed.png', title='labelled real NoRs this run missed (letter = why, - = never a candidate)')

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('cmd'); ap.add_argument('specs', nargs='*')
    ap.add_argument('--sheets'); ap.add_argument('--labels', default=LABELS); a = ap.parse_args()
    labels = json.load(open(a.labels)); data = load()
    if a.cmd == 'diff':
        # only look at what a change changed: passes gained and passes lost, as two small sheets
        (ca, _), (cb, _) = run(a.specs[0], data), run(a.specs[1], data)
        pa = [k for k in ca if k['fail'] is None]; pb = [k for k in cb if k['fail'] is None]
        near = lambda k, S: any(abs(k['cx'] - q['cx']) + abs(k['cy'] - q['cy']) <= MATCH_PX for q in S)
        gained = [k for k in pb if not near(k, pa)]; lost = [k for k in pa if not near(k, pb)]
        lost_why = [next((q['fail'] for q in cb if abs(k['cx'] - q['cx']) + abs(k['cy'] - q['cy']) <= MATCH_PX), None) for k in lost]
        rgb = _rgb(data[0], data[1]); out = a.sheets or 'lab_diff'; os.makedirs(out, exist_ok=True)
        sheet([_tile(rgb, k, color=(255, 105, 200)) for k in gained], [f'+{i}' for i in range(len(gained))], f'{out}/gained.png',
              title=f'{len(gained)} new passes with {a.specs[1]} vs {a.specs[0]}')
        sheet([_tile(rgb, k, color=(0, 140, 255)) for k in lost],
              [f'-{i}' + (nor3.REASONS[w][0] if w in nor3.REASONS else '') for i, w in enumerate(lost_why)], f'{out}/lost.png',
              title=f'{len(lost)} passes lost with {a.specs[1]} (letter = new reason)')
        print(f'gained {len(gained)}, lost {len(lost)} -> {out}/gained.png, lost.png'); return
    if a.cmd == 'ablate':
        # data-based keep/drop: paired bootstrap over the labelled spots, base vs each variant
        base, *vars_ = a.specs; Ls = [L for L in labels if L['label'] is not None]
        y = np.array([L['label'] for L in Ls]); rng = np.random.default_rng(0); B = 2000
        idx = rng.integers(0, len(Ls), (B, len(Ls)))
        def hits(spec):
            cands, info = run(spec, data)
            ps = np.array([(k['cx'], k['cy']) for k in cands if k['fail'] is None]).reshape(-1, 2)
            h = np.array([len(ps) > 0 and np.hypot(*(ps - (L['x'], L['y'])).T).min() <= MATCH_PX for L in Ls])
            return h, sum(k['fail'] is None for k in cands), info['secs']
        def f1(h, yy):
            tp = (h & (yy == 1)).sum(-1); fp = (h & (yy == 0)).sum(-1); fn = (~h & (yy == 1)).sum(-1)
            return 2 * tp / np.maximum(1, 2 * tp + fp + fn)
        hb, nb, sb = hits(base); fb = f1(hb[idx], y[idx])
        print(f"{'variant':36s} pass   tp  fp   F1    dF1  P(better) verdict")
        print(f"{base:36s} {nb:4d} {(hb & (y == 1)).sum():4d} {(hb & (y == 0)).sum():3d}  {f1(hb, y):.3f}   base")
        for v in vars_:
            hv, nv, sv = hits(v); d = f1(hv[idx], y[idx]) - fb; pb = float((d > 0).mean() + 0.5 * (d == 0).mean())
            dd = f1(hv, y) - f1(hb, y)
            verdict = 'variant better' if pb >= 0.8 else 'base better' if pb <= 0.2 else 'no evidence'
            print(f"{v:36s} {nv:4d} {(hv & (y == 1)).sum():4d} {(hv & (y == 0)).sum():3d}  {f1(hv, y):.3f} {dd:+.3f}  {pb:5.2f}   {verdict}", flush=True)
        return
    for spec in (a.specs or ['fill']):
        cands, info = run(spec, data); sc, missed = score(cands, labels)
        print(summary(spec, cands, info, sc, missed), flush=True)
        if a.sheets: sheets(a.sheets if len(a.specs) <= 1 else os.path.join(a.sheets, spec.replace(':', '_')), cands, missed, data)

if __name__ == '__main__':
    main()
