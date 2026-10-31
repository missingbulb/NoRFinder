# Figures — Blinder et al. 2013

All eight figures, cropped from page renders of
the owner's copy of the PDF (not committed; copyrighted) at 200 dpi (the
embedded rasters are only ~400 px and the plots are vector art, so `extract_pdf_assets.py` alone
does not capture them). Digest: [`../digest.md`](../digest.md).

> **The figure images are not committed.** The article is copyrighted and this repository is
> public, so only these descriptions are kept. The names below are the ones the crops were made
> under; the owner's copy of the PDF holds the originals.

> **There is no `panels/` folder for this paper, deliberately.** Every image is a 3D render of
> the vectorized network, a plot, or an intrinsic optical map. None is an isolated vessel channel,
> so nothing enters the working dataset.


---

## Fig 1 — `fig1_vectorized_angiome`


- **(a,b)** Full-depth reconstruction (1,000 µm wide), surface and penetrating **arterioles red**,
  **venules blue**, subsurface microvasculature pale pink, column borders as a gold band; (b) one
  slice showing how deep the penetrating vessels run. Scale bar 100 µm.
- **(c)** Upper-cortex data set, 3,230 × 2,540 × 730 µm.
- **(d)** How an edge is built: consecutive centerlines, each with a length and radius, between vertices m and n.
- **(e)** Labelling of edges E_mn and vertices V; every vertex drawn has three edges.

What you see: penetrating vessels are long, nearly straight, radial trunks; everything between them
is a dense, isotropic tangle.

## Fig 2 — `fig2_geometry_and_loops` ⭐


**The figure behind the graph invariants.**
- **(a)** Median radius (1–10 µm, log) vs length (1–1,000 µm, log) for 101,992 edges; marginal
  PDFs per brain. Lengths peak around 50 µm; radii cluster around 2 µm. Diagonal lines are
  constant resistance.
- **(b)** Mean radius vs depth (0–1,200 µm): flat at ~2 µm.
- **(c)** Vascular density (bars) and neuronal density (green) by depth and layer: vessels vary
  broadly, neurons peak sharply at layer 4.
- **(d)** Loop size: histogram of edges per microvascular loop (black, 59,909 loops), from 2 to
  ~15 with mode 7–8; the pial network (salmon) peaks at 4. Inset: an 8-edge loop, each edge a
  different colour, **scale bar 20 µm**; the whole loop fits in a few tens of µm.
- **(e)** Flow resistance per µm vs radius (black) with the radius histogram (blue). Resistance
  rises steeply below ~5 µm radius, where Hagen–Poiseuille (dashed) fails.
- **(f)** Schematic of measuring network resistance between two vertices; scale bar 100 µm.
- **(g)** Network resistance vs separation (0–800 µm): rises then flattens at ~0.4 P µm⁻³ by ~150 µm.

## Fig 3 — `fig3_communities`


Community analysis. **(a)** Network coloured by community (1,900 × 1,200 × 1,450 µm), column
borders gold. **(b–d)** Single communities straddling several columns. **(e)** Communities by depth.
**(f)** Inter-community edges vs community size; slope 0.83 sits between "strong" (2/3) and fully
connected (1). **(g)** Communities per column grows with column size.

## Fig 4 — `fig4_flow_domains`


Computed flow domains: **(a)** each penetrating arteriole's territory (vessels getting ≥ half their
flow from it) in its own colour; **(b,c)** single domains against columns; **(d)** overlap in layer 4
(1,050 × 1,450 × 150 µm); **(e)** domains per column vs column size.

## Fig 5 — `fig5_penetrating_vessels`


**(a)** Flattened cortex, penetrating arterioles (red) and venules (blue) over columns A1–E10.
**(b)** Arteriole and venule coverage from column centre to septum: flat (no alignment).
**(c)** Nearest-neighbour distance between penetrating arterioles and between penetrating venules
(0–400 µm). **(d)** Primary side branches (green) of penetrating arterioles and venules, depth
0–1,200 µm. **(e)** Depth distribution of those primary branches: arterioles peak at layer 4,
venules at the surface.

## Fig 6 — `fig6_intrinsic_optical_signal`

Intrinsic optical signal maps for single whiskers and their centroids relative to columns and
penetrating vessels (scale bars 1,000, 500, 200 µm). Not vascular morphology; kept for completeness.


## Fig 7 — `fig7_occlusion_flow_loss`


**(a)** Cartoon and NeuN section of the cyst after a penetrating-arteriole occlusion (scale bar
500 µm). **(b)** Computed domain volume vs arteriole flux, with measured cyst volumes.
**(c,e)** Labelling of downstream (D1, D2…) and upstream (U1, U2…) edges from an occluded
penetrating arteriole or venule. **(d,f)** Fraction of baseline flow vs edge order: recovery by
~10 edges (arteriole) and ~6 edges (venule), against in-vivo rat data (green).

## Fig 8 — `fig8_lattice_model`


Lattice models: **(a)** 1D chain of alternating arteriole sources and venule sinks; **(b)** rhombic
lattice with two venules per arteriole; **(c)** regions of no flow after a block; **(d)** lattice
prediction vs data.
