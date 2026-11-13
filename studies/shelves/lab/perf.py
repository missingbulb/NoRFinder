"""Performance pass tool: a speed-up is kept only if the finder's output is bit-for-bit the same.

  python3 perf.py snapshot [IDS]   save every input's output signature, then time and peak memory (.cache/perf/)
  python3 perf.py check [IDS]      rerun: same signatures? faster? lower peak? (exit 1 if any output moved)
  python3 perf.py sigs [IDS]       the signatures alone, on a pool of processes (the quick check while working)
  python3 perf.py profile [ID]     top hotspots (cumulative and own time), to pick what to optimise

Procedure (the speeding-up-an-algorithm skill):
  1. snapshot  2. profile  3. change ONE hotspot  4. check  5. keep only if every signature is equal and
  faster by >= 5 % or its peak memory lower by >= 5 %, with neither one worse by more than that;
  otherwise revert  6. log the attempt (kept or not) in the performance table of docs/WARMUP.md.

Inputs: a directory (SHELVES_PERF_DIR, default .cache/perf/inputs) holding `rgb_<id>.npy`, the photo as the page decodes
it, and `tm_<id>.json`, the page's text map for it (`reading/find.mjs`'s text finder, as {text: {data: base64, width,
height}}). The rotated inputs, `r20` and `r90` of `1g4iFN`, are drawn from it by `warp.py`'s own warp, text map included,
so the roll and quarter-turn paths are covered.

The signature is a hash over every box's every field, exactly as the finder returns them, per input. Signatures are
computed on a pool of processes; the minimum time of REPS runs and the tracemalloc peak (a separate run, since tracing
slows it) are measured one input at a time, on the TIMED inputs, the page's slowest and a quick one.
Peak memory is the most the finder has allocated at once: WebAssembly memory never shrinks, so the tab keeps it.
"""
import base64, cProfile, hashlib, io, json, multiprocessing, os, pstats, sys, time, tracemalloc
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'py')); sys.path.insert(0, HERE)
import numpy as np

CACHE = os.path.join(HERE, '.cache', 'perf')   # timings are per machine: never committed
INPUTS = os.environ.get('SHELVES_PERF_DIR', os.path.join(CACHE, 'inputs'))
PHOTOS = ['1HyJrL', '1g4iFN', '1zktX1', '16acjV', '1sdDdH', '16w5nW']
ROTATED = {'r20': ('1g4iFN', 20), 'r90': ('1g4iFN', 90)}
ALL = PHOTOS + list(ROTATED)
TIMED = ['1zktX1', '1g4iFN']
REPS = 3


def textmap(path):
    t = json.load(open(path))['text']
    return np.frombuffer(base64.b64decode(t['data']), np.uint8).reshape(t['height'], t['width']) / 255


def load(pid):
    """(rgb, text) of an input id. A rotated one is drawn once from its photo and kept beside the others."""
    if pid in ROTATED:
        src, deg = ROTATED[pid]
        f = os.path.join(CACHE, f'{pid}.npz')
        if not os.path.exists(f):
            import warp
            rgb, text = load(src)
            m = warp.rotation(deg, rgb.shape[1], rgb.shape[0])
            out, m2, _ = warp.warp(rgb, m)
            big = np.rint(np.asarray(__import__('scipy.ndimage', fromlist=['zoom']).zoom(
                text.astype(np.float32), (rgb.shape[0] / text.shape[0], rgb.shape[1] / text.shape[1]), order=1)) * 255)
            tw, _, _ = warp.warp(np.clip(big, 0, 255).astype(np.uint8)[..., None], m)
            os.makedirs(CACHE, exist_ok=True)
            np.savez(f, rgb=out, text=tw[..., 0].astype(np.float32) / 255)
        z = np.load(f)
        return z['rgb'], z['text']
    return np.load(os.path.join(INPUTS, f'rgb_{pid}.npy')), textmap(os.path.join(INPUTS, f'tm_{pid}.json'))


def signature(boxes):
    """Hash of every box, in the order found, with every field as the finder returns it."""
    h = hashlib.sha256()
    for b in boxes:
        h.update(repr(sorted(b.items())).encode())
    return h.hexdigest()


def run(pid, data=None):
    import books
    rgb, text = data or load(pid)
    return books.find(rgb, text)


def sig_of(pid):
    t = time.time(); boxes = run(pid)
    return pid, signature(boxes), len(boxes), time.time() - t


def timed(pid, reps=REPS):
    data = load(pid); ts = []
    for _ in range(reps):
        t = time.time(); run(pid, data); ts.append(time.time() - t)
    return min(ts)


def peak_mb(pid):
    data = load(pid)
    tracemalloc.start()
    try:
        run(pid, data); return tracemalloc.get_traced_memory()[1] / 2**20
    finally:
        tracemalloc.stop()


def main():
    cmd = sys.argv[1]; ids = sys.argv[2:] or ALL
    os.makedirs(CACHE, exist_ok=True); f = os.path.join(CACHE, 'snapshot.json')
    if cmd == 'profile':
        pid = ids[0]; data = load(pid)
        pr = cProfile.Profile(); pr.enable(); run(pid, data); pr.disable()
        for key in ('cumtime', 'tottime'):
            s = io.StringIO(); pstats.Stats(pr, stream=s).sort_stats(key).print_stats(28); print(s.getvalue()[-5500:])
        return
    for p in ids: load(p)   # draws the rotated inputs before the pool forks
    with multiprocessing.Pool(min(4, len(ids))) as pool:
        sigs = {pid: (s, n) for pid, s, n, _ in pool.map(sig_of, ids)}
    if cmd == 'sigs':
        old = json.load(open(f)); bad = [p for p in ids if sigs[p][0] != old['sigs'][p]]
        print(' '.join(f"{p}:{'same' if p not in bad else 'CHANGED'}" for p in ids)); sys.exit(1 if bad else 0)
    timed_ids = [p for p in TIMED if p in ids]
    secs = {p: timed(p) for p in timed_ids}; peak = {p: peak_mb(p) for p in timed_ids}
    if cmd == 'snapshot':
        old = json.load(open(f)) if os.path.exists(f) else dict(sigs={}, secs={}, peak_mb={})
        old['sigs'].update({p: v[0] for p, v in sigs.items()}); old['secs'].update(secs); old['peak_mb'].update(peak)
        json.dump(old, open(f, 'w'))
        for p in ids:
            print(f"snapshot {p}: {sigs[p][1]} boxes, sig {sigs[p][0][:12]}" + (f", {secs[p]:.2f}s, peak {peak[p]:.0f} MB" if p in secs else ''))
        return
    old = json.load(open(f)); bad = []
    for p in ids:
        same = sigs[p][0] == old['sigs'][p]; bad += [] if same else [p]
        line = f"{p}: {sigs[p][1]} boxes, output {'IDENTICAL' if same else 'CHANGED'}"
        if p in secs:
            was, wp = old['secs'][p], old['peak_mb'][p]
            line += f", {was:.2f}s -> {secs[p]:.2f}s ({(secs[p] / was - 1) * 100:+.0f}%), peak {wp:.0f} -> {peak[p]:.0f} MB ({(peak[p] / wp - 1) * 100:+.0f}%)"
        print(line)
    print('ALL IDENTICAL' if not bad else 'CHANGED: ' + ', '.join(bad))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
