---
name: speeding-up-an-algorithm
description: A performance pass on a study's algorithm - time, peak memory, and the runtimes it ships to - that proves the output bit-identical before keeping anything. Use at the end of a long stretch of algorithm work, when a grader run creeps past what a feedback round tolerates, or when asked for performance or memory analysis.
metadata:
  body: workflow
  usage:
    expect: judgment
---

# Speeding up an algorithm

Every iteration of the quality loops pays in time, tokens, CPU and RAM, and a faster cycle buys
more iterations. Quality still comes first. A performance pass is its own step, after a stretch of
quality work, and never runs while the owner waits on a result. The one exception is a grader run
that has crept past what a feedback round can tolerate: say so and spend one cycle on it. The
per-stage timings in every summary line are the early warning.

Each study has a perf tool (NoR's `studies/nor/detection/perf.py`, vascular's
`studies/vascular/analysis/extraction/perf.py`) with `snapshot`, `profile` and `check`. Use it, and
give a study without one a perf tool before its first pass.

## 1. Snapshot, profile, change one hotspot, check

1. `snapshot` the version before touching it. That records the output signature (a hash of the
   outputs themselves - positions, verdicts, segment pixels - never a summary count), the time and
   the peak memory.
2. `profile`, and pick the top hotspot.
3. Change that one hotspot.
4. `check`. Keep the change only if the signature is identical **and** it is faster, or lower in
   peak, by at least 5%, with neither number worse by more than that. Otherwise revert it.
5. Log the attempt in the ledger, kept or reverted, with the time and the peak before and after.

A change that alters the output is a quality change: score it as one, through the inner loop, and
never pass it off as performance. A lower-precision dtype is the classic trap. It is faster, but it
changes ties, and the hash catches that.

## 2. Measure honestly

- Time the minimum of a few runs. Run-to-run noise on a shared machine can reach ±15%, so re-check a
  small gain before claiming it.
- Measure peak memory in a separate run from the timing, because tracing slows the run. Python's
  `tracemalloc` sees numpy's allocations. Report the peak before and after, like the time. A pass
  that lowers the peak with identical output and no slowdown is a gain on its own. One that buys
  speed with a higher peak is weighed, not waved through.
- **A runtime that never returns memory** (a browser's WebAssembly, Pyodide) keeps the algorithm's
  peak for as long as the tab is open. Free each whole-image array after its last use, and read the
  few values needed later rather than keeping full-size copies.
- Measure in raw Python first, and in the shipped runtime (Pyodide) only to confirm the result
  there.

## 3. Restore the token budget too

If you have been reading full renders to judge iterations, fix the run command's summary line
until the score and the gained and lost sheets are enough.

Deployment is not this pass. Memory limits, instance sizes, job APIs and device ports are their own
tasks with their own measurements. A cost comparison of alternatives (per item, dated list prices,
what leaves the machine) is a table in the docs, not a round's report.
