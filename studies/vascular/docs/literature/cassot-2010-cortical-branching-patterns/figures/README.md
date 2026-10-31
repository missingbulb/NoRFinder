# Figures — Cassot et al. 2010

All twelve figures, extracted from
the owner's copy of the PDF (not committed; copyrighted)
with `references/_tools/extract_pdf_assets.py` (embedded rasters at native resolution).
Digest: [`../digest.md`](../digest.md).

> **The figure images are not committed.** The article is copyrighted and this repository is
> public, so only these descriptions are kept. The names below are the ones the crops were made
> under; the owner's copy of the PDF holds the originals.

> **There is no `panels/` folder for this paper, deliberately.** Fig. 1 is a rendering of extracted
> trees from India-ink-injected human cortex, and the rest are plots and schematics. None is an
> isolated vessel channel.

---

## Fig 1 — `fig1_arteriolar_venular_trees`


Extracted trees, **arterioles grey, venules black**, scale bar **1 mm**. Trees descend from the
pial surface (top) into cortex. Venular trees look bushier near the surface; arteriolar trunks run
longer before branching.

## Fig 2 — `fig2_area_ratio_histograms` ⭐


Histograms (bin 0.1) of AER (black), major ratio A₁/A₀ (red) and minor ratio A₂/A₀ (blue, own
axis), with log-normal fits. The red A₁/A₀ histogram runs well past 1: the larger daughter is often
wider than the parent. The AER histogram peaks near 1.4–1.5, above Murray's 1.26 cap.

## Fig 3 — `fig3_area_ratios_by_group`


Mean A₁/A₀, A₂/A₀, AER and A₂/A₁ (bars ± SD) for arterioles vs venules, parent order 1–4, and type
ALB/HSB/IEB. Arteriolar ratios ~5% above venular; A₂/A₁ falls with order.

## Fig 4 — `fig4_area_ratios_by_type_and_order`


The same four ratios split by type, then by parent order inside each type (hatched bars).

## Fig 5 — `fig5_angle_polar_histograms`


Polar histograms of α₀₁, α₀₂, α₁₂ and asymmetry. α₀₁ mass sits around 110–150°, α₁₂ around 90–120°.

## Fig 6 — `fig6_feed_angle_and_planarity` ⭐


**Top:** α₀₁ histogram with a Gaussian fit centred near 127°, spanning ~60–200°. **Bottom:**
out-of-plane angle histogram (0–60°), steeply hyperbolic from 0: most bifurcations are near-flat.

## Fig 7 — `fig7_angles_by_group`


Mean angles (± circular SD) by nature, parent order and type: α₀₁ rises with order, α₁₂ falls;
venules have larger α₀₁/α₀₂ and smaller α₁₂ than arterioles.

## Fig 8 — `fig8_angles_by_type_and_order`


The angles split by type, then by parent order inside each type.

## Fig 9 — `fig9_murray_exponent` ⭐


**Top:** box plot of the per-bifurcation Murray exponent k on a log axis (~0.5 to ~1,000 outliers),
box roughly 2–6. **Bottom:** median k labelled on each bar: arteries 3.61, veins 3.54; order 1 3.98,
order 2 2.73, order 3 2.75, order 4 2.89; ALB 3.27, HSB 3.81, IEB 4.46.

## Fig 10 — `fig10_connectivity_matrix`


Connectivity matrix as stacked columns: for each parent order (1–4, with their shares 71.3%, 21.7%,
6.65%, 0.35%), the share of daughters of each order. The same-order share (bottom stack) is 0.7–0.8.

## Fig 11 — `fig11_strahler_taxonomy`


Schematics of **(a)** ALB and **(b)** HSB bifurcations; **(c,d)** plain vs diameter-defined Strahler
ordering on a rendered junction, where (d) yields an IEB; **(e)** an arteriolar tree coloured by
order 0–4.

## Fig 12 — `fig12_angle_measurement`


How angles are measured: a sphere at the node with radius equal to the largest local vessel radius;
the unit vectors u₀, u₁, u₂ are averaged tangents where each centerline crosses the sphere; α₀₁, α₀₂,
α₁₂ are the angles between them.
