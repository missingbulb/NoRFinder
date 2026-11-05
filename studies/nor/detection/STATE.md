# NoR detection: current state

Read this first, then `lab/ledger.md` (everything tried, with verdicts). The method is the
`image-algorithm-development` skill in this repo's local pack; what counts as a NoR is
[`studies/nor/docs/requirements.md`](../docs/requirements.md) R7. Update this file in the PR that changes the
state.

_Last updated 2026-10-06._

## Setup
1. `python3 -m pip install -r requirements.txt`
2. `python3 studies/nor/detection/ground_truth.py fetch`: fetches the reference slide
   (`Slide5_4AP_NoR.sld - Slice1_up_left2.tif`) and every image submitted ground truth was marked on
   into `data/raw/`, which is never committed.
3. `cd studies/nor/detection && python3 nor_lab.py cmp tl rf`. The first run builds `.cache/` (image plus blue
   mask, never committed); after that a run takes about 5-10 s.

## Where things stand
- **Default finder: traffic light** (`nor_tl.py`, spec `tl`). 206 passes from 463 candidates.
  On the labels: 47 real found, 4 false (P 0.92, R 0.65); on the page path 46 / 5. Since
  2026-11-04 it fails its image's faintest tenth of passes (R7, ledger §6 M1a; `red_floor_q=0` turns it off).
- **Red-first finder** (`nor_rf.py`, spec `rf`), built on 2026-09-27 from Ariel's idea, with
  the verdicts in ledger §2 applied. 48 real found, 9 false. That ties tl (P(better) 0.48), so
  tl stays the default.
- **Blue (DAPI) mask:** approved by Ariel for Slide5. It works post hoc in rf and `tl_post`,
  and pre hoc (the original way) in tl. Post hoc: fail only when ≥80% of the red lies on the mask.
- **Labels:** `lab/labels_claude_v1.json`, 200 spots labelled by Claude's eye (72 real, 93 not,
  35 unsure), **not by Ariel**. A pass within 5 px of a spot counts as that spot. With 72 real
  spots, a difference of 1-2 is noise.
- **Curated ground truth** (R10, moved to Drive 2026-11-05): people mark candidates (thumbs up/down)
  and missed NoRs on the page and submit them to the study's submissions folder on Drive; a Data
  Manager accepts them into its curated folder (`study.json` `groundTruth`, both `null` until the
  owner makes them). `ground_truth.py fetch` takes each image's newest curated file into
  `data/raw/ground-truth/truth/`, never git, and stops when a folder lists 50 entries. Curated files
  outrank the Claude labels wherever both mark a spot, and `ground_truth.py score` / the quality lock
  score every finder on every image. None has arrived yet.
- **Precision and recall per finder and filter preset** (R11, 2026-10-06):
  `../web/finder_metrics.json`, written by `finder_metrics.py` (and by every baseline rewrite), naming
  the data it was measured on: each image's and ground-truth file's SHA-256 and the dataset SHA. Quote
  that dataset SHA with any precision or recall.
  Presets: precise / balanced (the finder's own) / recalling, every filter 40% towards a fixed
  strict or loose end. Fitting filter values to the labels does not survive held-out labels
  (ledger §5), so don't tune filters per finder on these labels.
- **Filters are not finder-specific** (ledger §5): tl's filter values score as well as or better
  than each finder's own on all five finders. Each finder still opens on its own values.
- **Only one image has been processed.**
- **Browser page** (the shell in `web/` running this study, `studies/nor/requirements.md`): open an image, detect once, then tune every filter
  live. It runs `interactive.py` over the unchanged finders under Pyodide. How it is published
  is the shell's business ([docs/WARMUP.md](../../../docs/WARMUP.md) says how to preview it).
  A finder's `MAIN` tuple names the settings the page shows first; adding a finder to
  `interactive.FINDERS` with a `MAIN` is all the page needs.

## Owner preferences that are fixed (Ariel)
- **The review render is an API.** `render_std.py SPEC OUTDIR` draws every candidate with a
  pink (pass) or blue (fail) 1-px outline around each segment at 3×, a reason letter, numbers
  running top to bottom, white measuring lines, and a legend and list panel. The zoom is always
  x 900-2100, y 1200-2400. Don't change it unless Ariel asks; propose changes for approval.
- **Quality is locked (R9, 2026-09-30).** `studies/nor/tests/test_quality.py` fails when a finder loses a
  labelled real NoR or passes a new not-NoR; CI runs it with every test on each PR. A loss goes
  in only with Ariel's agreement (`python3 studies/nor/tests/test_quality.py --accept`); a local test run
  records gains in `lab/quality_baseline.json`, which the PR must carry.
- **Keep or drop every change by data:** `nor_lab.py ablate BASE VARIANT...`. Log every attempt,
  failures included, in `lab/ledger.md`.
- **Performance pass** at the end of long algorithmic tasks, never on quick fixes where Ariel is
  waiting: `perf.py` (the output must stay identical; it reports time and peak memory, and a
  lower peak is a gain of its own since the page keeps it). See the `speeding-up-an-algorithm` skill.
- **Algorithmic and performance work runs the raw Python finders** (`nor_lab.py`, `perf.py`,
  `bench.py`), never through the web page (2026-09-29). The browser tools in `browser/` only check
  the page's own runtime.
- **Scale-free:** sizes in image units (median green half-length), never absolute pixels.
- **One pixel belongs to at most one NoR.**

## Next
0. **Mutation sweeps** (ledger §6): `python3 mutate.py sweep` splices the repo's trick pool into tl and
   reports what no finder does, above a chance bar of null mutants; the nor-study `mutation-sweep`
   task runs it weekly. M1a (a red floor relative to the image's own passes) is tl's default; grow
   M2 (band-passed Caspr at the candidate stage) once submitted ground truth arrives.
1. The 20 labelled real NoRs that both finders miss (ledger §2 and v10 REPORT): mostly faint
   one-sided paranodes and "not found" spots.
2. Retry C10 (node = red outshining green) once there are more labels.
3. Ariel's submissions from the page (R10) replace the Claude labels spot by spot as they
   arrive (checkpoint H5), so decisions stop resting on Claude's own eye.
4. Performance: every finder was profiled and sped up on 2026-09-29 with identical output (ledger
   §4). Raw Python: tl 3.2 s, rf 6 s, fill 5 s, walk 4.6 s, blobs 2.4 s. A speed-up must never
   change the output (Ariel: no quality loss for performance).

## Files
| file | what |
|---|---|
| naive_nor.py | S0 baseline via nor.detect; `load`, `blue_mask`, `to8` |
| nor3.py | segment checks A-J, `finish`, `measure`, blob/walk/fill finders, `main` (standard render) |
| nor_tl.py | traffic-light finder (default) |
| nor_rf.py | red-first finder; every tested change is a switch in `PR` |
| nor_lab.py | `cmp`, `run --sheets`, `diff`, `ablate` against the labels |
| render_std.py | the standard review render for any spec |
| perf.py | snapshot / profile / check for speed-ups |
| mutate.py | mutation sweeps over the trick pool, and gridded transformed views for a vision agent (`mutating-an-algorithm`, `solving-a-transformed-view` skills) |
| bench.py | time and peak memory of every finder along the page's path (browser/ runs it under Pyodide and on the live page) |
| lab/ | labels, the pool used to draw them (mkpool.py, pool.json), ledger.md, the submitted ground truth (ground_truth/) |
| finder_metrics.py | precision and recall per finder and filter preset (`../web/finder_metrics.json`); `transfer`: every finder with every finder's filter values |
| ground_truth.py | the ground-truth data set: the merged reference per image, `fetch`, `score`, and the daily `ingest` |
| interactive.py | the page's engine: detect once, refilter on stored measurements (spec §3) |
| browser/ | runs the finders in a browser runtime (Pyodide): measured parity, recommendation |
| history.md | how the algorithm got here (stages S0-S10, who drove what) |
