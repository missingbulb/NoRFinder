# Expected results — first pass (visual inspection)

> **What this is.** A first-pass set of *expected* per-image results for the 16 `VESSEL_*.png` red
> gP-CD31 panels — the working dataset for vessel detection / counting / length quantification. These
> are **reference expectations to validate the future automated pipeline against**, produced by direct
> visual inspection of each panel (not by running a segmentation pipeline — that would be circular).
> One objective anchor is included per image: the **red-channel area fraction** (the same "area-%"
> metric the paper reported, §6 of the digest), measured with a simple red-dominance mask that also
> excludes the white panel labels.
>
> **What this is NOT.** Not manual pixel-level ground truth, and not absolute numbers. Vessel **counts
> and branching are visual estimates given as bands**, deliberately imprecise. The panels are
> figure-resolution, downsampled crops (digest §5 caveat) — use these to sanity-check *relative*
> behaviour and rough magnitude, then recompute absolute length on raw `.oib` data with the µm/px in
> the digest. Revise freely: this is a starting point for discussion, not a locked spec.

## Metrics we predict per image

| Metric | How to read it | Source |
|---|---|---|
| **area %** | fraction of the field that is vessel (density proxy) | **measured** (red-dominance mask) |
| **intensity band** | relative gP-CD31 labeling strength: dim / moderate / bright | **measured** (95th-pct red) |
| **est. vessel count** | # distinct curvilinear segments, as a band | visual estimate |
| **relative length / branching** | expected skeleton length & junction count vs the other regions | visual + density |
| **dominant caliber** | thin capillary mesh vs. presence of a thick penetrating artery | visual |
| **continuity** | continuous vessels vs. fragmented / punctate (drives detector error) | visual |
| **detector difficulty** | how hard a threshold→skeletonize pipeline will find it | visual + SNR |

## Per-image expectations

Grouped by region. `area%` and `intensity` are measured; counts/branching/difficulty are visual.

### Healthy / normal control

| File | area% | intensity (p95 R) | est. count | caliber | continuity | difficulty | notes |
|---|---|---|---|---|---|---|---|
| `VESSEL_fig1_C1_healthy` | 16.6 | moderate (106) | ~15–22 | medium, capillary-dominated, some thick | good | **low** | The "cleanest" field: thick, continuous, well-branched mesh, high SNR. A *high-density healthy* exemplar — not representative of the fig4–6 "normal" below. |
| `VESSEL_fig4_normal` (A2) | 6.9 | dim (102) | ~8–14 | thin | **poor / punctate** | **high** | Sparse, faint, fragmented. Detector will over-fragment / under-count. |
| `VESSEL_fig5_normal` (A2) | 6.4 | dim (97) | ~8–14 + 1 artery | **mixed** | poor (capillaries) | med | **Prominent vertical penetrating artery** down the centre + sparse thin capillaries. The artery dominates length but is *one* structure — must not be shattered into many segments. |
| `VESSEL_fig6_normal` (A2) | 5.5 | dim (97) | ~6–12 | thin, streaky | **poor** | **high** | Faint diagonal **streaks** (obliquely-cut artery / tissue fold?) + few faint capillaries. Most ambiguous / artifact-prone panel; lowest SNR of the normals. |

### Ischemic core (expected strongest — gP-CD31 upregulated in ischemia)

| File | area% | intensity (p95 R) | est. count | caliber | continuity | difficulty | notes |
|---|---|---|---|---|---|---|---|
| `VESSEL_fig3_ischemic` (B2) | **21.9** | **bright (199)** | ~18–28 | thick | excellent | low | Densest & brightest of all 16 — the strong-ischemia exemplar. |
| `VESSEL_fig4_ischemic` (B2) | 16.8 | bright (168) | ~15–22 | medium–thick | good | low–med | **Bright focal blob** (strong labeling / vessel cross-section) can inflate area% and act as a false skeleton hub. |
| `VESSEL_fig5_ischemic` (B2) | 12.7 | bright (152) | ~15–22 | medium–thick | good | low–med | Thick bright arcs + a thick central vessel. |
| `VESSEL_fig6_ischemic` (B2) | 19.5 | bright (158) | ~16–24 | thick | good | low | Dense branching with a large central arch vessel. |

### Penumbra (expected intermediate–high)

| File | area% | intensity (p95 R) | est. count | caliber | continuity | difficulty | notes |
|---|---|---|---|---|---|---|---|
| `VESSEL_fig3_penumbra` (C2) | 20.4 | high (135) | ~20–28 | medium–thin | good | low–med | Dense, highly branched. |
| `VESSEL_fig4_penumbra` (C2) | 12.8 | high (150) | ~18–26 | thin–medium | good | low–med | Well-connected thin mesh, high branching. |
| `VESSEL_fig5_penumbra` (C2) | 18.1 | high (150) | ~18–26 | thin–medium | good | low–med | Branching network with central vessels. |
| `VESSEL_fig6_penumbra` (C2) | 14.6 | high (139) | ~18–26 | medium | good | low–med | Dense well-connected mesh. |

### Contralateral (mirror healthy side — expected low, like normal)

| File | area% | intensity (p95 R) | est. count | caliber | continuity | difficulty | notes |
|---|---|---|---|---|---|---|---|
| `VESSEL_fig3_contralateral` (D2) | 8.6 | dim (93) | ~16–24 | thin | moderate | med–high | Many fine thin dim threads; high count but low area. |
| `VESSEL_fig4_contralateral` (D2) | 7.4 | dim (81) | ~14–20 | thin | moderate | med–high | Fine distributed mesh, dim. |
| `VESSEL_fig5_contralateral` (D2) | 11.0 | dim–moderate (99) | ~14–20 | mixed | moderate | med | Thicker curvilinear vessels upper field, thinning lower. |
| `VESSEL_fig6_contralateral` (D2) | 5.4 | **dimmest (72)** | ~12–18 | thin | **poor** | **high** | Dimmest panel overall; thin fragmented vessels + faint vertical vessel. |

## Expected cross-region ordering (the validation target)

The pipeline's per-region numbers should reproduce these *rankings*, grounded in the paper (digest §7:
gP-CD31 intensity **and** area% peak in the ischemic area, drop on the healthy sides):

- **Density / area% / total length:**  ischemic ≈ penumbra  **>**  contralateral ≥ normal.
  Measured region means: ischemic **17.7%**, penumbra **16.5%**, contralateral **8.1%**, normal **6.3%**.
- **Labeling intensity:**  ischemic (p95 152–199)  **>**  penumbra (135–150)  **>**  contralateral ≈
  normal (72–106). This is the cleanest, most reliable signal.
- **fig1 healthy is an outlier** high-density healthy field (16.6%) — treat it as its own exemplar, not
  as the "normal" baseline (the fig4–6 "normal" panels, a separate control animal, sit at ~6%).

A first automated pass should be judged on: (1) does the **region ranking** above come out right?
(2) is each image's pipeline area% within a few points of the measured anchor here? (3) do vessel
**counts** land inside the visual bands? Absolute length in µm is *not* yet validatable at this
resolution.

## Gotchas for the detector (flagged from the images)

- **Penetrating arteries** (`fig5_normal`, faintly `fig6_normal`/`fig6_contralateral`): one large
  high-caliber structure — inflates length, should count as **one** vessel, and must not be skeletonized
  into a bushy artifact.
- **Bright focal blob** (`fig4_ischemic`): can inflate area% and create a spurious high-degree junction.
- **Dim / fragmented fields** (`fig4_normal`, `fig6_normal`, `fig6_contralateral`): low SNR → a global
  threshold will over-fragment; expect the largest count/length error here.
- **Streaky non-vessel signal** (`fig6_normal`): tissue folds / obliquely-cut walls can be mistaken for
  vessels — a good stress test for false positives.
- **Panel labels** ("A2"/"B2"/"C1"/"D2", white text in a corner) are excluded by the red-dominance mask
  used for area% here, but a naive brightness threshold **will** pick them up — mask them out.
