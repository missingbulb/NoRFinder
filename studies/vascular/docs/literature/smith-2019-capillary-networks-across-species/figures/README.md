# Figures — Smith et al. 2019

All eleven figures, extracted from
[`../smith-2019-capillary-networks-across-species.pdf`](https://github.com/missingbulb/vascularColoring/blob/54badaa922556913bed2e51834440b5419b940ca/references/smith-2019-capillary-networks-across-species/smith-2019-capillary-networks-across-species.pdf)
with `references/_tools/extract_pdf_assets.py`. CC BY 4.0, © the authors.
Digest: [`../digest.md`](../digest.md).

> **There is no `panels/` folder for this paper, deliberately.** Fig. 1 is a render of a vectorized
> reconstruction; everything else is a schematic or a plot.

---

## Fig 1 — `fig1_mouse_cortex_rois.png`

![Fig 1](https://raw.githubusercontent.com/missingbulb/vascularColoring/54badaa922556913bed2e51834440b5419b940ca/references/smith-2019-capillary-networks-across-species/figures/fig1_mouse_cortex_rois.png)

**(A)** Mouse cortex from Tsai 2009 seen from above, vessels coloured by diameter (0–15 µm), scale
0–500 µm; three 240 µm ROIs outlined in magenta. **(B)** One ROI. **(C)** The same ROI with vessels
straightened (tortuosity ignored). **(D)** Cubic and periodic lattice motifs.

## Fig 2 — `fig2_constrained_voronoi.png`

![Fig 2](https://raw.githubusercontent.com/missingbulb/vascularColoring/54badaa922556913bed2e51834440b5419b940ca/references/smith-2019-capillary-networks-across-species/figures/fig2_constrained_voronoi.png)

**(A)** 2D constrained Voronoi diagram, one seed per L_C square, polygon areas Gaussian around L_C².
**(B)** The 3D version: polyhedra with many 4–5-way vertices. **(C)** After merging faces and
vertices: mostly three-way, volumes still Gaussian around L_C³.

## Fig 3 — `fig3_loop_finding.png`

![Fig 3](https://raw.githubusercontent.com/missingbulb/vascularColoring/54badaa922556913bed2e51834440b5419b940ca/references/smith-2019-capillary-networks-across-species/figures/fig3_loop_finding.png)

**(A)** How shortest loops are found around root vertex 1 (loops 1-3-4-5-1, 1-5-7-6-2-1, 1-2-8-3-1).
**(B)** Four loops (thick red) in a synthetic network, scale 100 µm. The loops wind through the whole
240 µm box.

## Fig 4 — `fig4_loops_and_lengths_mouse_human.png` ⭐

![Fig 4](https://raw.githubusercontent.com/missingbulb/vascularColoring/54badaa922556913bed2e51834440b5419b940ca/references/smith-2019-capillary-networks-across-species/figures/fig4_loops_and_lengths_mouse_human.png)

**(A)** Percent of loops by edges per loop, mouse (blue) vs human (red), error bars SD over ROIs:
broad, ~5 to ~19 edges, a few percent at 2–4, tail to ~25. **(B)** Segment-length histograms (log
axis, ~5–250 µm), human also shown rescaled to the mouse mean; peaks at 40–60 µm.

## Fig 5 — `fig5_convergence_with_domain_size.png`

![Fig 5](https://raw.githubusercontent.com/missingbulb/vascularColoring/54badaa922556913bed2e51834440b5419b940ca/references/smith-2019-capillary-networks-across-species/figures/fig5_convergence_with_domain_size.png)

Convergence of mean length, loops per edge, edges per loop and permeability with domain size
(1–9 L_C) in synthetic networks; converged sizes 3.5–5.5 L_C.

## Fig 6 — `fig6_scaling_with_lc.png`

![Fig 6](https://raw.githubusercontent.com/missingbulb/vascularColoring/54badaa922556913bed2e51834440b5419b940ca/references/smith-2019-capillary-networks-across-species/figures/fig6_scaling_with_lc.png)

Length density, mean EVD, permeability and mean length vs L_C (60–100 µm), with mouse (blue) and
human (red) bands; L_C = 75 µm matches mouse length density.

## Fig 7 — `fig7_extravascular_distance.png`

![Fig 7](https://raw.githubusercontent.com/missingbulb/vascularColoring/54badaa922556913bed2e51834440b5419b940ca/references/smith-2019-capillary-networks-across-species/figures/fig7_extravascular_distance.png)

**(A)** Synthetic network over EVD slices (0–25+ µm). **(B)** Box counting of EVD maxima; slope −3
above ~L_C. **(C)** EVD histograms on log axes. **(D)** Maximum EVD vs convexity index, with Baish's
normal (black) and tumour (grey) points: all networks fall with "normal".

## Fig 8 — `fig8_morphometry_topology_flow.png`

![Fig 8](https://raw.githubusercontent.com/missingbulb/vascularColoring/54badaa922556913bed2e51834440b5419b940ca/references/smith-2019-capillary-networks-across-species/figures/fig8_morphometry_topology_flow.png)

Mouse vs S75 vs lattices: **(A)** lengths, **(B)** edges per loop, **(C)** loop length vs edges per
loop, **(D)** loops per edge, **(E)** transit times, **(F)** post/pre-occlusion flow ratios at
converging and diverging junctions.

## Fig 9 — `fig9_loops_per_edge_and_pressure.png`

![Fig 9](https://raw.githubusercontent.com/missingbulb/vascularColoring/54badaa922556913bed2e51834440b5419b940ca/references/smith-2019-capillary-networks-across-species/figures/fig9_loops_per_edge_and_pressure.png)

**(A)** A synthetic ROI coloured by loops per edge (0–12): fewer near the box faces. **(B,C)**
Pressure (0–10+ mmHg) under an x-gradient, synthetic and mouse; scale 100 µm.

## Fig 10 — `fig10_radar_comparison.png`

![Fig 10](https://raw.githubusercontent.com/missingbulb/vascularColoring/54badaa922556913bed2e51834440b5419b940ca/references/smith-2019-capillary-networks-across-species/figures/fig10_radar_comparison.png)

Radar plot of percentage error against data for S90 vs human, S75 vs mouse, cubic and periodic
lattices vs mouse: synthetic networks stay closest on every axis.

## Fig 11 — `fig11_other_synthetic_models.png`

![Fig 11](https://raw.githubusercontent.com/missingbulb/vascularColoring/54badaa922556913bed2e51834440b5419b940ca/references/smith-2019-capillary-networks-across-species/figures/fig11_other_synthetic_models.png)

Other published synthetic capillary models (Su/El-Bouri, Safaeian, Linninger, Merrem) and S90 as a
percentage of human values for edge density, permeability, length density, EVD fractions and
tortuous length.
