# Reference digest — Blinder et al. 2013, the cortical angiome

> Self-contained digest of the source paper. **No need to reopen the PDF.**

- **Title:** *The cortical angiome: an interconnected vascular network with noncolumnar patterns of blood flow*
- **Authors:** Pablo Blinder, Philbert S. Tsai, John P. Kaufhold, Per M. Knutsen, Harry Suhl,
  **David Kleinfeld\*** (\*corresponding, dk@physics.ucsd.edu). UC San Diego; SAIC.
- **Venue / id:** *Nature Neuroscience* **16**(7):889–897, July 2013. DOI **10.1038/nn.3426**.
  Paywalled; PDF supplied by the owner (2026-10-29). 11 pages including Online Methods.
- **PDF:** not committed: the article is copyrighted (Nature Neuroscience) and this repo is public. The owner holds a copy; this digest and the figures below are the working record.
- **One-line thesis:** the mouse cortical microvasculature, reconstructed in full over several
  mm³, is a highly interconnected 3D mesh of loops whose topology and computed flow ignore
  cortical columns; penetrating venules act as sinks, so collateral flow does not rescue tissue
  when one penetrating vessel is blocked.

---

## 1. Why this matters to *our* task ⭐

**This paper contributes graph statistics, not images.** All its figures are renders of
vectorized networks or plots; there is no isolated vessel channel to add to the working dataset
(§5). What it gives is the most direct published description of **what a correct cortical vessel
graph looks like**, measured on mouse, which is our species:

- **Junctions are three-way:** 0.93 of vertices are triads, under 0.07 are four-way "crosses".
- **Microvessels are short and thin:** lengths 10–200 µm, **median 50 µm**; median and mean radius
  **near 2 µm**, essentially constant with depth. No edge spans hundreds of µm.
- **The microvasculature is a mesh of loops**, **8 edges per loop on average** (59,909 loops), with a
  real tail of short loops (Fig. 2d). The 2D pial network has loops of ~4 edges on average.
- **No weakly attached sub-networks:** the graph has no near-isolated pockets or dangling trees,
  which the authors tie to the fixed degree of 3.
- **Penetrating venules outnumber penetrating arterioles 3.0 : 1** in mouse; median diameters
  **arterioles 11 µm, venules 9 µm**.

These feed invariants B1–B5, B7, B10 and B16 in [`../BIOLOGY-INVARIANTS.md`](../BIOLOGY-INVARIANTS.md).

**What it does not cover:** hippocampus (vibrissa cortex only), CD31 staining (they fill vessels
with a fluorescent gel), branching angles, Murray's law, diameter changes at junctions, or taper.

## 2. The method

**Tissue.** 12 male C57BL/6 mice, 22–24 g. Transcardial perfusion with heparinized saline at
1 ml/min, then 20 ml of **10% fluorescein-albumin gel** by hand at constant pressure, head-down;
gel cured in ice water ~30 min; 4% PFA 8–12 h. The fixation was "designed to minimize the collapse
of large surface vessels and preserve the structure of the microvasculature" and the authors say
the gel filling "preserved the size of the vessels". Nuclei: DAPI (all) + anti-NeuN–Alexa 594 (neurons).
Arterioles vs venules: traced on the surface to the middle cerebral artery vs the sagittal sinus /
rhinal vein.

**Two data-set types.**
1. *Full depth:* n = 4 mice, 2–3 mm³ each, 12–46 columns, pia to white matter.
2. *Upper cortex, all of vS1:* n = 4 mice, 60–70 columns, pia to ~layer 5a, flattened cortex;
   intrinsic optical imaging first. 4 more mice gave auxiliary data.

**Imaging.** All-optical histology: two-photon block-face imaging with a 25× 0.95 NA dipping
objective, **1 µm cubic voxels**, tiles with 50 µm overlap, imaged 150–200 µm deep, then the top
50–70 µm ablated with amplified femtosecond pulses (~4 µJ, 200 fs, 800 nm, 5 kHz), repeated.
Stitching by normalized 3D cross-correlation and a global linear solution; up to 2,000 blocks,
20 gigavoxels.

**Vectorization.** Vessels are short centerlines, each with a radius and one of 26 directions;
two neighbours each except at branch points, where three centerlines meet (Kaufhold 2012). Radii
corrected for axial/lateral resolution and point spread. **About 0.05 of vessels had gaps,
corrected automatically.** An **edge** is a whole vessel between vertices: length = summed
centerline length (tortuosity kept), radius = **median** of its centerlines. Penetrating vessels
were checked by eye; some surface vessels traced by hand.

**Flow.** Edge resistance from a modified Hagen–Poiseuille law (Pries 1990) with an
empirical correction for red cells: ρ = 8·η·L/(π·R⁴) times a radius-dependent factor (the
equation in the PDF does not extract cleanly; see Pries et al. 1990). Kirchhoff current
conservation at every vertex; 50 torr between the open ends of surface arterioles and venules;
no free parameters. Network resistance between vertex pairs from the eigenvectors of the graph
Laplacian (Wu 2004). Communities by modularity maximization (Blondel 2008), consensus over 1,000 runs.

## 3. The reported numbers

| Quantity | Value | n / notes |
|---|---|---|
| Vertex degree | **0.93 triads, < 0.07 crosses** (4-way) | all data sets |
| Microvessel length | 10–200 µm, **median 50 µm** | 101,992 edges, 4 brains |
| Microvessel radius | median and mean **near 2 µm**; constant with depth (Fig. 2b) | same |
| Edges per compact loop | **mean 8** (Fig. 2d histogram, 2 to ~15) | 59,909 loops, 4 brains |
| Pial-surface loops | mean **4** edges (from Blinder 2010) | 2D network |
| Network resistance | asymptote **0.4 P µm⁻³** reached by **~150 µm** (≈ 3 × median length) | 1,000 vertex pairs per brain |
| Equivalent uniform edge resistance | 1.6 P µm⁻³ | |
| Penetrating vessel resistance, surface to layer 4 | arterioles 0.1, venules 0.2 P µm⁻³ | |
| Community scaling exponent | **0.83 ± 0.04** (2/3 = strong communities, 1 = fully connected) | 311 communities |
| Penetrating venules : arterioles | **3.0 ± 0.1** (mouse); rat estimates 1.8 and 2.6 | 262 columns, 8 mice |
| Penetrating arteriole diameter | broad, **median 11 µm**; some barely thicker than microvessels | |
| Penetrating venule diameter | broad, **median 9 µm** | |
| Primary branches off penetrating arterioles | peak at layer 4 | Fig. 5e |
| Primary branches off penetrating venules | peak near the surface, fall with depth | Fig. 5e |
| Arteriole–venule nearest-neighbour spacing | 1.1 × random (weakly anti-correlated) | P < 0.0001 |
| Microvascular volume fraction (cited, Tsai 2009) | 0.0074 | |
| Median microvessel blood speed, top 400 µm (computed) | matches 0.4 mm/s observed in rat | |
| Flow loss after one penetrating-arteriole block | half recovery at 6 edges downstream, full at 10 | 100 sims per order |
| Flow loss after one penetrating-venule block | half recovery at 4 edges, full at 6 | |

**Read off Fig. 2d (approximate, ±0.01):** normalized density of loops with 2, 3, 4, 5 edges ≈
0.04, 0.055, 0.06, 0.09; mode 7–8 edges at ≈ 0.15. So **loops of 2–4 edges are roughly 15% of
compact loops**: rarer than typical, not absent.

## 4. Arguments worth keeping

- **Why there are no isolated pockets** (Online Methods): in a graph where every vertex has degree 3,
  counting outward from one vertex doubles the count each step, so after log₂N steps nearly all N
  vertices are reached; the fraction that can be weakly attached (e.g. a tree hanging off one edge)
  scales as (log₂N)/N, negligible at N ~ 10⁴ per mm³. The network is "modestly random": not
  crystalline, not small-world.
- **Resistance that plateaus with distance means a 3D lattice.** It would grow linearly in 1D and
  logarithmically in 2D.
- **Lattice model (Fig. 8):** penetrating arterioles are sources, penetrating venules sinks, ~1:2;
  blocking a source isolates a hexagon of radius ≈ 0.91 venule spacings (~10 vertices), blocking a
  sink ≈ 0.49 (~5 vertices). The vertex count between two venules is (100 µm / (50 µm/√2))² ≈ 10.
- **Flow model limits (authors):** linear flux–pressure relation ignores red-cell stalling at low
  pressure, so calculated flow near an occlusion is small but non-zero where experiments show zero.
  The fit to occlusion data improved slightly if microvessels were dilated by < 0.5 µm (arteriole
  case) or constricted (venule case).
- **Flow reversal is cited, not studied:** ref. 22 (Nguyen et al. 2011, *JCBFM*) reports that
  occluding a cortical ascending venule causes flow decreases, **reversals of flow direction** and
  dilation in upstream capillaries.

## 5. What is not in this PDF

- **No usable panels.** Every figure is a render of the vectorized graph, a plot, or intrinsic
  optical maps. Nothing goes into the `VESSEL_*` dataset, and nothing needs calibration.
- **No supplementary material** is referenced by the paper.
- **Gaps:** no length distribution numbers beyond the median and range; no per-depth loop
  statistics; no branching angles; no diameter ratios at junctions; no statement of tissue
  shrinkage beyond the claim that the gel preserved vessel size; the edge-resistance formula does
  not survive text extraction (constants visible: 0.863, 27.5, 14.3 µm, 0.351 µm).
- **Deliberately omitted:** the intrinsic-optical-signal results (Fig. 6) beyond one line, community
  details, acknowledgements and references beyond those cited here. Cross-checked against the full text.

## 6. Extracted images

All eight figures, described (images not committed) in [`figures/README.md`](figures/README.md):
`fig1_vectorized_angiome`, `fig2_geometry_and_loops` ⭐, `fig3_communities`, `fig4_flow_domains`,
`fig5_penetrating_vessels`, `fig6_intrinsic_optical_signal`, `fig7_occlusion_flow_loss`,
`fig8_lattice_model`.
