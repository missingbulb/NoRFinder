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
| — | all | open: h_maxima/reconstruction (~2.5 s of ~5 s) and nor3.finish (~1.4 s) are the next hotspots | | | |

### Browser memory, 2026-09-29 (Ariel: "memory breakdown for the Pyodide and libraries")
Full notes in `detection/browser/MEMORY.md`. Chromium PSS for tl is 955 MB: Chromium 167, Pyodide
95, packages 357 (109 of files in memory, ~170 for the 194 native modules `loadPackage` loads, of
which the finders import 64), slide 128, tl detect 208 (its temporaries; wasm memory never shrinks).

| date | change | Chromium memory | output | verdict |
|---|---|---|---|---|
| 09-29 | install with `unpackArchive` (only the imported wheels, native modules loaded on import) instead of `loadPackage` | tl 955 → 852 MB, rf 962 → 845 MB; ready 20 → 15 s | identical, all five finders (`mem_breakdown.mjs` hash) | proposed, waiting on Ariel |
