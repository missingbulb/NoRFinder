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
| 09-29 | tl, rf, fill | hmax_above: pieces grouped by 128-px tile into one reconstruction each (200 calls instead of 4278 in rf), pieces found by `np.unique` instead of `ndi.maximum`, h_maxima's shifted image computed per crop | rf hmax 2.7 → ~1.5 s | identical | kept |
| 09-29 | all | finish: the red's rim dilation done once, not once per green; `grow` = one (2r+1)-square dilation instead of r rounds; `nor3.median` = np.median's own partition without its per-call overhead | finish ~2.6 → ~2.0 s in rf | identical | kept |
| 09-29 | tl, rf, fill | `FibreAngle`: the structure tensor's second smoothing pass only on the rows a candidate reads (each row equals the whole map's row) | ~0.4 s per finder | identical | kept |
| 09-29 | all | perf.py's signature now also hashes every measurement (snr, purity, lengths, lines, comb...), not only verdicts and pixels; all six specs re-checked against main | | identical | tooling |
| — | all | open: rf still ~5.7 s (finish on both alternatives per red ~2 s, per-candidate labelling ~0.7 s, classify ~0.6 s) | | | |

### Profile of every finder, 2026-09-29 (Ariel: "performance analysis of all candidate finders")
Raw Python, which is where algorithmic work is measured (`bench.py`, min of 3, after both rounds):
tl 3.2 s (229/463 pass), rf 6.1 s (265/1263), fill 4.9 s (213/909), walk 4.6 s (249/1382),
blobs 2.4 s (244/1649); peak RSS 190-370 MB. Re-running the checks on the candidates takes ~2 ms.
`perf.py check` against main's code, min of 3: tl 15.0 → 3.2 s, rf 9.6 → 5.7 s, fill 11.7 → 4.8 s,
walk 21.6 → 4.5 s, blobs 2.7 → 2.4 s.

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
1. **nor3.finish**: partly done (see the rows above). What is left is per-candidate numpy overhead;
   rf runs it on both alternatives of every red.
2. **Share the preprocessing across finders in a page session** (classify, the smoothed channels,
   h-maxima, watershed basins): switching finder on the page then costs only the finder's own
   search, 1-3 s less. Identical by construction.
3. **float32 working images**: ruled out. It changes the output at ties, and Ariel (2026-09-29)
   allows no change in quality for a performance optimisation.
4. **Cold start**: scikit-image is now needed only for `reconstruction` and `watershed`; replacing
   those would drop ~17 MB (skimage plus matplotlib) from the first download.

### Browser memory, 2026-09-29 (Ariel: "memory breakdown for the Pyodide and libraries")
Full notes in `detection/browser/MEMORY.md`. Chromium PSS for tl is 955 MB: Chromium 167, Pyodide
95, packages 357 (109 of files in memory, ~170 for the 194 native modules `loadPackage` loads, of
which the finders import 64), slide 128, tl detect 208 (its temporaries; wasm memory never shrinks).

| date | change | Chromium memory | output | verdict |
|---|---|---|---|---|
| 09-29 | install with `unpackArchive` (only the imported wheels, native modules loaded on import) instead of `loadPackage` | tl 955 → 852 MB, rf 962 → 845 MB; ready 20 → 15 s | identical, all five finders (`mem_breakdown.mjs` hash; same passes in Chromium) | kept (Ariel 09-29) |
| 10-06 | download the packages while Python downloads and starts, at low fetch priority so Python comes first (`boot_live.mjs`, fair-shared simulated link) | unchanged; ready 26.8 → 24.5 s at 20 Mbit, 16.4 → 15.5 s at 50 Mbit, ~11 → ~10.5 s from cache | identical (same wheel bytes, same checksums) | kept |

## 5. Filters across finders, and filter presets (2026-10-06, Ariel: items 11 and 12)

Question (Ariel): are the filter values optimized per finder, or one suggested set? Every finder uses
the same filters (`nor3.CHECKS`, the nucleus rule, one pixel per NoR); the values come from one base
set (`nor3.P`/`P3`) with small per-finder edits, none from a per-finder search: tl and rf take green
balance 0.25 (others 0.33), rf takes min_opposite 110, and walk and blobs predate the three line and
solidity limits (max_off_u, max_axis_dev, min_solid), so those are off for them. Measured the way the
page runs (`finder_metrics.py transfer`; F1, tp/fp on the 72 real / 93 not labels):

| filter values of ↓ / finder → | tl | rf | fill | walk | blobs |
|---|---|---|---|---|---|
| tl's | **0.746** 47/7 | 0.754 49/9 | 0.752 47/6 | 0.655 39/8 | 0.628 38/11 |
| own | 0.746 47/7 | 0.744 48/9 | 0.717 43/5 | 0.643 37/6 | 0.615 36/9 |

Verdict: **the filter values are not finder-specific.** tl's set is as good as or better than each
finder's own on every finder (differences of 1-4 spots, within noise), so one set serves all five.
The page still opens each finder on its own values; making tl's the common default is an R9 change
(it moves spots) left for Ariel.

| id | attempt | result | verdict |
|---|---|---|---|
| T1 | Fit every filter value per finder by coordinate search on F1 over the labels | in sample +0.06..0.10 F1 (tl 0.746 → 0.806, all moving the same way: green balance 0.1, min_snr 2-3, min_solid 0.9) | **dropped**: on 2-fold held-out labels (12 folds) the gain vanishes for tl (-0.018) and rf (+0.011); only walk gains reliably (+0.061, 12/12 folds), from the line and solidity limits it lacks. 72 real spots are too few to fit 10 values |
| T2 | One shared set per goal, fitted on mean F0.5 (precise) and F2 (sensitive) over all finders | in sample P up and R up together | **dropped**: held out, "precise" raised precision in 40% of folds and cost 0.056 recall; "sensitive" +0.011 recall. Fitting on ~7 false passes says nothing |
| T3 | Presets by hand: every filter 40% of the way from the finder's own value towards a fixed strict (or loose) end, same share for all finders | a clean trade-off on every finder: tl P 0.92 R 0.49 / 0.87 0.65 / 0.85 0.69; recall falls monotonically with strictness by construction | **kept** as the R11 presets (`finder_metrics.py`). Precision rests on 3-13 false passes, so a 0.03 difference is noise |
