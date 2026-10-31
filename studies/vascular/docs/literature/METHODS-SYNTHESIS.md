# Methods synthesis — what the literature does, and what we do

> **Accumulating doc.** Every paper that lands in [`references/`](README.md) folds its method here.
> This is the bridge from reading to pipeline work: the per-paper digests hold the detail, this
> holds the *decisions*. Current pipeline: [`studies/vascular/analysis/measure_vessels.py`](../../analysis/measure_vessels.py).

**Papers folded in:** all ten — wang-2022, rust-2020, freitas-andrade-2022, stefanitsch-2015,
hill-2020, bizou-2026, blinder-2013, cassot-2010, ji-2021, smith-2019. The last four are biology references for scoring a
vessel *graph*, not methods for the pixel pipeline; their numbers live in
[`BIOLOGY-INVARIANTS.md`](BIOLOGY-INVARIANTS.md), and only the cautions below are folded in here. **Rust's supplementary toolbox is in the repo**, which closed the last
open parameter gaps and made a direct method-vs-method comparison possible (§3.1).

---

## 1. The metric set

Our three locked asks against what the literature reports:

| Our ask | Our field | What the literature does | Status |
|---|---|---|---|
| **MEASURE** — total centerline length | `length_um`, `length_density` (mm/mm²) | **Rust:** vessel segment length, mean + max per branch, and mm/mm². **Freitas-Andrade:** vessel density = Σ segment arc-length ÷ area, **mm/mm²** — definitionally identical to ours. | **Adopted.** mm/mm² is the shared unit; we report the total rather than mean/max. |
| **COUNT** — branch segments | `segments`, `count_density` (per mm²) | **Rust:** branches per mm² (`Analyze Skeleton`, `prune=none`). **Freitas-Andrade:** *bifurcation points* per mm² (nodes of degree ≥3) — **our `junctions`, not our `segments`**. **Hill:** vessel cross-sections per mm² (a third, different quantity). | **Adopted.** See §3.1: against the authors' *own macro on their own image* we are within 16%. The apparent 5–8× gap is against their published *summary table*, and it reproduces with their own code — so it is not our defect. |
| **CATEGORIZE** — capillary vs artery by caliber | `capillary`, `artery` | **Rust:** explicitly declined. **Wang:** phalloidin / α-SMA mark artery walls, no caliber bins. **Stefanitsch: the only quantitative reference** — CD31⁺ mouse cortex binned **< 5 / 5–10 / > 10 µm** (54% / 36% / 10%), and ASMA⁺ (true smooth-muscle-covered) vessels averaging **22.9 µm**. | **Ours, but now externally anchored.** And the anchor says our threshold is wrong — see §4.2. |
| *(density)* | `area` (%) | **Rust** and **Wang**: vascular area fraction. **Bizou:** µm²/mm²×10³ — the same construct, rescaled. | **Adopted.** The one metric every paper shares — the best cross-paper anchor. |
| *(not implemented)* | — | **Rust:** nearest-neighbour distance between closest non-zero pixels, µm. | **Candidate — recommended.** See §4.1. |
| *(not implemented)* | — | **Freitas-Andrade:** tortuosity — per-pixel mean deviation from a locally fitted line, at scale *d*. | **Candidate.** Needs no calibration to compute in px, and gives a shape metric orthogonal to density. |
| *(not implemented)* | — | **Rust** and **Bizou** both build **grid heatmaps** of per-square area fraction. | **Candidate — recommended.** Two independent papers converge on it. See §4.4. |
| *(not applicable)* | — | **Rust, Stefanitsch, Bizou:** pericyte coverage, tip-cell counts, ERG⁺ nuclei. | **Rejected:** all need a second channel; our panels are single-channel. |

## 2. The processing chain

| Step | Rust 2020 (Fiji) | Freitas-Andrade 2022 (Pyvane) | Ours | Verdict |
|---|---|---|---|---|
| Denoise | **median filter, radius 1** | **Gaussian, σ ≈ 1 µm** | Gaussian, σ = 1.0 **px** | ours is the only one whose smoothing scale is *not physical* |
| Binarize | **manual `setThreshold(66,255)`** on 8-bit — auto-threshold present but commented out, marked "adapt to your image!!" | **adaptive local mean + C**, C ≈ 2–3 | global Otsu (floor 0.13) OR Frangi vesselness | Rust's is *not automated* at the decisive step; Pyvane's adapts to illumination, ours to ridge shape. **Ours is defensibly better than Rust's here**, though the 0.13 floor is still unjustified. |
| Small objects | **< 20 µm²** (Analyze Particles, calibrated) | **< 50 µm²** | < 20 **px** (≈ 7 µm² at 0.61 µm/px) | ours is ~3× more permissive than Rust's and ~7× than Pyvane's — and again the only one in pixels |
| Holes | not stated | **≤ 10 µm²** in 2-D (all holes only in 3-D) | `binary_fill_holes` — *all* holes | ours applies the 3-D rule in 2-D and **may close genuine background** |
| Skeleton | Fiji *Skeletonize* | Palágyi–Kuba (3-D) / standard (2-D) | `skimage.skeletonize` | equivalent in 2-D |
| Pruning | **none** (`prune=none`) | **iterative, remove globally smallest first, threshold S ≈ vessel diameter** | fixed `min_len = 8 px`, 40 passes | Rust does not prune at all; Pyvane's is principled and scale-linked; **ours is a magic number** |
| Gap bridging | not mentioned | not mentioned | binary closing (disk 2) + fill holes | **ours alone** — a response to figure-crop dropout that neither paper needs |
| Batch | in the script | processor pipeline | glob over `references/*/figures/panels/VESSEL_*.png` | equivalent |
| Visualization | **grid heatmap**, **15 × 15** squares, own LUT supplied | per-pixel tortuosity maps | outline-over-original overlays | complementary; see §4.4 — the exact recipe is now in the repo |

**Structural agreement is the reassuring part:** three independent groups all do
*binarize → skeletonize → graph → count and sum*. Our architecture is not idiosyncratic.

**The recurring defect is unit discipline.** Every scale-dependent constant in our pipeline is in
**pixels** (`σ=1.0`, `min_len=8`, `< 20 px`, `disk(2)`, `ARTERY_DIAM_PX=9`), while both published
pipelines state theirs in **µm**. Since our panels span **0.24 – 1.35 µm/px**, every one of those
constants silently means something different on each figure. `umpp_for()` already exists; the fix
is to route the constants through it. This is the single highest-leverage change the literature
review surfaced.

Commercial-software note: Bizou 2026 segments in **Imaris** (`Surfaces`, detail 1 µm, background
subtraction 3 µm, plus a trained pixel classifier), Wang 2022 reconstructs in Imaris, Hill 2020
thresholds in ImageJ at **mean + 2.5·SD**. Only Pyvane and the LIOM Toolkit are open and readable.

## 3. Reference magnitudes — sanity checks, not targets

Published values (raw microscopy) against ours (figure-resolution crops):

| Quantity | Rust: adult mouse ctx | Rust: mouse peri-infarct | Rust: human ctx GM | Hill: young mouse | Ours (range) |
|---|---|---|---|---|---|
| Area fraction | 0.106 | 0.060 | 0.028 | — | 1.9 – 23.2% |
| Length density (mm/mm²) | 25.5 | 31.9 (intact 57.7) | — | — | 3.2 – 38.6 |
| Branch-ish density (per mm²) | 311 branches | 127 (intact 396) | — | 458 vessel profiles | 236 – 2870 segments |
| Nearest distance (µm) | 23.7 | 36.9 (intact 30.3) | — | — | not computed |

Freitas-Andrade's three ground-truth panels add: 22.60 / 16.72 / 8.84 mm/mm² and
234.3 / 134.3 / 49.0 bifurcations mm⁻².

**What the corpus establishes about our numbers:**

- ✅ **Area fraction is trustworthy in magnitude.** Our human-tissue panels (1.9–2.8%) sit almost
  exactly on Rust's human GM figure of 2.8%.
- ✅ **Length density is in the right band.** Ours spans 3.2–38.6 mm/mm² against published values
  of 8.8–57.7 across comparable tissue.
- ✅ **Relative ranking is reliable.** On Freitas-Andrade's Fig 9 our segment counts reproduce the
  published density ordering exactly, and the implied field areas agree to **±9%** across a 5×
  density range. **Ranking, which is what the ischemic-vs-contralateral question actually needs,
  is the best-supported thing we do.**
- ⚠️ **The earlier "our branch counts are 5–8× too high" conclusion does not survive §3.1.**
  It was inferred by comparing our figure-crop output against published *summary tables*. Running
  the authors' own code on the authors' own image shows the same gap appearing in *their* output,
  so it is not evidence of a defect in ours. Corrected below.
- ⚠️ **Our worst case is the sparse, dim field**, now measured rather than eyeballed:
  Freitas-Andrade panel (b) is the outlier in both consistency checks, and on Rust's native image
  we find 16% *less* area than their threshold does. **We under-detect; we do not over-detect.**

### 3.1 The decisive test — same method, same image ⭐

Rust's supplementary material supplies both their **exact macro** and a **µm-calibrated,
native-resolution vessel image** (`references/rust-2020-fiji-vascular-analysis/supplementary/`).
Reimplementing their recipe step-for-step and running both on that one image is the only true
apples-to-apples comparison in the whole corpus:

| Metric | **Their recipe, their image** | **Our pipeline, same image** | Δ | Their *published* adult-cortex value |
|---|---|---|---|---|
| Area fraction | 9.6% | 8.1% | **−16%** | 10.6% |
| Length density | 15.3 mm/mm² | 14.5 mm/mm² | **−5%** | 25.5 mm/mm² |
| Branch count | **1091 /mm²** | 920 /mm² | **−16%** | **311 /mm²** |
| Junctions | 447 /mm² | — | — | — |

**Two findings, one of which corrects this document's previous conclusion:**

1. ✅ **Our implementation faithfully reproduces the published method — within 5–16% on every
   shared metric.** That is the strongest validation the project has. Our architecture is not
   just structurally similar to the literature's, it produces the literature's numbers.
2. ⚠️ **The 5–8× count gap is not ours.** The authors' own macro on the authors' own
   representative image yields **1091 branches/mm² — 3.5× their own published 311/mm²**.
   Whatever explains that (the representative image being denser than their p120 cortex average;
   "number of branches" in the summary meaning something narrower than the raw `Analyze Skeleton`
   output), it reproduces without any of our code involved.

**What this means for the fragmentation question.** Fragmentation is still real — it is visible
on the overlays, and it is the reason our figure-crop counts (~2000/mm²) run above our
native-image count (920/mm²). But **the bulk of the apparent discrepancy was figure-resolution
downsampling plus an incomparable published number, not our segmentation splitting vessels.**
**Do not use 311/mm² as an acceptance target.** The honest target is the one in §3.1: match a
reimplementation of a published method on a shared image, which we already do.

## 4. Open recommendations

Ordered by leverage.

### 4.1 Put every scale-dependent constant in µm ⭐ *highest leverage*
`σ=1.0`, `min_len=8`, `< 20 px`, `disk(2)` and `ARTERY_DIAM_PX=9` are all **pixel** constants
applied across panels spanning **0.24–1.35 µm/px**, so each one means something different on
every figure. Both published pipelines state theirs physically (Pyvane: σ ≈ 1 µm, components
< 50 µm², prune length ≈ vessel diameter). `umpp_for()` already exists — route the constants
through it. This is a small change that makes every other comparison in this document meaningful.

### 4.2 Fix the caliber threshold — it is almost certainly too low ⭐
`ARTERY_DIAM_PX = 9` works out to **5.9 µm** on the wang fig4/5/6 panels. Stefanitsch measures
mean CD31⁺ vessel diameter at **6.03 µm** and mean **ASMA⁺ (smooth-muscle-covered) diameter at
22.9 µm**. Our threshold sits at the *mean of all vessels* — it is classifying ordinary
capillaries as arteries. Stefanitsch's published bins (**< 5 / 5–10 / > 10 µm** for CD31⁺;
**< 15 / > 30 µm** for ASMA⁺) are the natural replacement, and reporting a *three-bin
distribution* rather than a binary split would match the literature and be more informative.
Validate against Wang's phalloidin / α-SMA panels, which independently mark artery walls.

**Now measurable, and it confirms the problem.** On Rust's calibrated native image (0.6058 µm/px,
so the 9 px threshold means **5.45 µm** there) our pipeline classifies **101 of 354 segments —
29% — as artery**. Stefanitsch measures only **10%** of CD31⁺ cortical vessels above 10 µm. We
are over-calling arteries by roughly 3×, exactly as the unit analysis predicts.

### 4.3 Re-examine the pruning and small-object thresholds before blaming segmentation
Rust prunes **not at all** (`prune=none`) and drops objects below **20 µm²**; Pyvane prunes
iteratively with a threshold tied to vessel diameter and drops below **50 µm²**. Ours prunes
spurs shorter than 8 px and drops below 20 px (≈ 7 µm²) — the most permissive of the three at
both steps. Since we now know we *under*-detect area rather than over-detect, the count
difference is more likely in these two knobs than in the thresholding.

### 4.4 Add nearest-neighbour distance
Cheap (a distance transform on the existing mask), directly comparable to Rust's published
numbers, and — crucially — **fragmentation-immune**: unlike branch count, it does not care
whether a vessel is split into pieces. That makes it a trustworthy metric to lean on *while*
count is untrustworthy.

### 4.5 Add a grid heatmap of per-square area fraction
**Rust and Bizou independently converge on this construct.** Not a replacement for the outline
overlays (which stay the agreed QA style), but it answers a different and very on-topic question:
*where* is the tissue under-vascularized. That is the ischemic-core/penumbra question directly.
**Rust's exact macro is now in the repo** (`supplementary/Heatmap.ijm`, 15 × 15 squares, with
their `hm_stroke.lut`) — there is a concrete recipe to copy rather than invent.

### 4.6 Try the published segmentation choices
- **Adaptive local threshold** (`I > local_mean + C`, C ≈ 2–3) instead of global Otsu with an
  unexplained 0.13 floor — it is the choice made by the pipeline closest to ours, and it handles
  the uneven illumination that makes our dim fields fail. Note Rust's alternative is a *manual*
  `setThreshold(66, 255)` flagged "adapt to your image!!" — not something to copy, and a reminder
  that our automation is a real advantage over the published toolbox.
- **Median instead of Gaussian** smoothing — better edge preservation on thin structures.
- **Iterative smallest-first pruning** with threshold ≈ vessel diameter, replacing `min_len=8`.
- **Limit hole filling** to small holes (Pyvane: ≤ 10 µm²) rather than filling all of them.

### 4.7 Use the reference segmentations as a visual answer key
Freitas-Andrade Figs 3, 8 and 13 give original/mask/skeleton/graph sets. Run our segmentation on
the originals and compare in the overlay style. This is external ground truth — exactly what the
"never validate the pipeline against itself" rule asks for, and it costs nothing to do.

### 4.8 Consider reading the open implementations
**Pyvane** (<https://github.com/chcomin/pyvane>) and the **LIOM Toolkit**
(<https://github.com/LIOMLab/liom-toolkit>) are both Python + scikit-image, the same stack we
use. Neither has been read yet.

## 5. Cross-paper cautions

- **Time point flips the sign of the ischemia effect.** Wang (rat, 24 h post-MCAO) finds *more*
  gP-CD31 signal in the ischemic area; Rust (mouse, 3 weeks post-photothrombosis) finds *less*
  vasculature in the border zone. Acute endothelial upregulation and chronic rarefaction are both
  real. **Never generalize our Wang-derived ranking into "ischemia ⇒ more vessels".**
- **Branch count is not monotonic with maturity.** Rust's developmental series peaks at p10 and
  then declines as anastomoses are pruned. More branches ≠ more developed.
- **Marker choice moves the number.** Rust attributes a 40–60% vs ~80% pericyte-coverage
  discrepancy to antibody/epitope differences alone; Wang's whole paper is a demonstration that
  polyclonal vs monoclonal anti-CD31 label visibly different amounts of the same vasculature.
  Any absolute number we report is a number *for that marker*.
- **Aging rarefies the vasculature too.** Hill measures a ~21% fall in CD31⁺ vessel density and
  up to 59% regional aCBV loss over two years of *normal* mouse aging. Age is a confounder on the
  same scale as the disease effects we are trying to detect.
- **Density is region-specific at a fixed age.** Bizou finds thalamus significantly denser than
  the whole-brain mean from P6 to P40. A "normal cortex" baseline is not a "normal brain"
  baseline. (Our panels are all cortex, which is fortunate rather than planned.)
- **Development is not monotonic in every metric.** Rust's branch density peaks at p10 and then
  *declines* as anastomoses are pruned; Bizou's tip cells peak at P6. More branches ≠ more mature.
- **Perfusion is contested.** Rust and Wang both perfusion-fix; Freitas-Andrade found perfusion —
  *including with fixative* — degrades CD31 immunostaining and deliberately does not perfuse.
  Rust separately notes perfusion-based *labelling* misses new vessels, tip cells and filopodia.
  Sample preparation changes what is there to segment.
- **Two markers beat one.** Bizou merges CD31 **and** ICAM2 before segmenting, purely for
  signal-to-noise, and identifies tip cells from the CD31⁺/ICAM2⁻ *mismatch*. Our single-channel
  inputs carry less information than the field's norm — worth remembering before blaming the
  algorithm for a missed vessel.
- **2-D projection under-states tortuosity by ~35%** (Freitas-Andrade: 0.93 in 2-D vs 1.4 in 3-D
  on the same samples), and **crossings in projection are miscounted as bifurcations** — a
  published warning that lands squarely on our COUNT metric, since every panel we have is 2-D.
- **Murray's law is a population trend, not a per-junction rule.** Cassot (human, 9,414
  bifurcations) finds the per-junction exponent spread over 1.4–16 (5–95%) and the larger daughter
  wider than the parent in ~40% of junctions. Any width-based rule at one junction (spur limits,
  trunk choice, flow direction) should lean on the *thinnest* branch, which is a daughter > 90% of the time.
- **Short loops are real but rare.** Blinder's mouse loops average 8 edges with ~15% at 2–4 edges;
  a graph whose loops are mostly that short is merging crossings.
- **Section thickness decides whether connectivity means anything.** 5 µm paraffin (Rust's human
  panels, Hill's histology) shows isolated cross-sections, where branch and junction counts are
  meaningless and only area fraction is reported. 80 µm (Wang) and 25–150 µm (Freitas-Andrade)
  show networks.
