"""Performance pass tool: a speed-up is kept only if the finder's output is bit-for-bit the same.

  python3 perf.py snapshot SPEC     save output signature + time before touching the code (.cache/perf/)
  python3 perf.py check SPEC        rerun: same signature? faster? (exit 1 if the output changed)
  python3 perf.py profile SPEC      top hotspots (cumulative time), to pick what to optimise

Procedure (see the nor-detection-iteration skill, 'Performance pass'):
  1. snapshot  2. profile  3. change ONE hotspot  4. check  5. keep only if signature equal and
  faster by >= 5 %; otherwise revert  6. log the attempt (kept or not) in detection/lab/ledger.md.
"""
import os, sys, json, time, hashlib, cProfile, pstats, io
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import numpy as np, nor_lab

DIR = os.path.join(HERE, '.cache', 'perf')   # timings are per machine: never committed


def signature(cands):
    """Hash of every candidate's position, verdict and exact segment pixels."""
    h = hashlib.sha256()
    for c in sorted(cands, key=lambda c: (round(c['cy'], 3), round(c['cx'], 3))):
        h.update(f"{c['cy']:.3f},{c['cx']:.3f},{c['fail']},{c['box']}".encode())
        for m in [c['red']] + list(c.get('greens', [])):
            h.update(np.packbits(m).tobytes()); h.update(str(m.shape).encode())
    return h.hexdigest()


def timed(spec, data, reps=3):
    ts = []
    for _ in range(reps):
        t = time.time(); cands, _ = nor_lab.run(spec, data); ts.append(time.time() - t)
    return cands, min(ts)


def main():
    cmd, spec = sys.argv[1], sys.argv[2]; data = nor_lab.load()
    os.makedirs(DIR, exist_ok=True); f = os.path.join(DIR, spec.replace(':', '_').replace('"', '') + '.json')
    if cmd == 'profile':
        pr = cProfile.Profile(); pr.enable(); nor_lab.run(spec, data); pr.disable()
        s = io.StringIO(); pstats.Stats(pr, stream=s).sort_stats('cumtime').print_stats(15); print(s.getvalue()[-3500:]); return
    cands, secs = timed(spec, data); sig = signature(cands)
    if cmd == 'snapshot':
        json.dump(dict(spec=spec, sig=sig, secs=secs, n=len(cands)), open(f, 'w'))
        print(f'snapshot {spec}: {secs:.2f}s, {len(cands)} candidates, sig {sig[:12]}'); return
    old = json.load(open(f)); same = sig == old['sig']
    print(f"{spec}: {old['secs']:.2f}s -> {secs:.2f}s ({(secs / old['secs'] - 1) * 100:+.0f}%), output {'IDENTICAL' if same else 'CHANGED'}")
    sys.exit(0 if same else 1)


if __name__ == '__main__':
    main()
