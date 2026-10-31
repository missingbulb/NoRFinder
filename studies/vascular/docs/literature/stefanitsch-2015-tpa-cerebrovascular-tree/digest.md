# Reference digest — Stefanitsch et al. 2015, tPA deficiency and the cerebrovascular tree

> Self-contained digest of the source paper. **No need to reopen the PDF.**

- **Title:** *tPA Deficiency in Mice Leads to Rearrangement in the Cerebrovascular Tree and
  Cerebroventricular Malformations*
- **Authors:** Christina Stefanitsch, Anna-Lisa E. Lawrence, Anna Olverling, Ingrid Nilsson,
  **Linda Fredriksson\*** (\*corresponding, linda.fredriksson@ki.se). Karolinska Institutet,
  Division of Vascular Biology; University of Michigan Medical School.
- **Venue / id:** *Frontiers in Cellular Neuroscience* (2015) **9:456**, ORIGINAL RESEARCH.
  DOI **10.3389/fncel.2015.00456**. Open access. 12 pages.
- **PDF:** [`stefanitsch-2015-tpa-cerebrovascular-tree.pdf`](https://github.com/missingbulb/vascularColoring/blob/54badaa922556913bed2e51834440b5419b940ca/references/stefanitsch-2015-tpa-cerebrovascular-tree/stefanitsch-2015-tpa-cerebrovascular-tree.pdf)
- **One-line thesis:** mice lacking tissue-type plasminogen activator (tPA) have a **structurally
  rearranged cerebrovascular tree** — fewer large, smooth-muscle-covered vessels and more small
  ones — plus more ERG⁺ endothelial cells, more junctional ZO1, less perivascular PDGFRα, and
  mild lateral-ventricle malformations.

---

## 1. Why this matters to *our* task ⭐

**This paper contributes numbers, not images.** Its imaging is all two-channel
(vessel marker + DAPI), so it yields **no isolated vessel-channel panels** and adds nothing to
the working dataset — see §5, which says so plainly rather than forcing unsuitable crops in.

What it does contribute is the thing no other paper in the corpus has given us:

> **The first external, quantitative reference for our CATEGORIZE ask.**

Rust 2020 explicitly declines to classify vessel types. Wang 2022 shows *which markers* sit on
artery walls but never bins by caliber. This paper measures **vessel diameter distributions and
bins them**, in µm, for healthy adult mouse cortex — which is exactly the quantity
`ARTERY_DIAM_PX` is a proxy for.

### The reference caliber distribution (wild-type mouse cortex)

| Marker | Mean vessel diameter (WT) | Size distribution (WT) |
|---|---|---|
| **CD31⁺** (all endothelium) | **6.03 ± 0.3 µm** (n = 211 vessels) | **< 5 µm: 54 ± 6%** · 5–10 µm: ~36% · **> 10 µm: 10 ± 1%** |
| **ASMA⁺** (smooth-muscle-covered = arteries/arterioles) | **22.9 ± 1.3 µm** | **< 15 µm: 17 ± 8%** · **> 30 µm: 19 ± 3%** |

**Two things fall straight out of this, and both are actionable:**

1. **Our artery threshold is probably far too low.** `ARTERY_DIAM_PX = 9` px converts to
   **5.9 µm** on the wang fig4/5/6 panels — which by this paper's numbers is *below the mean
   diameter of all CD31⁺ vessels* (6.03 µm) and squarely inside the capillary population.
   Smooth-muscle-covered vessels average **22.9 µm**. Whatever the right cut is, a threshold
   that classifies a mean-sized capillary as an artery is not it.
2. **The threshold is in the wrong units.** `ARTERY_DIAM_PX` is a fixed *pixel* value applied
   across panels with different µm/px, so it silently means a different physical diameter on
   every figure:

   | Panels | µm/px | What 9 px actually means |
   |---|---|---|
   | wang fig4/5/6 | 0.658 | 5.9 µm |
   | wang fig1 | 0.820 | 7.4 µm |
   | wang fig3 | 1.064 | 9.6 µm |
   | rust20 fig1 adult overview | 1.351 | 12.2 µm |
   | rust20 fig3 overview | 1.190 | 10.7 µm |

   A vessel of one real size is classified differently depending on which figure it appears in.
   **The caliber threshold should be a µm constant converted per panel through `umpp_for()`** —
   the same fix the Freitas-Andrade digest recommends for the smoothing σ and prune length.

Coincidentally our current split reports ~10% arteries on the wang panels, which *matches* the
paper's 10% of CD31⁺ vessels > 10 µm. Treat that as a coincidence to be checked, not a
validation: it is produced by a threshold that means 5.9 µm, not 10 µm.

---

## 2. Design and methods

- **Animals:** adult **tPA⁻/⁻ mice, n = 5**, vs **WT littermate controls, n = 5**.
- **Tissue:** isoflurane anaesthesia → transcardial perfusion with 4% PFA/PBS → 1 h post-fix RT
  → 30% sucrose overnight 4 °C → **50 µm vibratome sections**, stained free-floating.
- **Staining:** permeabilize/block in 1% BSA + 0.5% Triton X-100/PBS overnight 4 °C; primaries
  **1:200** overnight 4 °C; secondaries (AF488/568/647) overnight 4 °C; DAPI 0.2 µg/ml.
- **Markers used** (a useful catalogue in itself):

  | Marker | Cat # | Labels |
  |---|---|---|
  | **CD31** | BD 553370 | endothelium |
  | **Podocalyxin** | R&D AF1556 | endothelium (second, confirmatory marker) |
  | **ASMA-Cy3** | Sigma C6198 | vascular smooth muscle → arteries/arterioles |
  | **CD13** | AbD Serotec MCA2183 | pericytes **and** vSMC on larger vessels |
  | **ERG1** | Abcam ab92513 | endothelial nuclei (transcription factor) |
  | **ZO1** | Invitrogen 339100 | tight junctions |
  | **Collagen IV** | AbD Serotec 21501470 | basement membrane |
  | **GFAP** / **AQP4** | Dako Z0334 / Millipore AB2218 | astrocytes / perivascular endfeet |
  | **GLUT1** | Santa Cruz sc-1605 | endothelial + ependymal glucose transporter |
  | **PDGFRα** | R&D AF1062 | perivascular fibroblast-like cells |
  | **S100B** | Dako Z0311 | ependyma (needs boiling antigen retrieval) |

- **Imaging:** Zeiss **LSM700** confocal or Zeiss **Axio Observer Z1**, ZEN 2009. Analysis on
  **maximum-intensity projections of 15–22 µm Z-stacks**, or epifluorescent images.
- **Sampling:** 4–11 fields of view per animal, matched anatomic positions located via the DAPI
  channel, in cortex / hippocampus / amygdala (regions with high tPA expression). No sub-regional
  differences found.
- **Quantification:** pixel count above a set threshold, with **identical acquisition settings
  within a staining experiment**; software Volocity 3D / ImageJ64 / Photoshop CS5.
- **MRI:** 7.0 T Varian, coronal T2 fast spin-echo, TR/TE 4000/60 ms, FOV 20 × 20 mm, matrix
  256 × 128, 0.5 mm slices × 25.
- **Stats:** GraphPad Prism 6.0, unpaired Student's t-test, mean ± SEM.

> ⭐ **A methodological practice worth stealing:** *"Stained brain sections … were analyzed by two
> independent investigators **blinded** to the study group. In addition … at least one set of
> images from each respective staining was reanalyzed by a second blinded investigator."* Two
> blinded readers, plus a re-read for control. That is the gold standard our
> `expected-results.md` visual-expectation practice is a one-reader approximation of.

## 3. Results

1. **Cerebrovascular tree rearrangement (Fig 1).** tPA⁻/⁻ vessels are smaller: mean CD31⁺
   diameter **4.75 ± 0.2 vs 6.03 ± 0.3 µm** (P<0.01). Distribution shifts: **< 5 µm 67 ± 4% vs
   54 ± 6%** (P<0.05); **> 10 µm 1 ± 0.8% vs 10 ± 1%** (P<0.01). Total CD31 staining reduced
   only non-significantly (80 ± 12% of WT, P = 0.31). Confirmed independently with podocalyxin.
   *(Vessel counts on the bars: WT 114/76/21 = 211; tPA⁻/⁻ 180/85/4 = 269.)*
2. **More endothelial cells, tighter junctions (Fig 2).** Significantly more **ERG⁺ nuclei** in
   tPA⁻/⁻ (also after normalizing to CD31 intensity), and increased **junctional ZO1**.
3. **Loss of large ASMA⁺ vessels (Fig 3).** Mean ASMA⁺ diameter **15.4 ± 0.7 vs 22.9 ± 1.3 µm**
   (P<0.01); **< 15 µm: 61 ± 6% vs 17 ± 8%**; **> 30 µm: 5 ± 1% vs 19 ± 3%** (both P<0.01).
   Total ASMA amount unchanged (P = 0.46) — the smooth muscle is redistributed, not lost.
   **CD13** shows normal capillary pericyte coverage but loss of the large CD13⁺ vessels,
   so overall CD13 staining falls (P<0.05).
4. **Basement membrane and astrocytes normal (Fig 4).** Collagen IV, GFAP and AQP4 all normally
   distributed around similar-sized vessels — the rearrangement is vascular, not glial.
5. **Perivascular PDGFRα reduced (Fig 5).** Total PDGFRα unchanged, but **vessel-associated**
   PDGFRα significantly reduced.
6. **Ventricular malformations (Fig 6).** Lateral-ventricle asymmetry on MRI (smallest:largest
   ratio **70 ± 5%** in tPA⁻/⁻, n = 13, vs **86 ± 4%** WT, n = 10), hypoplastic septum, thicker
   ependymal lining, increased ependymal GLUT1 (**580 ± 144% of WT**) and ZO1 — the punctate WT
   ZO1 pattern becoming continuous. Milder than the *Pdgfc⁻/⁻* phenotype (56 ± 6%).

**Interpretation:** the barrier protection previously seen in tPA⁻/⁻ mice may be partly
structural — a vascular bed rebuilt with fewer large vessels and more, tighter capillaries —
rather than purely signalling. The ventricular phenotype links tPA to PDGF-C signalling in vivo.

## 4. Limitations / gaps

- **No µm/px, no field dimensions** stated for any objective.
- **How vessel diameter was measured is not described** — no algorithm, no manual-vs-automatic
  statement, beyond "analyzed using Volocity / ImageJ64". The caliber numbers we most want are
  the least methodologically specified in the paper.
- Correlative: a constitutive knockout, so developmental and adult effects cannot be separated.
- Detailed per-staining analysis parameters are in **Supplementary Table S1**, not in the PDF.

## 5. Extracted images — and why there is no `panels/` folder here

All six figures are extracted and described in [`figures/README.md`](figures/README.md).

**No panel from this paper enters the working dataset.** Every micrograph is a **two-channel
merge** — vessel marker plus DAPI nuclei, and often a third marker — so none is an isolated
vessel channel. Cropping them would put images into `VESSEL_*` that violate the dataset's one
contract (single-channel, vessels bright on dark), and the blue DAPI speckle would be measured
as texture by any thresholding pipeline. Combined with the absence of any stated pixel size,
there is nothing here to calibrate either.

The figures are still worth having: they are the visual record behind the caliber numbers in §1,
and Figure 3 in particular shows what a **genuinely large, ASMA⁺, smooth-muscle-covered vessel**
looks like next to capillaries — which is the distinction our CATEGORIZE ask is trying to make.

| File | Fig | Content |
|---|---|---|
| [`figures/fig1_CD31_podocalyxin_vessel_calibre.png`](https://github.com/missingbulb/vascularColoring/blob/54badaa922556913bed2e51834440b5419b940ca/references/stefanitsch-2015-tpa-cerebrovascular-tree/figures/fig1_CD31_podocalyxin_vessel_calibre.png) | 1 | **The caliber figure.** CD31 (green) + DAPI, WT vs tPA⁻/⁻; diameter and size-distribution bar charts; podocalyxin (red) confirmation. |
| [`figures/fig2_ERG_ZO1.png`](https://github.com/missingbulb/vascularColoring/blob/54badaa922556913bed2e51834440b5419b940ca/references/stefanitsch-2015-tpa-cerebrovascular-tree/figures/fig2_ERG_ZO1.png) | 2 | ERG⁺ endothelial nuclei and junctional ZO1. |
| [`figures/fig3_ASMA_CD13_mural_cells.png`](https://github.com/missingbulb/vascularColoring/blob/54badaa922556913bed2e51834440b5419b940ca/references/stefanitsch-2015-tpa-cerebrovascular-tree/figures/fig3_ASMA_CD13_mural_cells.png) | 3 | **ASMA⁺ artery caliber** + CD13 mural cells. |
| [`figures/fig4_collagenIV_GFAP_AQP4.png`](https://github.com/missingbulb/vascularColoring/blob/54badaa922556913bed2e51834440b5419b940ca/references/stefanitsch-2015-tpa-cerebrovascular-tree/figures/fig4_collagenIV_GFAP_AQP4.png) | 4 | Basement membrane and astrocytes — the negative result. |
| [`figures/fig5_PDGFRa_perivascular.png`](https://github.com/missingbulb/vascularColoring/blob/54badaa922556913bed2e51834440b5419b940ca/references/stefanitsch-2015-tpa-cerebrovascular-tree/figures/fig5_PDGFRa_perivascular.png) | 5 | Perivascular PDGFRα loss. |
| [`figures/fig6_ventricular_defects.png`](https://github.com/missingbulb/vascularColoring/blob/54badaa922556913bed2e51834440b5419b940ca/references/stefanitsch-2015-tpa-cerebrovascular-tree/figures/fig6_ventricular_defects.png) | 6 | Ventricular malformation: DAPI sections, MRI montage, ependymal markers. |
