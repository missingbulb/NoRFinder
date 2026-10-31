# Reference digest — Cassot et al. 2010, branching of human cortical arterioles and venules

> Self-contained digest of the source paper. **No need to reopen the PDF.**

- **Title:** *Branching patterns for arterioles and venules of the human cerebral cortex*
- **Authors:** **Francis Cassot\*** (\*corresponding, francis.cassot@inserm.fr), Frédéric Lauwers,
  Sylvie Lorthois, Prasanna Puwanarajah, Valérie Cances-Lauwers, Henri Duvernoy. INSERM U825
  Toulouse; Fluid Mechanics Institute of Toulouse; Oxford.
- **Venue / id:** *Brain Research* **1313**:62–78 (2010), available online 11 Dec 2009.
  DOI **10.1016/j.brainres.2009.12.007**. Paywalled; PDF supplied by the owner (2026-10-29). 17 pages.
- **PDF:** not committed: the article is copyrighted (Elsevier) and this repo is public. The owner holds a copy; this digest and the figures below are the working record.
- **One-line thesis:** across ~9,400 bifurcations of human cortical arteriolar and venular trees,
  area ratios and branching angles are broadly distributed and **do not follow optimality
  (Murray-type) predictions**: the Murray exponent spreads from ~1.4 to ~16, daughters together
  are usually wider than the parent, and real branching angles are much wider than the optimal ones.

---

## 1. Why this matters to *our* task ⭐

**This paper contributes junction statistics, not images** (§5). It is the largest measured
data set on the geometry of individual junctions in brain microvascular trees, and it **corrects
three things we were about to assume** in [`../BIOLOGY-INVARIANTS.md`](../BIOLOGY-INVARIANTS.md):

1. **Murray's law is a weak constraint at a single junction.** The per-junction exponent has median
   3.58 but IQR 2.28–6.14 and a 5–95% range of 1.36–16.33. Use it only as a broad prior, if at all.
2. **"The parent is the widest branch" fails often.** In **~40%** of bifurcations the *larger
   daughter* has a bigger cross-section than the parent. The *smaller* daughter exceeds the parent
   in **under 10%**. So at a junction, the **thinnest** branch is reliably a daughter; which of the
   other two is the parent is close to a coin toss on width alone.
3. **Optimal branching angles do not predict real ones.** Energy-minimization angles fall in a
   narrow 75–83° band between daughters; measured angles average **104°** between daughters, spread
   widely, and correlate with the prediction at close to zero.

It also gives the first numbers we have on **junction planarity** and on how **arterioles and
venules differ**.

**What it does not cover:** mouse (this is human), capillaries (trees only; the capillary net was
separated off), CD31 staining (India-ink injection), and diameters in µm (those are in Cassot 2006 /
Lauwers 2008, not in this paper).

## 2. The method

**Tissue.** One human brain: a 60-year-old woman who died of abdominal lymphoma, no known vascular
or cerebral disease. Vessels injected via the six cerebral arteries with **India ink + gelatine**
(low viscosity, "complete and physiological-like perfusion"). Region: secondary cortex beside the
collateral sulcus, right temporal lobe (fusiform and parahippocampal gyri), chosen for injection
quality. **300 µm** thick coronal sections, 3 adjacent.

**Imaging.** Confocal laser microscopy; blocks of 70 sections × 512 × 512 px, **voxel 1.22 × 1.22 × 3 µm**,
stitched into 10 mosaics covering ~1.5 cm² of surface and **28.6 mm³** of cortex.

**Segmentation (Cassot 2006, Fouard 2006).** Local processing preserving global properties; vessel
centerlines and a distance map give a radius at every centerline point.

**Trees vs capillaries.** Each tree traced from its origin in the sulcus through all vessels whose
flow resistance is below a prescribed value. **Arteriole vs venule assigned "according to their
morphological features"** (not specified further; see gaps).

**Taxonomy.** Diameter-defined Strahler ordering (Fung, Kassab): order 0 = terminal branches into
the capillaries, increasing toward the pial origin. A merge of two order-n vessels whose diameter
stays below [(Dₙ + SDₙ) + (Dₙ₊₁ − SDₙ₊₁)]/2 keeps order n. An **element** is a run of same-order
segments in series; a **segment** runs between two bifurcations.

**Bifurcation types** (by Order Asymmetry Index, OAI = parent order − smaller daughter order):
- **ALB**, asymmetric-lateral (OAI > 1): a lower-order vessel leaves the side of a continuing element.
- **HSB**, homogeneous-symmetrical (OAI = 1): both daughters are one order below the parent.
- **IEB**, intra-element (OAI = 0): all three branches share an order.

**Geometry.** Centerlines smoothed with a 5-point weighted filter, resampled by cubic spline every
0.5 µm, tangents from the derivatives. **Branch direction** at a node = mean of the unit tangents at
the last point inside and first point outside a sphere centred on the node, with radius equal to the
largest local radius of the three vessels (Fig. 12). α₀₁ = parent–major daughter, α₀₂ =
parent–minor daughter, α₁₂ = between daughters (all as angles between the outward direction vectors,
so a straight continuation is 180°). Asymmetry β = α₀₁ − α₀₂. Planarity: Ω = α₀₁ + α₀₂ + α₁₂ − π;
out-of-plane angle = π − Ω (0 = flat).

**Area ratios** with A = cross-section and D₁ > D₂: AER = (A₁ + A₂)/A₀, major A₁/A₀, minor A₂/A₀,
asymmetry γ = A₂/A₁. **Murray exponent** k solved per bifurcation from d₀ᵏ = d₁ᵏ + d₂ᵏ.

**Statistics.** Kruskal–Wallis and Mann–Whitney for ratios; circular statistics (circular SD =
(180/π)·√(−2 ln R)) and Watson's U² for angles.

## 3. The reported numbers

**Sample.** 228 trees: **152 arteriolar, 76 venular**; 7,604 arterial elements (11,014 segments),
5,592 venous elements (8,042 segments); **9,414 bifurcations** (5,431 arterial, 3,983 venous).
~41 nodes per tree: under 36 for arterioles, over 52 for venules (**~50% more for venules**).
Branching Development Index (orders from precapillary vessel to pial origin): **3 to 5**.

**Table 1 — population shares (%).**

| | Arterioles | Venules | Parent order 1 | 2 | 3 | 4 | ALB | HSB | IEB |
|---|---|---|---|---|---|---|---|---|---|
| Share | 57.7 | 42.3 | 71.3 | 21.7 | 6.66 | 0.36 | 54 | 37.4 | 8.6 |

By type, share at parent order 1/2/3/4: ALB 62.6/27.1/9.66/0.55; HSB 79.5/16.6/3.7/0.17; IEB 89.7/9.8/0.5/0.

**Table 2 — area ratios** (log-normal; γ normal on 0–1, mode 0.90, σ² = 0.32).

| | AER (A₁+A₂)/A₀ | A₁/A₀ | A₂/A₀ | γ = A₂/A₁ |
|---|---|---|---|---|
| Median | **1.519** | **0.905** | **0.608** | **0.721** |
| Mean ± SD | 1.626 ± 0.684 | 0.984 ± 0.46 | 0.642 ± 0.294 | 0.686 ± 0.213 |

- **~40%** of bifurcations: major daughter area > parent. Minor daughter > parent: **< 10%**.
  Of those "inverted" bifurcations, 87% also have total daughter area > parent.
- Murray (a = 3) caps the AER at **1.26**; **~¾** of bifurcations exceed it; every group's mean AER ≥ ~1.5.
- Arteriolar area ratios are **~5% higher** than venular, except γ (nearly equal).
- With parent order: A₁/A₀ rises, A₂/A₀ falls, AER is lowest at order 2, γ falls (more asymmetric).
- By type: IEB has the largest AER (1.71); ALB and HSB ≈ 1.50. The major daughter of an IEB arises
  **without tapering**, of an ALB with **weak taper**, of an HSB with **marked taper**.

**Table 3 — branching angles** (mean ± circular SD; close to normal except planarity).

| α₀₁ (parent–major) | α₀₂ (parent–minor) | α₁₂ (daughters) | Asymmetry β | Ω |
|---|---|---|---|---|
| **127.1° ± 27.3** | **114.5° ± 26** | **103.8° ± 27.4** | 12.7° ± 42.7 | 166.8° ± 23.9 |

- Always α₀₁ > α₀₂ > α₁₂: the major daughter continues straighter than the minor one, but still
  turns ~53° on average from straight (180° − 127°).
- **Planarity:** mean out-of-plane angle ~13°; **~⅓ of bifurcations < 2°** (flat), **> ½ < 6°**,
  **¾ < 20°**, **< 10% > 50°**. Distribution is hyperbolic from zero.
- **Venules vs arterioles:** venular parent–daughter angles are larger, so the two venular daughters
  sit **closer together** (smaller α₁₂); venular angular asymmetry slightly smaller. Planarity does not differ.
- With parent order: α₀₁ rises, α₀₂ ~constant, α₁₂ falls, asymmetry rises. ALB has the largest α₀₁.
- Energy-minimization angles (Frame & Sarelius) predicted **75–83°** between daughters, left-skewed,
  with no positional trend; measured angles are > 90° on average; correlation ≈ 0.

**Murray exponent k** (from Cassot 2009, re-analysed here; Fig. 9).

| All (9,414) | Arterioles | Venules | Parent order 1 | 2 | 3 | 4 | ALB | HSB | IEB |
|---|---|---|---|---|---|---|---|---|---|
| median **3.58**, IQR 2.28–6.14, 5–95% 1.36–16.33 | 3.61 | 3.54 | 3.98 | 2.73 | 2.75 | 2.89 | 3.27 | 3.81 | 4.46 |

Arterioles and venules do not differ. Order-1 parents (next to the capillaries) differ from higher
orders. k rises as OAI falls. (Per-group medians read off the Fig. 9 bar labels.)

**Connectivity.** Same-order connectivity ratio rises 0.7 → 0.8 with parent order; lower-order
daughters per parent fall 1.3 → 1.2. Summary: **4 parents of a given order give at least 3
same-order daughters and 5 lower-order daughters.**

## 4. Arguments worth keeping

- **Shear stress reading of k:** if flow Q ∝ Dᵏ, wall shear τ ∝ Dᵏ⁻³: uniform for k = 3 (larger
  vessels), falling toward the capillaries for k ≈ 4 (small vessels). The authors caution that phase
  separation and the huge spread in k make this interpretation tentative.
- **Optimality is not a valid assumption** for microvascular branching (with Djonov 2002, Bennett
  2000); the spread is too large for Murray's law to describe the architecture.
- **Bifurcations are mostly 2D but not all:** consistent with Zamir 1983 in rat (12% of arteriolar
  bifurcations > 10° out of plane); human cortex is more 3D.
- **Authors' limitations:** limited section depth (they argue local ratios and angles don't need
  complete trees), shrinkage (assumed uniform, so ratios hold), post-mortem loss of vascular tone
  (pressure drops across one bifurcation are small, so ratios and angles should hold).

## 5. What is not in this PDF

- **No usable panels.** Fig. 1 is a rendering of extracted trees (scale bar 1 mm), the rest are
  plots and schematics. Nothing enters the `VESSEL_*` dataset.
- **Supplementary Tables 4–7** (the significance tests behind Figs. 3, 4, 7, 8) are online-only and
  were not supplied. The figures and text carry the trends; only exact P-values are missing.
- **Gaps:** vessel diameters in µm (in Cassot 2006 / Lauwers 2008); the resistance threshold that
  separates trees from capillaries; **how arterioles were told from venules** ("morphological
  features" only); capillary-level junction statistics; segment lengths; any within-segment taper
  measurement; the number of subjects is **one**.
- **Deliberately omitted:** the clinical discussion (retinal optimality deviance, Tapp 2007,
  Witt 2006), the Kaimovitz flow-ratio derivation beyond its conclusion, and the reference list.
  Cross-checked against the full text.

## 6. Extracted images

All twelve figures, described (images not committed) in [`figures/README.md`](figures/README.md).
