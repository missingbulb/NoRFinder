# Extraction lab — versioned vessel-extraction algorithms

Several extraction algorithms live here side by side, the way NOR Finder keeps its finders: each
version is one `vN_*.py` file, none is deleted when a newer one wins, and every version is run and
scored the same way. Every direction tried, kept or dropped, and every idea not yet tried, is in
[LEDGER.md](LEDGER.md). Before starting a new version, follow the
[algorithm-ideation](../../../../.claudinite/local/packs/nor-finder/skills/algorithm-ideation/SKILL.md)
skill.

_Last updated 2026-11-04._

## Run

```
python3 analysis/stack_sources.py                            # the owner's stacks into data/raw/
python3 analysis/extraction/lab.py cmp                    # every version on every stack: score table
python3 analysis/extraction/lab.py grade                  # every version against the provisional labels
python3 analysis/extraction/lab.py grade --json web/algorithm_metrics.json   # ... and the precision and recall the page shows
python3 analysis/extraction/lab.py render v1 v5 --stack cd31_frontal_x20_r_1_slices1-12 --out cmp.png [--box X0 Y0 X1 Y1] [--ids]
python3 analysis/extraction/lab.py run v5 STACK.tif OUT.vessels.json   # a model for the MicroViewer
```

Runs are cached in `runs/` (not committed), keyed by the version's source, the scorer and the
tracer, so an unchanged version is not re-run.

A performance pass keeps a change only when every model is bit-for-bit the same:

```
python3 analysis/extraction/perf.py snapshot            # before: each version on each stack, time, peaks, signature
python3 analysis/extraction/perf.py check               # after: same signature? faster? lower peaks?
python3 analysis/extraction/perf.py profile v5 --stack cd31_frontal_x20_r_1_slices1-12
NODE_PATH=DIR/node_modules node analysis/extraction/perf_pyodide.mjs STUDY STACK.tif v5   # the same run in the page's Pyodide
```

## Where things stand

- **Default: v5** (`lab.py` `DEFAULT`). The study's page offers every version, the default first,
  and runs the one chosen on the stack open (`lab.run_volume`, as `run` does from a file), in the
  page's Python: a new version file and its `VERSIONS` entry are all it takes to offer one there.
  The file's `TITLE` and `ICON` are its name and icon in the page's list, `STEPS` (a Markdown
  outline) its How the algorithm works; its docstring stays the developer's account. The site's build
  lists them from the source without importing it (`menu.py`), so they, `VERSIONS`, `DEFAULT` and
  `RETIRED` stay plain literals. The list shows
  each version's precision and recall from `web/algorithm_metrics.json`, which `grade --json`
  writes; a test fails when a version's source has changed since. `RETIRED` (in `lab.py`) names
  the versions the page no longer offers and why: v1, since 2026-11-04.
- **One preparation per run.** Each version builds on the one before, so `lab.run_volume` opens a
  `vessel_model.shared` block: the flattened signal and depth, the masks and the ridge map are
  computed once for the whole chain and the scorer, and the stack is read slice by slice, never
  copied whole (see the ledger's performance pass, P1-P4).
- **Two judges, neither the owner.** `score.py` gives a *plausibility* from the pixels under each
  edge and from biology invariants (no short loops, mostly bifurcations, wide branch angles, one
  taper direction per junction). `labels/fable-v1.json` holds a model's (Fable's) verdicts on 232
  traced curves in five tiles across the four stacks: provisional ground truth, a proxy until the
  owner's corrected models exist. Plausibility alone is not enough: an early v2 raised it from 0.01
  to 0.69 on CA1 r2 by deleting real thick vessels (ledger, L2).
- **Every version writes start and end widths**: `r_a`, `r_b` on each edge (µm, measured across
  the vessel and fitted as a straight taper) and `taper_known` where the taper is more than noise.
  The format stays `vessel-model/2`; the fields are optional (see `vessel_model.py` `ABOUT`).
- **Flow direction is not inferred.** The edge field `flow` (`"ab"`/`"ba"`) is reserved for when
  it is known: narrowing runs with the flow in arterioles but against it in venules, and CD31 alone
  does not tell them apart.

## Files

| File | What |
|---|---|
| `lab.py` | The version registry and the one CLI: run, cmp, render, grade |
| `perf.py`, `perf_pyodide.mjs` | The performance pass: time and peak memory of every version, in Python and in the page's Pyodide, and the bit-for-bit check |
| `score.py` | Plausibility score and the width/taper measurement every version shares |
| `render.py` | Model over the flattened stack: cyan edges, amber where the score flags them, violet candidates, magenta junctions |
| `fake_truth.py` | Judge tiles for a model to label, and the grader against those labels |
| `labels/` | Provisional labels (model-judged), one file per labelling round |
| `v1_flat_skeleton.py` … `v5_no_short_islands.py` | The versions; each docstring says what it adds |
