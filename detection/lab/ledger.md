# NoR ideas ledger

Every algorithmic direction, change, pitched idea and performance attempt, with its evidence and verdict.
Add a row for **every** attempt, including failures. Keep enough specifics (what, parameters, measured
effect, why it failed) that an idea can be re-tried automatically if the image type, labels or
algorithm change. "Revisit if" says when a dropped idea could come back.

Metric notes: from 2026-09-26 on, numbers are tp/fp against lab/labels_claude_v1.json (72 real, 93 not,
labelled by Claude's eye, not by Ariel). The verdict comes from `nor_lab.py ablate BASE VARIANT`: a paired
bootstrap over the labelled spots. P(better) >= 0.8 means keep the variant; <= 0.2 means keep the base;
anything in between is "no evidence", and then the simpler option or the incumbent stays. With 72
positives, 1-2 spots is within noise. Earlier stages had no labels and used pass count as a proxy.

## 1. Candidate-finder directions (generators)

| id | direction | where | result | status | where it failed / revisit if |
|---|---|---|---|---|---|
| G0 | Repo `nor.detect`: threshold red and green separately; a red blob between greens counts | naive_nor.py | 606 detections, many lone red dots and grain | superseded | No segment validation |
| G1 | Blobs: each red blob is a candidate, its greens are nearby green blobs | nor3.segment (--blobs) | 244 pass / 1,649 candidates | superseded | Noise splits paranodes into specks, so A (one green) is huge |
| G2 | Walk along the fibre from red peaks, strip ±30° bend | nor3.segment_walk | 248 / 1,382 | superseded | A still 415 |
| G3 | Fill: walk along the structure-tensor direction, land on the green peak, colour in to half-peak (scale-free) | nor3.segment_fill (v5-v7) | 213 / 909, P .88 R .62 | superseded | A 242; greens borrowed from neighbour fibres |
| G4 | Traffic light: slide a G-R-G stamp at 16 angles × 5 spacings; peaks have both greens by construction | nor_tl.py (v8) | 229 / 463, P .87 R .65 (47 tp, 7 fp) | **default** | Misses faint one-sided greens (13 never found) |
| G5 | Red-first (Ariel 2026-09-27): red-only peaks, grow the red, greens touching it, several pairs per red | nor_rf.py (v9) | first version 43 tp / 7 fp; after the verdicts below, 48 tp / 9 fp | kept as a variant, **tie with G4** (P(better) 0.48) | Faint or detached second paranodes; `one green` is still the largest class (321) |

## 2. Changes tested on 2026-09-27 (ablation against rf; tl for the blue rows)

| id | change (pitched by) | variant tested | tp/fp | dF1 | P(better) | verdict |
|---|---|---|---|---|---|---|
| C1 | Blue mask applied post hoc, not before finding (Ariel) | tl vs tl_post | 47/7 → 47/7 | 0 | 0.50 | **keep**: no evidence either way, and it is simpler, as Ariel asked. 247 vs 229 passes |
| C1b | same, in rf | rf blue=pre vs post | 41/5 vs 43/7 | +0.010 | 0.70 | keep post (no evidence) |
| C2 | Nucleus rule: only the red decides (≥80% on mask), vs 50% of all NoR pixels or centre on mask (Claude) | nucleus_rule=all | 41/7 vs 43/7 | -0.022 | 0.07 | **keep red-only**. The all-pixels rule drops NoRs whose paranode brushes a nucleus (labels 98, 191) |
| C3 | Several candidates per red; best passing one claims pixels (Ariel) | multi=false (first pair wins) | 40/7 vs 46/8 | -0.033 | 0.15 | **keep multi** |
| C4 | Red must stay rectangular as it grows (Ariel): moment fill ≥0.85, perimeter ratio ≤1.1 | min_rect=0, max_perim=99 | 45/8 vs 43/7 | +0.015 | 0.84 | **drop** (switch kept). Real nodes score fill 0.92-1.03 and perim ≤0.99 when grown fully, so the test mostly stops growth early and the greens stop touching. Revisit if a red segmentation with sub-pixel edges exists, or at higher magnification |
| C4b | only the perimeter half of C4 | max_perim=99 | 43/7 | 0 | 0.50 | drop with C4 |
| C5 | Split a green hill that touches the red on two sides into two paranodes (Claude) | split=false | 44/7 vs 43/7 | +0.011 | 0.82 | **drop** |
| C6 | Accept fainter greens: hills down to 0.7 of the green level (Claude) | g_low=0.7 | 37/2 vs 43/7 | -0.038 | 0.09 | **drop**. Big dim green basins fail I (dim). Revisit with a local rather than global green level |
| C7 | Touch distance 1.0u, reach 3.5u vs 0.5u/2.5u (Claude) | touch_u=0.5,g_reach_u=2.5 | 41/6 | -0.016 | 0.29 | keep 1.0/3.5 (incumbent, no evidence) |
| C8 | Far-paranode rescue (lost-list work): with green on one side only, look in a ±35° cone opposite, up to 2u from the red, and accept a hill if the line to it stays lit (≥0.5 level) | far_u=2 vs 0 | 48/9 vs 46/8 | +0.014 | 0.81 | **keep**. far_u 3 and 4 give the same; gap_level 0.3 lets junk in (47/10) |
| C9 | Overlap trim: a weaker NoR gives up green tips a stronger one owns, then is re-judged (lost-list work) | trim=true | 48/9 | 0 | 0.50 | **drop** (no effect; J losses are red-on-red) |
| C10 | Node = grown red ∩ (red > green) (lost-list work, targets D losses) | red_dom=true | 49/9 | +0.010 | 0.72 | not adopted (no evidence). **First to retry** when there are more labels |

## 3. Ideas pitched by Ariel

| date | idea | status |
|---|---|---|
| 09-25 | Blue (DAPI) as a negative mask | done, S1; moved post hoc in C1 |
| 09-25 | 3 segments G-R-G, greens apart, ≤10% (later 20%) other colour; use it as the metric | done (checks A-E) |
| 09-25 | Green area and brightness balance, stick shape, brightness (not mushy) | done (F, H, G, I) |
| 09-25 | Show every filter stage in the image (pink/blue, letters) | done, the review format |
| 09-25 | Ablation: toughest judge first | done |
| 09-25 | "Explain it to a child" generator redesign; different idea if A stays high | G3, G4, G5 |
| 09-25 | Scale-free: no pixel constants | done (units) |
| 09-27 | Post-hoc blue | C1 kept |
| 09-27 | Several candidates per red; pick the better one; no shared pixels | C3 kept |
| 09-27 | Red-only peaks, rectangular growth, greens in two opposite directions | G5; rectangle part C4 dropped by data |
| 09-27 | Ongoing performance pass after long tasks | procedure in perf.py and skill/SKILL.md |
| 09-27 | Keep this ledger | this file |

## 4. Performance attempts

Procedure: `perf.py snapshot SPEC` → `profile` → change one hotspot → `check`. Keep a change only if the
output signature is IDENTICAL and it is faster; otherwise revert. Timing noise on this machine is about ±15%
run to run (same code measured 5.70 s and 4.81 s), so judge by min-of-3 and re-check a small gain.

| date | finder | change | time | output | verdict |
|---|---|---|---|---|---|
| 09-27 | rf | box_shape: second moments by hand instead of np.cov, perimeter on a crop, skip blobs under min size | 6.3 → 4.3 s | identical | kept |
| 09-27 | rf | skip the shape test entirely while the rectangle rule is off | 6.2 → 5.3 s | identical | kept |
| 09-27 | rf | h_maxima on float32 instead of float64 | 5.7 → 4.7 s | **changed** (peaks differ at ties) | reverted. Revisit if the peak finder is replaced |
| 09-29 | tl, tl_post | score only where the red window reaches `s_min` (s ≤ rwin, so nowhere else can peak), sampling with `map_coordinates` there instead of 160 whole-image `ndi.shift`s | 15.9 → 6.7 s | identical | kept |
| 09-29 | walk, fill | `_bilinear` on every strip offset, angle and bend at once instead of one call per offset/angle/bend (elementwise, so the same values) | walk 21.6 → 5.6 s, fill 12.5 → 5.9 s | identical | kept |
| 09-29 | tl, rf, fill | `nor3.hmax_above`: h-maxima above a level T reconstructed piece by piece over the parts of the image above T - h, whole image when that is over half of it (flat reconstruction commutes with max(., L)); fuzzed against skimage in tests/test_speedups.py | tl → 3.9 s, rf 10.3 → 7.0 s, fill → 5.9 s | identical | kept |
| 09-29 | tl | custom slicing bilinear shift instead of `ndi.shift` | 61 → 135 ms per shift | differs by 1e-14 | dropped: slower, and not exact |
| — | all | open: `nor3.finish` (1-2.5 s per finder: two background medians and two dilations per candidate), the shared gaussians (~1 s), per-candidate colouring. See the proposals below | | | |

### Profile of every finder, 2026-09-29 (Ariel: "performance analysis of all candidate finders")
Raw Python, which is where algorithmic work is measured (`bench.py`, min of 2, after this change):
tl 3.9 s (229/463 pass), rf 6.6 s (265/1263), fill 5.3 s (213/909), walk 5.1 s (249/1382),
blobs 2.8 s (244/1649); peak RSS 180-380 MB. Re-running the checks on the candidates takes ~2 ms.

For reference only, the web page's path on the reference slide: open, blue mask, detect, first refilter. Native = `bench.py`
(this 4-core container is noisy, about ±15%); Pyodide = `browser/bench_pyodide.mjs` (Node, wasm heap
peak); Chromium = `browser/bench_live.mjs` on the deployed page (before) and a local preview of this
change (after), detect time and peak resident memory of all Chromium processes. Pass counts are the
same before and after for every finder.

| finder | native detect | Pyodide detect | Chromium detect | native RSS peak | wasm heap peak | Chromium memory peak |
|---|---|---|---|---|---|---|
| tl | 19.8 → 4.7 s | 24.6 → 7.0 s | 22.1 → 7.0 s | 560 → 387 MB | 668 → 464 MB | 1349 → 1181 MB |
| rf | 9.7 → 7.0 s | 15.1 → 11.6 s | 17.5 → 12.4 s | 391 → 318 MB | 464 → 387 MB | 1189 → 1104 MB |
| fill | 16.5 → 6.6 s | 24.6 → 10.4 s | 25.0 → 11.4 s | 455 → 325 MB | 557 → 387 MB | 1248 → 1112 MB |
| walk | 27.6 → 6.1 s | 46.2 → 12.0 s | 42.7 → 12.3 s | 219 MB | 269 MB | 1013 → 1019 MB |
| blobs | 3.9 → 3.5 s | 6.1 → 6.7 s | 5.7 → 5.7 s | 218 MB | 269 MB | 1000 MB |

Opening the slide takes 2-3 s in the browser, a refilter 0.2-0.3 s, and a cold start (Pyodide plus
packages, nothing cached) 25-30 s. About 1 GB of Chromium memory is there before any finder runs
(blobs, whose detect allocates 55 MB, peaks at 1000 MB); the finders add up to ~180 MB on top.

Proposed next (not done):
1. **nor3.finish** (every finder, 1-2.5 s native): the background median and MAD per candidate on
   the whole window, and two dilations. Skip it for candidates the finder already rejected, or take
   one median per window with `np.partition`. Must stay identical (perf.py check).
2. **Share the preprocessing across finders in a page session** (classify, the smoothed channels,
   h-maxima, watershed basins): switching finder on the page then costs only the finder's own
   search, 1-3 s less. Identical by construction.
3. **float32 working images**: about half the finders' memory and faster filters, but the output
   changes at ties (ledger row of 09-27), so it needs `nor_lab.py ablate`, not perf.py.
4. **Cold start**: scikit-image is now needed only for `reconstruction` and `watershed`; replacing
   those would drop ~17 MB (skimage plus matplotlib) from the first download.
