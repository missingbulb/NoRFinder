# Reference digest — Hill et al. 2020, cerebrovascular loss in the aging mouse brain by CE-MRA

> Self-contained digest of the source paper. **No need to reopen the PDF.**

- **Title:** *Detection of Cerebrovascular Loss in the Normal Aging C57BL/6 Mouse Brain Using
  in vivo Contrast-Enhanced Magnetic Resonance Angiography*
- **Authors:** Lindsay K. Hill, Dung Minh Hoang, Luis A. Chiriboga, Thomas Wisniewski,
  Martin J. Sadowski, **Youssef Z. Wadghiri\*** (\*corresponding, wadghiri@med.nyu.edu). NYU
  Grossman School of Medicine / NYU Tandon / SUNY Downstate.
- **Venue / id:** *Frontiers in Aging Neuroscience* (2020) **12:585218**, ORIGINAL RESEARCH.
  DOI **10.3389/fnagi.2020.585218**. Open access. 17 pages.
- **PDF:** [`hill-2020-aging-mra-cerebrovascular-loss.pdf`](https://github.com/missingbulb/vascularColoring/blob/54badaa922556913bed2e51834440b5419b940ca/references/hill-2020-aging-mra-cerebrovascular-loss/hill-2020-aging-mra-cerebrovascular-loss.pdf)
- **One-line thesis:** a home-made **gadolinium-micelle blood-pool contrast agent** makes whole-
  brain **in vivo MR angiography** of the mouse cerebrovasculature possible longitudinally; over
  two years of normal aging the **apparent cerebral blood volume (aCBV) falls significantly**, and
  **CD31 histology on the same animals independently confirms the same rarefaction**.

---

## 1. Why this matters to *our* task

**This is the outlier of the corpus — a different imaging modality entirely.** In-vivo MRI at
(100 µm)³ voxels, not fluorescence microscopy. It contributes **no images to the working
dataset** (§5) and its segmentation method does not transfer.

Its value to us is threefold and quite specific:

1. **A cross-modality validation design worth imitating.** The paper's whole point is that two
   methods with "widely different methods of assessment and spatial resolutions" agree on the
   direction and rough magnitude of vascular loss. That is exactly the argument structure our
   project needs: our figure-crop pipeline will never match raw-confocal absolute numbers, so
   **agreement in direction and ranking across independent methods is the achievable standard**,
   and this paper is a published example of treating that as a sufficient result.
2. **A reference vessel-count density for mouse cortex** — **458 ± 61 vessels/mm²** at 2–4 months
   (§3). This is a *count of vessel cross-sections per area*, not branch density, so it is not
   directly our `count_density` — but it is the same order as Rust 2020's ~310–400 branches/mm²,
   and both are ~5–8× below what our pipeline currently reports. A third independent paper
   pointing the same way.
3. **An explicit, simple, reproducible threshold rule** (§2) — segment at
   `mean + 2.5 × SD` of the ROI, justified as "the minimum value providing vascular segmentation
   while minimizing the inclusion of apparent background tissue". Compare Freitas-Andrade's
   adaptive local `Im(i) + C`. Both are *statistical* thresholds stated as a formula; ours is
   Otsu with a hard-coded floor of 0.13 that nothing in the repo justifies.

---

## 2. Methods

### Contrast agent
Home-made **gadolinium-bearing micellar blood-pool agent**, hydrodynamic diameter
**15.63 ± 0.58 nm** (>99% of the population, N = 5). Blood-pool agents stay intravascular, which
is what makes the vessel lumen — rather than perfused tissue — the thing being imaged.

### MRI acquisition
- **7 T** scanner; volume RF coil (accessible diameter 21.5 mm).
- **Low-resolution:** (150 µm)³, matrix 128 × 128 × 68, **30 min** acquisition.
- **High-resolution:** (100 µm)³ — isotropic, which lets the volume be re-sliced in any plane.
- Registration to the **Dorr et al. (2008) C57BL/6J anatomical atlas** for automated whole-brain
  and per-region segmentation.

### Quantification — apparent CBV (aCBV)
In **ImageJ**. Maximum-intensity projection for qualitative viewing; for the number, an
intensity threshold:

> **SI_CBV ≥ mean SI_ROI + 2.5 · SD_ROI**

**aCBV = the percentage of (100 µm)³ voxels in the ROI exceeding that threshold.** "Apparent"
is doing real work in that name: at 100 µm voxels most capillaries are far below resolution, so
this is a detectable-fraction proxy, not a true blood volume.

### Deformation-based morphometry
**RMINC** in R; deformation field to the Dorr atlas; Jacobian determinant per voxel for local
expansion/contraction; FDR < 5%.

### Histological validation
Same animals, ~24 h after imaging, **N = 5 per age group**. **CD31 IHC** (rabbit anti-mouse
monoclonal, clone **D8V9E**, CST #77699, **1:200**) on PFA-fixed, paraffin-embedded, **5 µm**
sections; automated staining on a Ventana Discovery XT; whole slides scanned on a **Hamamatsu
NanoZoomer**; analysed in **Visiopharm**, whose CD31 vessel-quantification application detects
vessels **in the red channel above a background threshold** and reports **vessels per mm²** of
section — whole section and per cortical/hippocampal ROI.

### Stats
GraphPad Prism. Normality by D'Agostino–Pearson, Shapiro–Wilk and Kolmogorov–Smirnov;
one-way ANOVA + Tukey's HSD. \*p<0.05 … \*\*\*\*p<0.0001.

## 3. Results — the numbers

### aCBV by CE-MRA, longitudinal C57BL/6NTac (%, mean ± SD)

| Age (months) | Whole brain | Cerebral cortex | Cerebellar cortex | Entorhinal cortex | Hippocampus | Striatum |
|---|---|---|---|---|---|---|
| **2–4** | 1.61 ± 0.10 | 2.00 ± 0.10 | 1.82 ± 0.19 | 4.04 ± 0.42 | 2.28 ± 0.26 | 0.87 ± 0.12 |
| **14–16** | 1.29 ± 0.28 | 1.60 ± 0.30 | 1.51 ± 0.30 | 3.54 ± 0.32 | 1.61 ± 0.51 | 0.42 ± 0.39 |
| **24–26** | 1.24 ± 0.13 | 1.35 ± 0.21 | 0.92 ± 0.26 | 2.93 ± 0.20 | 1.80 ± 0.58 | 0.43 ± 0.23 |

Across regions the **aCBV loss over 2 years ranged from 19.95% (entorhinal cortex) to 58.59%**.
The loss is significant by one-way ANOVA, and **steeper in the first year than the second**.

### CD31 histology (vessels/mm²)

| Age (months) | Whole section |
|---|---|
| **2–4** | **458.18 ± 61.28** |
| **14–16** | 419.35 ± 57.91 |
| **24–26** | **361.60 ± 49.03** |

Regional ROIs show the same pattern (e.g. one region 465.93 ± 83.71 → 341.89 ± 38.18,
p < 0.05). **≈21% loss of vessel density over two years**, matching the MRA direction.

### Volumetrics
Whole brain and the **ventricular system** (lateral + third ventricles, cerebral aqueduct, fourth
ventricle) both grow significantly over two years; most of the change happens in the first year.

## 4. Discussion / limitations

- **Resolution is the headline limitation and the authors are upfront about it.** (100 µm)³
  voxels cannot resolve capillaries; aCBV measures only the *detectable* vasculature. The IHC
  comparison exists precisely because the MRA number is a proxy.
- The two techniques are **not expected to agree numerically** — the claim is only that both
  detect significant loss over the same period. Worth internalising as a template for how to
  report our own cross-method comparisons.
- Micro-CT and ex-vivo methods give higher resolution but require sacrifice and risk tissue
  deformation/shrinkage; the trade-off argued for in-vivo MRA is longitudinal measurement of the
  *same* animal.

## 5. Extracted images — and why there is no `panels/` folder here

All nine figures are extracted and described in [`figures/README.md`](figures/README.md).

**Nothing from this paper enters the working dataset.** Figures 2–4 and 8 are **MR angiography
volumes and maximum-intensity projections**, not fluorescence micrographs — a different modality
at a different scale, with no scale bar and no fluorescence channel. Figure 9's CD31 histology
is the only optical microscopy, and it is **5 µm paraffin sections at whole-slide scan
magnification**: vessels appear as isolated cross-sections rather than a connected network, and
the figure panels are small thumbnails within a composite. Neither is a legitimate input to a
segment-skeletonize-and-count pipeline.

| File | Fig | Content |
|---|---|---|
| [`figures/fig1_gd_micelle_characterization.png`](https://github.com/missingbulb/vascularColoring/blob/54badaa922556913bed2e51834440b5419b940ca/references/hill-2020-aging-mra-cerebrovascular-loss/figures/fig1_gd_micelle_characterization.png) | 1 | Gd-micelle composition and physical characterization. |
| [`figures/fig2_timecourse_CE_MRA.png`](https://github.com/missingbulb/vascularColoring/blob/54badaa922556913bed2e51834440b5419b940ca/references/hill-2020-aging-mra-cerebrovascular-loss/figures/fig2_timecourse_CE_MRA.png) | 2 | Time-course CE-MRA after micelle injection. |
| [`figures/fig3_highres_MRA_with_without_micelle.png`](https://github.com/missingbulb/vascularColoring/blob/54badaa922556913bed2e51834440b5419b940ca/references/hill-2020-aging-mra-cerebrovascular-loss/figures/fig3_highres_MRA_with_without_micelle.png) | 3 | High-resolution MRA with vs without contrast — the enhancement the method depends on. |
| [`figures/fig4_segmented_brain_ROIs.png`](https://github.com/missingbulb/vascularColoring/blob/54badaa922556913bed2e51834440b5419b940ca/references/hill-2020-aging-mra-cerebrovascular-loss/figures/fig4_segmented_brain_ROIs.png) | 4 | Atlas-registered brain regions of interest. |
| [`figures/fig5_aCBV_total_cohort.png`](https://github.com/missingbulb/vascularColoring/blob/54badaa922556913bed2e51834440b5419b940ca/references/hill-2020-aging-mra-cerebrovascular-loss/figures/fig5_aCBV_total_cohort.png) | 5 | aCBV across the whole C57BL/6 cohort, whole brain and per region. |
| [`figures/fig6_aCBV_longitudinal_C57BL6NTac.png`](https://github.com/missingbulb/vascularColoring/blob/54badaa922556913bed2e51834440b5419b940ca/references/hill-2020-aging-mra-cerebrovascular-loss/figures/fig6_aCBV_longitudinal_C57BL6NTac.png) | 6 | aCBV in the longitudinally imaged sub-cohort (Table 3 above). |
| [`figures/fig7_aCBV_C57BL6N.png`](https://github.com/missingbulb/vascularColoring/blob/54badaa922556913bed2e51834440b5419b940ca/references/hill-2020-aging-mra-cerebrovascular-loss/figures/fig7_aCBV_C57BL6N.png) | 7 | aCBV in the separate C57BL/6N group. |
| [`figures/fig8_volumetric_changes.png`](https://github.com/missingbulb/vascularColoring/blob/54badaa922556913bed2e51834440b5419b940ca/references/hill-2020-aging-mra-cerebrovascular-loss/figures/fig8_volumetric_changes.png) | 8 | Deformation-based morphometry; whole-brain and ventricular volume change. |
| [`figures/fig9_CD31_IHC_vascular_density.png`](https://github.com/missingbulb/vascularColoring/blob/54badaa922556913bed2e51834440b5419b940ca/references/hill-2020-aging-mra-cerebrovascular-loss/figures/fig9_CD31_IHC_vascular_density.png) | 9 | **The histological validation** — CD31-stained sections and vessels/mm² by age. |
