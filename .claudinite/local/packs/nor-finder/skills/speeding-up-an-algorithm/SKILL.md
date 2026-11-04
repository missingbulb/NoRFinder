---
name: speeding-up-an-algorithm
description: A performance pass on a study's algorithm - time and peak memory, in raw Python and in the page's Pyodide - that keeps a change only when the output is bit-identical. Use at the end of a long stretch of algorithm work, when a lab run creeps past what a feedback round tolerates, or when asked for performance or memory analysis. Not deployment sizing (memory limits, instance sizes, device ports).
metadata:
  body: workflow
  usage:
    expect: judgment
---

# Speeding up an algorithm

Quality comes first. A performance pass is its own step, after a stretch of quality work, and it
never runs while the owner waits on a result. The one exception is a lab run that has crept past
what a feedback round can tolerate (the seconds at the end of the lab's summary line show it): say
so and spend one cycle on it. "The ledger" is the study's own, named in its warm-up.

## 1. Snapshot, profile, change one hotspot, check

Each study has a perf tool. On NoR:

```
cd studies/nor/detection && python3 perf.py snapshot tl
```

```
cd studies/nor/detection && python3 perf.py profile tl
```

```
cd studies/nor/detection && python3 perf.py check tl
```

On vascular (run from `studies/vascular/`), the same three subcommands are listed in
`analysis/extraction/README.md`.

1. `snapshot` the version before touching it.
2. `profile`, and pick the top hotspot.
3. Change that one hotspot.
4. `check`. Keep the change only if the signature is identical **and** it is at least 5% faster or
   lower in peak, with neither number worse by more than that. Otherwise revert it from this pass.
   If the change looks like a better algorithm, re-propose it as a version through
   [image-algorithm-development](../image-algorithm-development/SKILL.md)'s inner loop, never as
   performance. A lower-precision dtype is the classic trap: it is faster, but it changes ties, and
   the signature catches that.
5. Log the attempt, kept or reverted, in the ledger's performance table (NoR: `lab/ledger.md` §4),
   with the time and the peak before and after. Add a peak column where the table lacks one.

A study without a perf tool gets one before its first pass. Copy the closer of the two. It must
give a signature over the outputs themselves (never a summary count), the minimum time of a few
runs, the tracemalloc peak in a separate run, and a non-zero exit when the signature moved.

## 2. Read the numbers honestly

- Re-check a small gain before claiming it: on the session container, run-to-run noise reached
  ±15% (NoR ledger §4).
- Weigh speed bought with a higher peak; never wave it through. A lower peak with identical output
  and no slowdown is a gain on its own.
- The page's Pyodide never returns memory, so its heap after a run is the tab's peak for as long as
  the tab stays open. Free each whole-image array after its last use, and read the few values needed
  later rather than keeping full-size copies. Confirm a pass there, after raw Python:

  ```
  cd studies/nor/detection/browser && npm i --prefix . pyodide@314.0.7 && node bench_pyodide.mjs tl
  ```

  Vascular's `analysis/extraction/perf_pyodide.mjs` header gives its invocation. The number to
  read is the heap after the run.
