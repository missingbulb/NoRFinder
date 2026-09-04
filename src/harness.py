"""Transform-invariance harness (R2). Needs no ground truth: it tests the detector against itself."""
import numpy as np, nor


def run(caspr, nav, p=nor.P):
    ref, info = nor.detect(caspr, nav, p)
    unit = info['unit']
    rows = []
    for t in nor.transforms(caspr.shape):
        c2 = t.apply(caspr); n2 = t.apply(nav)
        valid = t.apply(np.ones_like(caspr), order=0) > 0.5
        got, gi = nor.detect(c2, n2, p, valid=valid)
        back = t.inv_points([[g['cy'], g['cx']] for g in got])
        a = nor.agree(ref, back, unit)
        det = np.linalg.det(t.M)
        rows.append(dict(name=t.name, exact=t.name in nor.EXACT, n_ref=len(ref), n_got=len(got),
                         unit_ratio=gi['unit'] / unit if unit == unit else np.nan,
                         scale=np.sqrt(abs(det)), **a))
    return ref, unit, rows


def table(rows):
    hdr = f"{'transform':<10} {'ref':>4} {'got':>4} {'match':>6} {'miss':>5} {'spur':>5} {'rms/u':>6} {'unit×':>6}"
    out = [hdr, '-' * len(hdr)]
    for r in rows:
        rms = '' if r['rms'] != r['rms'] else f"{r['rms']:.2f}"
        out.append(f"{r['name']:<10} {r['n_ref']:>4} {r['n_got']:>4} {r['matched']:>6} "
                   f"{r['missed']:>5} {r['spurious']:>5} {rms:>6} {r['unit_ratio']:>6.2f}")
    return '\n'.join(out)
