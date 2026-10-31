# Reference digest — Smith et al. 2019, brain capillary networks across species

> Self-contained digest of the source paper. **No need to reopen the PDF.**

- **Title:** *Brain Capillary Networks Across Species: A few Simple Organizational Requirements Are
  Sufficient to Reproduce Both Structure and Function*
- **Authors:** Amy F. Smith, Vincent Doyeux, Maxime Berg, Myriam Peyrounette, Mohammad
  Haft-Javaherian, Anne-Edith Larue, John H. Slater, Frédéric Lauwers, Pablo Blinder, Philbert Tsai,
  David Kleinfeld, Chris B. Schaffer, Nozomi Nishimura, Yohan Davit, **Sylvie Lorthois\***
  (\*corresponding). IMF Toulouse; Cornell; Delaware; INSERM Toulouse; Tel Aviv; UC San Diego.
- **Venue / id:** *Frontiers in Physiology* (2019) **10:233**. DOI **10.3389/fphys.2019.00233**.
  **Open access, CC BY.** Supplementary Material online (not fetched; see §5).
- **PDF:** [`smith-2019-capillary-networks-across-species.pdf`](https://github.com/missingbulb/vascularColoring/blob/54badaa922556913bed2e51834440b5419b940ca/references/smith-2019-capillary-networks-across-species/smith-2019-capillary-networks-across-species.pdf)
- **One-line thesis:** mouse and human cortical capillary beds are topologically the same and differ
  only in scale; a 3D Voronoi network trimmed to three-way junctions, with one length scale
  L_C (75 µm mouse, 90 µm human), reproduces their geometry, topology, flow and transport.

---

## 1. Why this matters to *our* task ⭐

**This paper contributes capillary-bed statistics and a generator, not images to measure.**

- **A metric set for scoring a capillary graph**, measured on mouse cortex: segment length
  **44.8 ± 2.4 µm (SD 28 µm)**, **7.2% of interior junctions with > 3 branches**, **11.2 edges and
  486 µm per shortest loop**, **5.1 loops per edge**, tissue-to-vessel distance **mean 18.4 µm, local
  maxima 29.4 µm, maximum 50 µm**. These feed B2, B3, B5, B6 and B12 in
  [`../BIOLOGY-INVARIANTS.md`](../BIOLOGY-INVARIANTS.md).
- **The capillary bed has no direction of its own.** Under an imposed pressure gradient, three-way
  capillary junctions split **about evenly into converging (2 in, 1 out) and diverging (1 in, 2 out)**.
  A capillary path does not narrow or widen consistently in the flow direction; it is a mesh, not a tree.
- **A synthetic-network generator** (constrained 3D Voronoi, trimmed to degree 3) that could make
  test volumes with known topology. Our project rule prefers real images to synthetic ones for
  testing (they encode our own assumptions), so treat this as a source of *expected statistics*, not
  of test inputs.
- **Caution on independence:** the mouse data are 7 ROIs cut from the **same reconstructions as
  Blinder 2013 / Tsai 2009**. Agreement between Smith and Blinder is not two independent confirmations.

**What it does not cover:** arterioles and venules (excluded on purpose), vessel diameters (all set
to 5 µm), tortuosity (straight lengths only), hippocampus, junction angles.

## 2. The method

**Mouse data.** Somatosensory cortex from the Tsai 2009 / Blinder 2013 gel casts: saline then
fluorescein-albumin in 2% gelatin at 0.5 ml/s, cooled, PFA; two-photon imaging at 1 µm³;
vectorized as in Tsai 2009; diameters histogram-matched to in-vivo values (Cruz Hernández 2019).
Arterioles and venules were traced from the surface downstream/upstream while diameter stayed
above **7.2 µm**, a threshold chosen so the resulting trees held no loops. **7 capillary-only ROIs,
240 × 240 × 240 µm, deeper than 650 µm** below the pia.

**Human data.** Duvernoy's India-ink-injected brain (the same brain as Cassot 2010), lateral collateral
sulcus (fusiform gyrus), 300 µm sections, confocal at 1.22 × 1.22 × 3 µm. Radii and lengths scaled
×1.1 for shrinkage. Arterioles/venules by Duvernoy's morphological classification, trees cut at
**9.9 µm**. **4 ROIs, 264 × 264 × 207 µm** (one at 300 µm depth, three below 1 mm), re-segmented
with DeepVess and corrected by hand; less reliable near the confocal depth limit.

**Synthetic networks.** Seed one random point in each cube of side L_C, build the 3D Voronoi
diagram (its edges are capillaries), then merge tiny or narrow faces, merge close vertices, delete
excess edges while keeping every vertex at ≥ 3 connections, and split leftover ≥ 4-way vertices into
bifurcations. Cut an interior ROI to avoid boundary effects. Uniform 5 µm diameters everywhere.
Also two lattices: cubic (degree 6) and a periodic degree-3 lattice.

**Metrics.** Extravascular distance (EVD) maps on 1 µm voxels, their local maxima, a box-counting
test of space filling, and Baish's convexity index; lengths (straight), edge/vertex/length densities;
percentage of interior vertices with > 3 connections; **shortest loops**: for each vertex and each
pair of its neighbours, the length-weighted Dijkstra path between the two neighbours avoiding the
vertex, closed through it, duplicates removed; edges per loop, loop length, loops per edge;
1D network flow (linear pressure–flow, mass conservation) for velocity and permeability; transit
times and an exchange coefficient; single-capillary occlusions.

## 3. The reported numbers

**Mouse ROIs vs synthetic S75 (L_C = 75 µm), mean ± SD over ROIs.**

| Metric | Mouse (7 ROIs) | S75 |
|---|---|---|
| Mean straight segment length | **44.8 ± 2.4 µm** (SD within ROI 28.1 ± 2.3) | 36.0 ± 1.5 (SD 18.5) |
| Length density | **673 ± 58 mm/mm³** (= 0.67 m/mm³) | 674 ± 20 |
| Interior vertices with > 3 connections | **7.2 ± 0.9%** | 2.2 ± 1.0% |
| Edges per shortest loop | **11.2 ± 1.2** | 10.3 ± 0.6 |
| Shortest-loop length | **486 ± 60 µm** | 368 ± 35 |
| Loops per edge | **5.1 ± 0.3** | 4.9 ± 0.4 |
| Mean EVD | **18.4 ± 0.9 µm** | 20.2 ± 0.6 |
| Mean of EVD local maxima | **29.4 ± 1.5 µm** | 34.5 ± 1.4 |
| Maximum EVD | **50.1 ± 3.7 µm** | 53.4 ± 2.6 |
| Convexity index | 0.9 ± 0.1 | 0.9 ± 0.0 |

**Shapes of the distributions (Fig. 4, read off):** edges per loop in mouse spread from ~2 to ~25,
broadly flat between ~5 and ~19, with a few percent at 2–4; lengths on a log axis from ~5 to ~250 µm,
peaking at 40–60 µm.

**Human vs mouse.** Same topology; human mean length **34.4% longer**; human loops noisy (4 ROIs).
Human mean EVD ~15.8% higher. Synthetic S90 vs human: EVD +13% (mean) and +19% (max), mean length
−30%, edge density +42%, loops per edge +42%, loop length −32%.

**Space filling.** Box counting of EVD local maxima reaches slope −3 (homogeneous in 3D) at scales
≳ L_C; the capillary bed is space-filling above ~25–75 µm (Lorthois & Cassot 2010).

**Convergence.** In synthetic networks, mean length, edges per loop and loops per edge converge (within
5%) by a domain of (3–4 L_C)³; permeability needs (5.5 L_C)³. The 240 µm mouse ROIs are (3.2 L_C)³,
so their loop counts sit ~4% from converged and permeability ~25% low. **Loop counts are lower near
a domain's boundary** (Fig. 9A).

**Flow and occlusion.** Three-way junctions split about evenly into converging and diverging under a
pressure gradient. After occluding one capillary: converging junctions keep a moderate share of the
outflow; diverging junctions lose 70–75% in the higher-flow branch, flow reverses in the other branch,
and in 13–18% of cases both outflows stop. Mean flow ratios 26–29% in diverging junctions.

## 4. Arguments worth keeping

- **Capillary networks need only three ingredients** to reproduce structure and function: isotropic
  and space-filling, mostly three-way junctions, and convex tissue domains of one characteristic size.
- **L_C ≈ twice the typical maximum inter-capillary distance**, at least the mean capillary length,
  broadly 50–100 µm.
- **Rat counts of 4–7 capillaries per loop (Hudetz 1988)** are lower than theirs, perhaps because long
  loops are hard to trace by hand, or a species difference.
- **Finite size matters:** loop metrics in small volumes are biased low near the boundary. Our slabs
  are far thinner than their ROIs, so our closed-loop statistics will be biased much more (B15).
- **Limitations (authors):** uniform diameters, no tortuosity, capillary-only ROIs of limited size
  (smaller than the representative volume), few human ROIs.

## 5. What is not in this PDF

- **No panels.** Fig. 1 is a diameter-coloured render of the mouse reconstruction (scale bar 500 µm);
  the rest are schematics and plots. Nothing enters the `VESSEL_*` dataset.
- **Supplementary Material** (sections S1–S2, Tables S1–S2, Figs. S1–S7: Voronoi trimming details,
  lattice derivations, linear fits, human comparison plots) is online only and was not fetched.
- **Gaps:** no junction angles, no diameters (imposed), no per-depth statistics, no degree-4 share
  separated from degree ≥ 5, no tortuous lengths (estimated ~20% longer than straight).
- **Deliberately omitted:** permeability, exchange-coefficient and transit-time details, the
  tissue-engineering discussion, references. Cross-checked against the full text.

## 6. Extracted images

All eleven figures, described in [`figures/README.md`](figures/README.md).
