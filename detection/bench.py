"""Time and memory of every finder along the web page's path (interactive.Session), natively.

  python3 bench.py [FINDER ...] [--reps N] [--json OUT]

Each finder runs in its own subprocess so peak RSS is its own. Stages, as the page runs them:
load (read the .tif) -> blue mask -> detect (finder + packing segments) -> first refilter.
Reports min-of-N wall time per stage, peak RSS of the process, and the peak of Python/numpy
allocations during detect alone (tracemalloc, a separate run because it slows things down).
The same script runs under Pyodide via browser/bench_pyodide.mjs (RSS is then not available).
"""
import os, sys, json, time, subprocess, tracemalloc
try:
    import resource
except ImportError:   # Pyodide
    resource = None
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)


def rss_mb():
    try:
        return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    except Exception:   # no resource module, or no RSS (Pyodide: see the wasm heap instead)
        return None


def one(finder, reps, tif):
    import interactive, naive_nor as nn_
    out = dict(finder=finder)
    t = time.time(); c, n, um, d = nn_.load(tif); out['load'] = time.time() - t
    t = time.time(); bm = nn_.blue_mask(d); out['blue_mask'] = time.time() - t
    out['rss_after_load_mb'] = rss_mb()
    S = interactive.Session.__new__(interactive.Session)
    S.caspr, S.nav, S.um, S.dapi, S.bm = c, n, um, d, bm
    S.cands, S.P, S.finder = [], {}, None
    det, ref = [], []
    for _ in range(reps):
        t = time.time(); meta, seg = S.detect(finder); det.append(time.time() - t)
        t = time.time(); S.refilter({'values': {}, 'off': []}); ref.append(time.time() - t)
    out['detect'], out['refilter'] = min(det), min(ref)
    out['cands'] = len(S.cands); out['passes'] = sum(c['fail'] is None for c in S.cands)
    out['meta_mb'], out['seg_mb'] = len(meta) / 2**20, len(seg) / 2**20
    out['rss_peak_mb'] = rss_mb()
    del meta, seg
    tracemalloc.start(); S.detect(finder); cur, peak = tracemalloc.get_traced_memory(); tracemalloc.stop()
    out['detect_alloc_peak_mb'] = peak / 2**20
    out['held_cands_mb'] = cur / 2**20   # what stays allocated after detect: the candidate list
    return out


def main():
    import nor_lab
    args = sys.argv[1:]; reps = 3; js = None
    if '--reps' in args:
        i = args.index('--reps'); reps = int(args[i + 1]); del args[i:i + 2]
    if '--json' in args:
        i = args.index('--json'); js = args[i + 1]; del args[i:i + 2]
    if args and args[0] == '--one':
        print('RESULT ' + json.dumps(one(args[1], reps, nor_lab.TIF))); return
    import interactive
    finders = args or list(interactive.FINDERS)
    rows = []
    for f in finders:
        if 'pyodide' in sys.modules or sys.platform == 'emscripten':
            r = one(f, reps, nor_lab.TIF)
        else:
            p = subprocess.run([sys.executable, __file__, '--one', f, '--reps', str(reps)], capture_output=True, text=True)
            line = [l for l in p.stdout.splitlines() if l.startswith('RESULT ')]
            if not line:
                print(f, 'failed:', p.stderr[-800:]); continue
            r = json.loads(line[0][7:])
        rows.append(r)
        tot = r['load'] + r['blue_mask'] + r['detect'] + r['refilter']
        rss = f"{r['rss_peak_mb']:.0f}" if r.get('rss_peak_mb') else '-'
        print(f"{f:6s} load {r['load']:.2f}s  mask {r['blue_mask']:.2f}s  detect {r['detect']:.2f}s  refilter {r['refilter']:.3f}s"
              f"  total {tot:.1f}s | RSS peak {rss} MB, detect alloc peak {r['detect_alloc_peak_mb']:.0f} MB,"
              f" held {r['held_cands_mb']:.0f} MB | {r['passes']}/{r['cands']} pass", flush=True)
    if js:
        json.dump(rows, open(js, 'w'), indent=1)


if __name__ == '__main__':
    main()
