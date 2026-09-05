"""R2 — the transform-invariance requirement, as an executable test.

Needs no ground truth: it asserts the detector agrees with *itself* under transformation. That is
why it can exist before any annotated data does, and why it says nothing about accuracy — a
detector that finds nothing would be perfectly invariant. Accuracy needs the owner's annotations
and a separate harness.

Run: python3 tests/test_invariance.py
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
import nor
import harness

IMG = os.path.join(os.path.dirname(__file__), '..', 'docs', 'results',
                   'testimg-song-sham-crop.png')

# Tier 2/3 bounds sit a little below the measured envelope in docs/results/README.md, so the test
# reports a regression rather than ordinary jitter. Tier 1 gets no slack, by design.
TIER2_MIN_RECALL = 0.80
TIER3_MIN_RECALL = {'scale0.7': 0.75, 'scale1.5': 0.90, 'scale2.0': 0.90}


def check(rows):
    """Return the list of violations; empty means the requirement holds."""
    bad = []
    for r in rows:
        recall = r['matched'] / max(r['n_ref'], 1)
        if r['exact']:
            # Tier 1: a pixel permutation, no interpolation, so nothing may move at all. Drift
            # here is always a real defect — an asymmetric window, an axis-ordered filter, or a
            # rule that is not chirality-free.
            if r['missed'] or r['spurious'] or r['rms'] > 1e-9:
                bad.append(f"TIER1 {r['name']}: missed={r['missed']} spurious={r['spurious']} "
                           f"rms={r['rms']:.3g} — must be exactly 0")
        elif r['name'].startswith('rot'):
            if recall < TIER2_MIN_RECALL:
                bad.append(f"TIER2 {r['name']}: recall {recall:.2f} < {TIER2_MIN_RECALL}")
        elif r['name'] in TIER3_MIN_RECALL:
            if recall < TIER3_MIN_RECALL[r['name']]:
                bad.append(f"TIER3 {r['name']}: recall {recall:.2f} < {TIER3_MIN_RECALL[r['name']]}")
    return bad


def main():
    ca, nv = nor.load(IMG, 'r', 'b')
    ref, unit, rows = harness.run(ca, nv)
    # Guard against the vacuous pass: an empty detection is invariant and proves nothing.
    assert len(ref) > 20, f'only {len(ref)} reference nodes — the harness is not exercising anything'

    print(harness.table(rows))
    bad = check(rows)
    if bad:
        print('\nFAILED')
        for b in bad:
            print('  ' + b)
        return 1
    n_exact = sum(1 for r in rows if r['exact'])
    print(f'\nOK — {len(ref)} reference nodes; Tier 1 exact on all {n_exact} '
          f'resampling-free transforms.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
