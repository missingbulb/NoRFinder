# Status — vessel quantification

> Current state and next step. Working rules & visualization conventions: [WORKING-GUIDE.md](WORKING-GUIDE.md).
> Full measured numbers: [results-first-pass.md](results-first-pass.md).

## Where we are — first pass complete

- **Pipeline** (`measure_vessels.py`): red-dominance segmentation → gap-bridge → skeletonize → spur-prune
  → branch graph, producing all three metrics for the 16 `VESSEL_*.png` panels, calibrated to µm from
  the 50 µm scale bars.
- **Overlays** (`annotate_overlays.py`): presentation figures in the agreed outline-over-original style
  (thin, semi-transparent contours; arrows with lengths; artery diameter; scale bar; totals banner).
- **Results** (`results-first-pass.md`): region means for **length density and area %** rank
  **ischemic ≈ penumbra > contralateral ≈ normal** — matching the paper's biology and the visual
  expectations in `expected-results.md`.

## Trustworthy vs. not (be honest about this)

- **Trustworthy:** area %, length density (ranking *and* magnitude), and the µm calibration. All
  three now stand against external references — see the literature section below.
- **Partly trustworthy:** per-segment **COUNT**. It matches a reimplementation of Rust's published
  macro to within 16% on native data, so the *method* is sound; but on figure crops it runs ~2×
  higher, and count density still does not rank cleanly (dim `normal` fields come out spuriously
  high).
- **Not trustworthy:** the **capillary/artery split**. Measured against Stefanitsch's caliber data
  we over-call arteries by ~3×; `ARTERY_DIAM_PX` is a *pixel* constant, so it means a different
  physical diameter on every panel.
- **Also:** absolute length on the figure crops (downsampled, not raw confocal). The one exception
  is `VESSEL_rust20suppl_representative.png` — native resolution with the authors' own calibration.

## Known limitations

1. **Under-detection of faint vessels** in dim fields — visible on the overlays as red vessels with no
   outline (clearest in `fig4_normal` / `contralateral`).
2. **Fragmentation** — stain dropouts split one vessel into several segments, inflating segment/endpoint
   counts and slightly shortening length. Real, but smaller than previously believed (see below).
3. **Caliber split is a single diameter threshold** (`ARTERY_DIAM_PX = 9 px`); borderline vessels flip.
   Worse, the threshold is in **pixels**, so it is a different physical size on every panel.
4. **Figure-resolution crops** — recompute absolute length on raw `.oib` data for publication numbers.
   The owner's own raw stacks are now available: four Marianas 20× DAPI + CD31 z-stacks
   (30 z × 2 ch, 0.55 µm/px from the files, no z-step), fetched from Drive by
   `analysis/stack_sources.py` — see [`studies/vascular/data/README.md`](../data/README.md).
5. **Every scale-dependent constant is in pixels**, not µm, across panels spanning 0.24–1.35 µm/px.

## Literature review done — six papers digested

[`references/`](literature/README.md) now holds a self-contained digest, described figures and
cropped panels for **six** source papers, plus a cross-paper
[`METHODS-SYNTHESIS.md`](literature/METHODS-SYNTHESIS.md). Intake is repeatable via the
`paper-intake` skill. What it changed:

- **The working dataset grew from 16 to 43 panels** (wang-2022 ×16, rust-2020 ×21,
  freitas-andrade-2022 ×6). Three of the six papers contribute no panels — multi-channel merges
  or a different modality — and each digest says so explicitly rather than forcing them in.
- **We now have external ground truth.** Freitas-Andrade Fig 9 prints the authors' own density,
  branching and tortuosity on three images. Our pipeline reproduces their **ranking exactly** and
  agrees on relative counts to **±9%**; the sparse dim panel is our clear worst case. Figures 3,
  8 and 13 add reference masks and skeletons — an answer key that is not our own output.
- **We now match a published method on its own data.** Rust's supplementary material (supplied
  by the owner) contains the exact Fiji macro *and* a µm-calibrated, native-resolution vessel
  image. Reimplementing their recipe and running both on that image:
  **area 9.6% vs our 8.1%, length 15.3 vs 14.5 mm/mm², branches 1091 vs 920 per mm² — agreement
  within 5–16%.** This is the strongest validation the project has.
- **The earlier "our counts are 5–8× too high" conclusion was wrong, and is retracted.** It came
  from comparing figure-crop output against published *summary tables*. The authors' own macro on
  their own image gives **1091 branches/mm², 3.5× their own published 311/mm²** — so the gap
  reproduces without any of our code. Fragmentation is still real (our figure-crop counts run
  ~2× our native-image count), but it is a smaller effect than claimed, and **311/mm² must not be
  used as an acceptance target.**
- **CATEGORIZE now has an external anchor, and it says our threshold is wrong.** Stefanitsch
  measures mean CD31⁺ vessel diameter at 6.03 µm and mean ASMA⁺ artery diameter at 22.9 µm. Our
  `ARTERY_DIAM_PX = 9` works out to **5.9 µm** on the fig4/5/6 panels — at the mean of *all*
  vessels, so ordinary capillaries are being called arteries. Measured on Rust's calibrated
  native image, we call **29% of segments arteries** where Stefanitsch finds only **10%** of
  vessels above 10 µm — over-calling by ~3×.

## Next step (recommended, supersedes the earlier plan)

The earlier agreed step — improve segmentation sensitivity and reconnect fragments — still stands
and is still the main event. The review adds a cheaper prerequisite and sharper acceptance tests:

1. **First, put the scale-dependent constants in µm.** `σ=1.0`, `min_len=8`, `<20 px`, `disk(2)`
   and `ARTERY_DIAM_PX=9` are all pixel constants applied across panels spanning 0.24–1.35 µm/px,
   so each means something different per figure. `umpp_for()` already exists. Small change; it is
   what makes every comparison below meaningful.
2. **Then the segmentation work**, judged by three tests instead of one: (a) the un-outlined
   vessels get captured on the overlay view; (b) **we stay within ~15% of the reimplemented Rust
   macro on `VESSEL_rust20suppl_representative.png`** — the honest acceptance target, replacing
   the retracted "few hundred per mm²"; (c) our mask and skeleton on the Freitas-Andrade
   originals look like their published mask and skeleton.

   Note the direction of the residual: on native data we find **16% less** area than their
   threshold does. **We under-detect, we do not over-detect** — so sensitivity, not
   over-segmentation, is the thing to push on.
3. **Fix the caliber threshold** using Stefanitsch's published bins (<5 / 5–10 / >10 µm), and
   consider reporting the three-bin distribution rather than a binary split. Still worth the
   external check against Wang's phalloidin / α-SMA panels.

Rust's supplementary toolbox — the macro, the heatmap script (15 × 15 squares) and their LUT —
is in [`references/rust-2020-fiji-vascular-analysis/supplementary/`](literature/rust-2020-fiji-vascular-analysis/supplementary/),
so the published parameters (median radius 1, `setThreshold(66,255)`, particles ≥ 20 µm²,
`prune=none`) no longer have to be guessed at.

Further candidates, with rationale, in [`METHODS-SYNTHESIS.md`](literature/METHODS-SYNTHESIS.md) §4:
nearest-neighbour distance (fragmentation-immune, so trustworthy while count is not), a grid
heatmap of per-square area fraction (two papers converge on it; answers *where* tissue is
under-vascularized), and the published segmentation choices (adaptive local threshold, median
filter, iterative smallest-first pruning).

## 3D: the owner's raw stacks (started 2026-09-28)

The owner's four 30-slice CD31 + DAPI stacks are being looked at in 3D before anything is measured
on them: [3D-STACKS.md](3D-STACKS.md) holds the problem, the literature, the web viewer and its
open questions (the z-step, and the owner's ground truth).
The same viewer is a static site, **3D MicroViewer** ([`microviewer/`](https://github.com/missingbulb/vascularColoring/tree/54badaa922556913bed2e51834440b5419b940ca/microviewer)), that opens
any TIFF z-stack in the browser, from the computer or from Google Drive, with no export step.

**Ground truth, started 2026-10-03:** `analysis/vessel_model.py` drafts a vessel model of a whole
stack, since 2026-10-27 as junctions and tips joined by smooth curves (`vessel-model/2`; first:
`cd31_frontal_x20_r_1_slices1-12`, about 100 KB against the stack's 35 MB), and
the MicroViewer shows it beside or over the stack and lets the owner correct it and download the
corrected JSON. The corrected model is the first answer key; see
[3D-STACKS.md](3D-STACKS.md#the-vessel-model-a-correctable-answer-key).

**Several extraction versions, scored (2026-10-29):** [`extraction/`](../analysis/extraction/README.md) keeps every
vessel-extraction version side by side (v1 = the tracer above, v5 the default and the source of the
MicroViewer's models), scores each by the pixels under its edges and by biology invariants, and grades
them against provisional labels a model (Fable) judged on five tiles. Every edge now carries a start
and end width (`r_a`, `r_b`). v1 → v5: F1 against the provisional labels 0.880 → 0.903, judged
non-vessels kept 24 → 13, short loops gone where the evidence is weak. The labels are a model's, not
the owner's: the numbers are a proxy. Everything tried, and what is next:
[`studies/vascular/analysis/extraction/LEDGER.md`](../analysis/extraction/LEDGER.md).

Before that (2026-09-29 to 10-02), `trace_vessel_graph.py` drafted a vessel graph of one 220 µm
region of frontal r1, with the crossing test (each slice segmented on its own, depth as fallback)
that the model does not have yet; see `3D-STACKS.md`.

## Reproduce

```
python3 analysis/measure_vessels.py              # per-image + region metrics table
python3 analysis/measure_vessels.py --overlays   # 3-panel debug overlays -> analysis/overlays/
python3 analysis/annotate_overlays.py            # presentation overlays -> analysis/annotated/
```

Setup: `pip install -r requirements.txt` (numpy, scipy, scikit-image, Pillow). Rendered PNG dirs are gitignored — regenerate.
