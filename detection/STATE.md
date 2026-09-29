# NoR detection: current state

Read this first, then `lab/ledger.md` (everything tried, with verdicts). The method is the
`image-algorithm-development` skill in this repo's local pack; what counts as a NoR is
[`docs/requirements.md`](../docs/requirements.md) R7. Update this file in the PR that changes the
state.

_Last updated 2026-09-29._

## Setup
1. `python3 -m pip install -r requirements.txt`
2. `python3 src/fetch_data.py -m '*up_left2*'`: fetches the reference slide
   (`Slide5_4AP_NoR.sld - Slice1_up_left2.tif`) into `data/raw/`, which is never committed.
3. `cd detection && python3 nor_lab.py cmp tl rf`. The first run builds `.cache/` (image plus blue
   mask, never committed); after that a run takes about 5-10 s.

## Where things stand
- **Default finder: traffic light** (`nor_tl.py`, spec `tl`). 229 passes from 463 candidates.
  On the labels: 47 real found, 7 false (P 0.87, R 0.65).
- **Red-first finder** (`nor_rf.py`, spec `rf`), built on 2026-09-27 from Ariel's idea, with
  the verdicts in ledger §2 applied. 48 real found, 9 false. That ties tl (P(better) 0.48), so
  tl stays the default.
- **Blue (DAPI) mask:** approved by Ariel for Slide5. It works post hoc in rf and `tl_post`,
  and pre hoc (the original way) in tl. Post hoc: fail only when ≥80% of the red lies on the mask.
- **Labels:** `lab/labels_claude_v1.json`, 200 spots labelled by Claude's eye (72 real, 93 not,
  35 unsure), **not by Ariel**. A pass within 5 px of a spot counts as that spot. With 72 real
  spots, a difference of 1-2 is noise.
- **Only one image has been processed.**
- **Browser page** (`web/`, requirement R8): open an image, detect once, then tune every filter
  live. It runs `interactive.py` over the unchanged finders under Pyodide. It deploys to GitHub
  Pages through the github-pages pack. Preview it locally with `python3 web/build.py` and then
  `python3 -m http.server` from the repo root, opening `/web/`.
  A finder's `MAIN` tuple names the settings the page shows first; adding a finder to
  `interactive.FINDERS` with a `MAIN` is all the page needs.

## Owner preferences that are fixed (Ariel)
- **The review render is an API.** `render_std.py SPEC OUTDIR` draws every candidate with a
  pink (pass) or blue (fail) 1-px outline around each segment at 3×, a reason letter, numbers
  running top to bottom, white measuring lines, and a legend and list panel. The zoom is always
  x 900-2100, y 1200-2400. Don't change it unless Ariel asks; propose changes for approval.
- **Keep or drop every change by data:** `nor_lab.py ablate BASE VARIANT...`. Log every attempt,
  failures included, in `lab/ledger.md`.
- **Performance pass** at the end of long algorithmic tasks, never on quick fixes where Ariel is
  waiting: `perf.py` (the output must stay identical). See the skill.
- **Algorithmic and performance work runs the raw Python finders** (`nor_lab.py`, `perf.py`,
  `bench.py`), never through the web page (2026-09-29). The browser tools in `browser/` only check
  the page's own runtime.
- **Scale-free:** sizes in image units (median green half-length), never absolute pixels.
- **One pixel belongs to at most one NoR.**

## Next
1. The 20 labelled real NoRs that both finders miss (ledger §2 and v10 REPORT): mostly faint
   one-sided paranodes and "not found" spots.
2. Retry C10 (node = red outshining green) once there are more labels.
3. Ask Ariel to correct the Claude labels (checkpoint H5), so decisions stop resting on
   Claude's own eye.
4. Performance: every finder was profiled on 2026-09-29 (ledger §4). In the browser tl now takes
   7 s, rf 12 s, fill 11 s, walk 12 s, blobs 6 s. Next hotspot: `nor3.finish`; the other proposals
   are listed under that profile.

## Files
| file | what |
|---|---|
| naive_nor.py | S0 baseline via src/nor.detect; `load`, `blue_mask`, `to8` |
| nor3.py | segment checks A-J, `finish`, `measure`, blob/walk/fill finders, `main` (standard render) |
| nor_tl.py | traffic-light finder (default) |
| nor_rf.py | red-first finder; every tested change is a switch in `PR` |
| nor_lab.py | `cmp`, `run --sheets`, `diff`, `ablate` against the labels |
| render_std.py | the standard review render for any spec |
| perf.py | snapshot / profile / check for speed-ups |
| bench.py | time and peak memory of every finder along the page's path (browser/ runs it under Pyodide and on the live page) |
| lab/ | labels, the pool used to draw them (mkpool.py, pool.json), ledger.md |
| interactive.py | the page's engine: detect once, refilter on stored measurements (R8) |
| browser/ | runs the finders in a browser runtime (Pyodide): measured parity, recommendation |
| history.md | how the algorithm got here (stages S0-S10, who drove what) |
