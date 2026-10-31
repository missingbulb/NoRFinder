# Reference digest — Ji et al. 2021, whole-brain microvascular topology

> Self-contained digest of the source paper. **No need to reopen the PDF.**

- **Title:** *Brain microvasculature has a common topology with local differences in geometry that
  match metabolic load*
- **Authors:** Xiang Ji, Tiago Ferreira, Beth Friedman, Rui Liu, Hannah Liechty, Erhan Bas,
  Jayaram Chandrashekar, **David Kleinfeld\*** (\*lead contact, dk@physics.ucsd.edu). UC San Diego;
  HHMI Janelia.
- **Venue / id:** *Neuron* **109**:1168–1187 (2021), in press online Feb 2021 (the copy read paginates
  1–20). DOI **10.1016/j.neuron.2021.02.006**. © Elsevier. Free author manuscript at
  [PMC8525211](https://pmc.ncbi.nlm.nih.gov/articles/PMC8525211); the publisher PDF read here came from
  [the Kleinfeld lab site](https://neurophysics.ucsd.edu/publications/1-s2.0-S0896627321000805-main.pdf).
- **PDF:** not committed: the article is copyrighted (Elsevier) and this repository is public. The
  two links above hold it; this digest is the working record. No figure images are committed either.
- **One-line thesis:** in a sub-micrometre reconstruction of three whole mouse brains, every region
  shares one network topology (three-way junctions, near-planar, compact loops, the same percolation
  threshold), while regions differ in length density, which tracks resting metabolism so that the
  largest oxygen drop in tissue is about the same everywhere (~16 mmHg).

---

## 1. Why this matters to *our* task ⭐

**This is the largest, most complete measured vessel graph there is, and it is mouse.** It gives the
invariant numbers we score against, *across brain regions*, including hippocampus:

- **Junctions:** 96.8–98.7% three-way; mean degree 3.02; branch/node ratio 1.529 (≈ 3/2).
- **Junction geometry:** angles between branch tangents, per junction, smallest **84°**, median
  **118°**, largest **145°**; the third branch sits on average only **14.8° out of the plane** of the
  other two. Junctions are near-planar Y's.
- **Loops:** shortest loop through a branch **8.97 branches**; two-branch loops ≈ **1%**.
- **Segments:** median capillary length **45–46 µm** (dense regions) to 67 µm (corpus callosum);
  under 40 µm dominate; over 200 µm rare; tortuosity **1.27**.
- **Radius:** capillary/non-capillary cut at **r = 3.5 µm**; minimum in-vivo radius **1.9 µm**.
- **Density by region:** somatosensory cortex **0.98**, hippocampus **0.68**, Ammon's horn **0.65 m/mm³**.
- **Distances:** mean tissue-to-vessel distance d̄ = 0.494·ρ_L^(−1/2) − 3.08 µm; maxima about twice that.
- **Few blind ends survive good extraction:** even after their classifier-based cleanup, about half
  (0.485) of the interior 240 µm cubes still had at least one open-ended segment.

These feed B2–B7, B12, B13 and B16 in [`../BIOLOGY-INVARIANTS.md`](../BIOLOGY-INVARIANTS.md).

**What it does not cover:** CD31 staining (vessels filled with fluorescent gel), Murray's law at single
junctions, taper, flow direction, arteriole vs venule labels (non-capillaries are lumped by radius).

## 2. The method

**Animals.** 3 male C57BL/6 mice, 50–80 days old.

**Labelling.** Heparin; transcardial perfusion of 60–150 ml oxygenated Ringer's (37 °C, 10 U/ml
heparin) at 30 ml/min (13 ml/min for mouse 3), head tilted down, then 10% porcine gelatin with 0.4%
FITC-BSA, cross-linked to lumen proteins. Fill check against in-vivo imaging: 7 partly unfilled short
segments in 2,835 (0.998 gap-free; the rest had gaps < 10 µm).

**Imaging.** Serial-section two-photon tomography (MouseLight platform), 0.3 × 0.3 × 1 µm voxels,
~20,000 overlapping stacks per brain; non-rigid stitching on vessel skeletons; composite at
0.25 × 0.25 × 1 µm; analysis downsampled to 1 µm isotropic, in **240 µm cubes** on a 208 µm pitch
(~50,000 per brain). Raw data 200 TB, not deposited; code at neurophysics.ucsd.edu/software.php.

**Segmentation.** Median filter for shot noise; two computations intersected: a rod matched filter
followed by a Frangi vesselness filter, and an intensity threshold; then agglomerate high-SNR
neighbours and drop small clusters.

**Graph.** Topology-preserving thinning (Lee & Kashyap 1994) on 5×5×5-cube blocks; centerline voxels
shifted toward brighter neighbours when topology allows; each voxel classed as isolated, endpoint,
link or node (≥ 3 of 26 neighbours); radius = distance to the nearest vessel/void boundary.
**Random-forest classifiers** then remove isolated voxels, short segments with free ends and false
connections (from poor axial resolution and close vessels), and add linkers that bridge free ends
(after Kaufhold 2012); > 0.95 accuracy against manual annotation. Manual check: 3 connectivity errors
in 2,133 segments. A branch's radius is the **median** over its centerline voxels.

**Radius refinement.** Look-up tables of a uniformly fluorescent tube blurred by a 3D Gaussian PSF,
by radius and elevation angle; iterate the radius by re-thresholding at the predicted edge intensity
(converges in ~3 steps), and jointly re-fit the PSF (lateral HWHM ≈ 0.41–0.44 µm, axial ≈ 3.4 µm).
**In-vivo calibration:** adaptive-optics two-photon imaging in 6 mice before and after gel perfusion,
102,284 matched positions: vessels below ~5 µm radius shrink after perfusion; a calibration curve
converts to in-vivo radius. Tissue shrinkage corrected by a linear factor of 1.051 (geometric mean).

**Analyses.** Degree, tortuosity, tangent angles (principal direction of the first 10 skeleton
voxels), elevation of the third tangent from the plane of the first two, shortest cycle per branch,
capillary order from the nearest non-capillary, bond percolation by random branch removal,
anisotropy from volume-weighted end-to-end vectors, length density, distance maps, and a Poisson
model of oxygen diffusion.

## 3. The reported numbers

| Quantity | Value | Notes |
|---|---|---|
| Nodes / branches per brain | (4.13 ± 0.17) × 10⁶ / (6.32 ± 0.27) × 10⁶ | mean ± SD |
| Total length / volume | 384 ± 16 m in 443 ± 9 mm³ | shrinkage-corrected |
| Largest connected component | 0.987 ± 0.012 of branches | |
| Degree-3 nodes | **0.968–0.987** (middle quartiles over cubes) | mean degree 3.02 ± 0.02 |
| Branches / nodes | 1.529 | 3/2 for pure degree 3 |
| Independent loops | ≈ N/2 | |
| Tortuosity | **1.27 ± 0.05** | mean ± SE over cubes |
| Tangent angles at a node | min **84 ± 4°**, median **118 ± 2°**, max **145 ± 3°** | |
| Out-of-plane (elevation) of third branch | mean projection 0.255 ± 0.037 → **14.8°** | "branches tend to stay in a plane" |
| Shortest loop through a branch | **8.97 ± 0.53 branches** | mean ± SE |
| Two-branch loops | ≈ **0.011** of loops (median) | |
| Nodes joined to their nearest node | 0.85–0.91 | |
| Mean radius / median radius | 2.74 ± 0.09 / 2.14 ± 0.04 µm (Fig. 3F legend) | the PMC manuscript gives 2.39 / 2.05; see gaps |
| Capillary cut-off | r = **3.5 µm** (radius PDF departs from power law) | |
| Power-law exponent above 3.5 µm | **2.73 ± 0.03**, R² = 0.98 | PMC manuscript: 2.81; Murray predicts 3 |
| Capillaries' share | 0.8 ± 0.2 of volume per cube; **0.959 ± 0.008 of length** | |
| Capillary order from nearest penetrating vessel | mean **3.4 ± 0.2** | arteriole↔venule shortest path ≈ 7 branches |
| Minimum in-vivo radius | **1.9 ± 0.3 µm** | |
| Bond percolation | network breaks after 0.433–0.447 of branches removed (threshold ≈ 0.56) | lattices: 0.542–0.556 |
| Capillary anisotropy | ≈ 0.4, significant | superficial cortex: capillaries lean normal to pia |
| Median capillary length | inferior colliculus **45 ± 1**, somatosensory **46 ± 1**, corpus callosum **67 ± 3 µm** | < 40 µm dominate; > 200 µm rare |
| Length density | corpus callosum 0.49 ± 0.12 … inferior colliculus 1.41 ± 0.05 m/mm³ | 3-fold range |
| — somatosensory / piriform | 0.98 ± 0.02 / 0.72 ± 0.01 m/mm³ | |
| — hippocampus / Ammon's horn | 0.68 ± 0.02 / 0.65 ± 0.02 m/mm³ (Table 1) | |
| — vibrissa cortex (Tsai 2009) | 0.88 ± 0.17 m/mm³, d̄ = 13.3 ± 1.2 µm | consistent with the scaling law |
| Cortical depth profile | peak ~400 µm below pia (auditory, somatosensory, visual) | piriform: highest superficially |
| Mean tissue-to-vessel distance | 10.0 ± 0.2 (inferior colliculus) … 20.2 ± 3.9 µm (corpus callosum) | |
| Scaling | d̄ = 0.494 ρ_L^(−1/2) − 3.08 µm (R² 0.95, 91,751 cubes); d̄_max = 0.955 ρ_L^(−1/2) − 1.85 µm | |
| Losing one capillary | raises its territory's max distance by ≤ ~2.1 µm | |
| Stalled capillaries | ~0.005 normal; 0.01–0.02 in AD models | cited |
| Open-ended segments after cleanup | 0.485 of interior cubes have none | Fig. 1J |
| Oxygen model | ΔpO₂ = 15.9 ± 0.3 mmHg; r_c = 2.19 µm; λ = 0.52 | |

## 4. Arguments worth keeping

- **"Design rules"** shared by every region: triadic, near-planar nodes; low tortuosity; compact loops;
  a near-constant percolation threshold. They give redundancy (one lost capillary barely matters) and a
  cliff (losing ~half fails catastrophically).
- **Length density is the regional variable**, not topology: denser regions have shorter segments.
- **Two-branch loops are rare** (≈ 1%), which the authors read as few mature vessels arising directly
  from intussusceptive angiogenesis.
- **Light-sheet whole-brain maps overestimate diameter** and lose SNR in imperfectly cleared tissue;
  every whole-brain reconstruction so far loses the connection back to surface arteries and sinuses.

## 5. What is not in this PDF / gaps

- **Supplementary items** (Methods S1 MATLAB code, Tables S1–S6, Figures S1–S4, Videos S1–S2) were not
  read; the code is on the lab's software page.
- **Two versions disagree:** the publisher copy read here gives mean radius 2.74 µm and power-law
  exponent 2.73; the PMC author manuscript gives 2.39 µm and 2.81. Quote the publisher numbers and
  treat both as ±0.1.
- **Gaps:** no degree-4 share on its own; no per-junction diameter ratios or Murray fits; no taper; no
  arteriole/venule split; frontal cortex is not among the quoted regions; the full distribution of
  junction angles is only in a figure (means given).
- **Deliberately omitted:** the oxygen/glucose model beyond its headline, fMRI anisotropy discussion,
  references. Cross-checked against the full text.

## 6. Extracted images

None committed (copyright). The figures that matter are described in place above: Fig. 1J
(open-ended segments per cube), Fig. 3C–G (tortuosity, node angles, shortest loops, radius PDF,
capillary order), Fig. 5D–E (length PDFs), Fig. 6 (distance scaling).
