"""Whether a mutation did *any* good: the signal the algorithm-mutation skill reads, for any study.

A mutation is not expected to win. It is flagged as signal when it does more than chance of:

- finding a real ground-truth item that no registered version has ever found (`rescued_never`)
- rejecting a false item that every registered version keeps (`rejected_always`)

`stat_shift` reports how a measured quantity's distribution moved towards the ground truth's; it is
read beside the flag and never sets it.

Everything here works on per-item boolean vectors over the ground truth's graded items, so a study
supplies only "which items did this version keep".
"""
import numpy as np


def hits(kept_xy, items, radius):
    """kept_xy: (N, 2) kept detections; items: [{'x','y',...}]; radius(item) -> px. True per item it lands on."""
    P = np.asarray(kept_xy, float).reshape(-1, 2)
    if not len(P):
        return np.zeros(len(items), bool)
    return np.array([np.hypot(*(P - (L['x'], L['y'])).T).min() <= radius(L) for L in items])


def f1(h, y):
    tp = (h & (y == 1)).sum(-1); fp = (h & (y == 0)).sum(-1); fn = (~h & (y == 1)).sum(-1)
    return 2 * tp / np.maximum(1, 2 * tp + fp + fn)


def p_better(h_base, h_var, y, B=2000, seed=0):
    """paired bootstrap over the graded items: P(variant's F1 > base's)"""
    idx = np.random.default_rng(seed).integers(0, len(y), (B, len(y)))
    d = f1(h_var[idx], y[idx]) - f1(h_base[idx], y[idx])
    return float((d > 0).mean() + 0.5 * (d == 0).mean())


def verdict(p):
    return 'better' if p >= 0.8 else 'worse' if p <= 0.2 else 'no evidence'


def stat_shift(gt, base, mutant):
    """How a measured quantity's distribution moved: Wasserstein-1 distance to the ground truth's, and the
    std ratio, for base and mutant. None where the ground truth carries no such measurement."""
    gt = np.asarray([v for v in gt if v is not None], float)
    if len(gt) < 3:
        return None

    def w1(a):
        a = np.asarray(a, float)
        if len(a) < 3:
            return None
        q = np.linspace(0, 1, 101)
        return float(np.abs(np.quantile(a, q) - np.quantile(gt, q)).mean())
    sd = lambda a: float(np.std(a) / max(np.std(gt), 1e-12)) if len(a) >= 3 else None
    return dict(n_gt=len(gt), w1_base=w1(base), w1_mutant=w1(mutant), sd_ratio_base=sd(base), sd_ratio_mutant=sd(mutant))


def signal(y, registry, base, mutant, chance=None):
    """y: 1/0 per graded item; registry: {version: hit vector} of every registered version (base included);
    base, mutant: hit vectors; chance: (never+, always-) the most that null mutants in the same slot reached,
    which the counts must beat to be signal. Returns the counts and item indices the skill reports."""
    y = np.asarray(y); R = np.array(list(registry.values()))
    never = (y == 1) & ~R.any(0)
    always = (y == 0) & R.all(0)
    out = dict(
        tp=int((mutant & (y == 1)).sum()), fp=int((mutant & (y == 0)).sum()),
        d_tp=int((mutant & (y == 1)).sum() - (base & (y == 1)).sum()),
        d_fp=int((mutant & (y == 0)).sum() - (base & (y == 0)).sum()),
        rescued_never=np.nonzero(never & mutant)[0].tolist(),
        rejected_always=np.nonzero(always & ~mutant)[0].tolist(),
        gained_real=np.nonzero((y == 1) & mutant & ~base)[0].tolist(),
        lost_real=np.nonzero((y == 1) & base & ~mutant)[0].tolist(),
        dropped_false=np.nonzero((y == 0) & base & ~mutant)[0].tolist(),
        added_false=np.nonzero((y == 0) & mutant & ~base)[0].tolist(),
        never_total=int(never.sum()), always_total=int(always.sum()),
    )
    out['p_better'] = p_better(base, mutant, y)
    out['verdict'] = verdict(out['p_better'])
    cn, ca = chance or (0, 0)
    out['chance'] = chance
    out['signal'] = len(out['rescued_never']) > cn or len(out['rejected_always']) > ca
    return out
