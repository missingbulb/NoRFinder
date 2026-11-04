#!/usr/bin/env python3
"""Performance pass tool for the extraction versions: a speed-up is kept only if the model is bit-for-bit the same.

    python3 analysis/extraction/perf.py snapshot [VERSION ...] [--stacks NAME ...]   save signature, time and peaks (runs/perf/)
    python3 analysis/extraction/perf.py check [VERSION ...] [--stacks NAME ...]      rerun: same signature? faster? lower peaks?
    python3 analysis/extraction/perf.py profile VERSION --stack NAME                  top hotspots by cumulative time

Each version runs on each stack in its own subprocess, as the page runs it (lab.run_volume on the CD31 as float32),
so the process's peak RSS is that run's own. Three numbers per run: wall time (the best of --reps), the peak of
Python and numpy allocations during the run (tracemalloc, in a separate pass because tracing slows it), and the
peak RSS over what the loaded stack already held. The peaks matter as much as the time on the page: WebAssembly
memory never shrinks, so the tab keeps the run's peak after it ends. The signature hashes the whole model file,
score card included, leaving out only the run's own seconds.
"""
import argparse, cProfile, hashlib, io, json, os, pstats, subprocess, sys, time, tracemalloc

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..'))
DIR = os.path.join(HERE, 'runs', 'perf')   # timings are per machine: never committed


def signature(m):
    m = json.loads(json.dumps(m))
    m.get('score', {}).pop('seconds', None)
    return hashlib.sha256(json.dumps(m, sort_keys=True, separators=(',', ':')).encode()).hexdigest()[:16]


def rss_mb():
    import resource
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024


def one(version, path, reps):
    """Run in the child: the measurements of one version on one stack, as JSON on stdout."""
    import numpy as np
    import lab
    import vessel_model as vm
    vol, um, z_step = vm.read_cd31(path, None)
    vol = np.ascontiguousarray(vol, np.float32)
    name = os.path.basename(path)
    base = rss_mb()
    ts = []
    for _ in range(reps):
        t = time.perf_counter(); m, _ = lab.run_volume(version, vol, um, name, z_step); ts.append(time.perf_counter() - t)
    rss = rss_mb() - base
    tracemalloc.start()
    try:
        lab.run_volume(version, vol, um, name, z_step)
        traced = tracemalloc.get_traced_memory()[1] / 2 ** 20
    finally:
        tracemalloc.stop()
    return dict(version=version, stack=name[:-4], seconds=round(min(ts), 2), peak_mb=round(traced, 1), rss_mb=round(rss, 1),
                stack_mb=round(vol.nbytes / 2 ** 20, 1), signature=signature(m), edges=len(m['edges']))


def measure(versions, names, reps):
    import lab
    rows = []
    for name, path in lab.stacks(names).items():
        for v in versions:
            out = subprocess.run([sys.executable, __file__, '_one', v, path, str(reps)], capture_output=True, text=True)
            if out.returncode:
                raise SystemExit(out.stderr)
            rows.append(json.loads(out.stdout.strip().splitlines()[-1]))
            r = rows[-1]
            print(f"{r['stack']:40s} {v}  {r['seconds']:7.2f} s  peak {r['peak_mb']:7.1f} MB  rss +{r['rss_mb']:7.1f} MB  {r['signature']}", flush=True)
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    for c in ('snapshot', 'check'):
        p = sub.add_parser(c); p.add_argument('versions', nargs='*'); p.add_argument('--stacks', nargs='*'); p.add_argument('--reps', type=int, default=2)
        p.add_argument('--name', default='baseline', help='the snapshot to save or compare against')
    p = sub.add_parser('profile'); p.add_argument('version'); p.add_argument('--stack', required=True); p.add_argument('--top', type=int, default=30)
    p = sub.add_parser('_one'); p.add_argument('version'); p.add_argument('path'); p.add_argument('reps', type=int)
    a = ap.parse_args()
    if a.cmd == '_one':
        print(json.dumps(one(a.version, a.path, a.reps)))
        return
    import lab
    if a.cmd == 'profile':
        import vessel_model as vm
        path = lab.stacks([a.stack])[a.stack]
        vol, um, z_step = vm.read_cd31(path, None)
        pr = cProfile.Profile(); pr.enable()
        lab.run_volume(a.version, vol, um, a.stack, z_step)
        pr.disable()
        s = io.StringIO(); pstats.Stats(pr, stream=s).strip_dirs().sort_stats('cumulative').print_stats(a.top); print(s.getvalue())
        return
    versions = a.versions or list(lab.VERSIONS)
    rows = measure(versions, a.stacks, a.reps)
    os.makedirs(DIR, exist_ok=True)
    f = os.path.join(DIR, a.name + '.json')
    if a.cmd == 'snapshot':
        json.dump(rows, open(f, 'w'), indent=1)
        print('saved', f)
        return
    before = {(r['stack'], r['version']): r for r in json.load(open(f))}
    changed = 0
    print('\n| stack | version | seconds | peak MB | rss MB | output |\n|---|---|---|---|---|---|')
    for r in rows:
        b = before.get((r['stack'], r['version']))
        if not b:
            continue
        same = b['signature'] == r['signature']
        changed += not same
        pct = lambda k: f"{b[k]} → {r[k]} ({(r[k] - b[k]) / max(b[k], 1e-9) * 100:+.0f}%)"
        print(f"| {r['stack']} | {r['version']} | {pct('seconds')} | {pct('peak_mb')} | {pct('rss_mb')} | {'same' if same else 'CHANGED'} |")
    sys.exit(1 if changed else 0)


if __name__ == '__main__':
    main()
