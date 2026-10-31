# Biology invariants — what a real cerebral vessel graph must look like

> **Status: draft for expert sign-off (2026-10-29; Blinder 2013, Cassot 2010, Ji 2021 and Smith 2019 digested the same day).** Nothing here waits on that sign-off: the
> algorithms may use these invariants now, and a rejected one gets removed from scoring.
> Each invariant names its sources, a confidence, the number to test, and how to use it in scoring.
> The reviewer column at the end of each item is for the expert.

**What this is for.** An extracted vessel graph can be judged by how much it looks like a real
vascular network, independently of any one image. These invariants are biology, not algorithm:
they hold across every extraction method and feed one scoring function. Algorithm ideas live with
the algorithms; this file holds only claims about the tissue.

**Our samples.** CD31 (PECAM-1) immunostained z-stacks of fixed **mouse** brain, 20×, 0.55 µm/px,
one 1200 × 1200 field (≈ 660 × 660 µm) per stack, 12–24 slices with an unknown z-step. Two
regions: **frontal cortex** and **hippocampal CA1**. Almost every vessel in such a field is a
capillary. Every number below is from mouse cortex unless it says otherwise; CA1 has its own
correction where one is known.

**Confidence scale.**
- **High**: several independent quantitative sources in mouse brain agree.
- **Medium**: one solid quantitative mouse source, or several sources from another species or tissue.
- **Low**: theory (an optimality argument), indirect evidence, or our own inference from the sources.

---

## Summary

| # | Invariant | Number to test | Confidence | Use |
|---|---|---|---|---|
| B1 | The undirected graph **has loops**; the flow graph has **no directed cycles** | loops allowed; no flow orientation may cycle | High | Do not penalize loops as such |
| B2 | Loops are **mostly long**: typically 8–11 segments | short loops (2–4 segments) are ~15% of loops at most; 2-segment loops ~1–4% | High (mouse cortex) | Penalize a surplus of short loops, not each one |
| B3 | Junctions are **three-way** | degree 3 in ~93–99% of junctions; 4-way ≤ ~7% | High | A degree-4 rate above ~7% means crossings were merged |
| B4 | Junction **angles are wide** and junctions are **nearly flat** | capillaries: smallest ≈ 84°, median ≈ 118°; trees: daughters ≈ 104° apart; ½ of junctions < 6° out of plane | Medium–High | Penalize narrow forks (< ~40°) and strongly 3D junctions |
| B5 | Capillary **segment length** | median ≈ 45–50 µm; mean 45 ± SD 28 µm; 10–200 µm range | High | Score the length distribution |
| B6 | Capillary **tortuosity** | ≈ 1.2–1.3 (path / chord) | Medium | Score bendiness; > ~2 is suspect |
| B7 | **Capillary width** is nearly uniform and small | lumen ~2–5 µm (radius median ~2 µm); within-segment SD ≈ 0.4 µm | High | Capillaries carry no usable taper at 0.55 µm/px |
| B8 | **Murray's law** holds only loosely at single junctions | per-junction exponent median ~3.6, IQR 2.3–6.1; larger daughter wider than parent in ~40% | High (that it is loose) | At most a broad prior; the **thinnest** branch is the reliable signal |
| B9 | Optimal-branching **angle formulas do not predict real angles** | predicted 75–83° between daughters vs measured ≈ 104°; correlation ≈ 0 | High (rejection) | Do not score angles against Murray's angle formula |
| B10 | **Narrowing gives flow direction only on the arterial side** | arterial: thinnest branch is downstream; venous: thinnest branch is upstream | High (direction) / Low (telling sides apart in CD31) | Score orientation consistency, not absolute direction |
| B11 | Width changes **at junctions**, not smoothly along a segment | step at each branch point; near-constant between | Low–Medium | Start/end width is a tree-side cue; expect ~0 slope on capillaries |
| B12 | **Space filling**: no tissue is far from a vessel | mean tissue-to-vessel distance ~10–20 µm; max ~50 µm (cortex) | High | Large empty volumes flag missed vessels |
| B13 | **Length density** by region | cortex ~0.9–1.0 m/mm³; hippocampus ~0.68, Ammon's horn ~0.65 | High (ratio) / Medium (absolute, fixed tissue) | Sanity range per region; CA1 ≈ ⅔ of cortex |
| B14 | **CD31 signal is patchy along a vessel** | gaps along real vessels are expected | Medium | Pixel-support checks must tolerate gaps |
| B15 | A thin slab **cuts most loops open** | loop ~490 µm vs slab ~tens of µm | Low (our inference) | Expect few closed loops; many vessels end at the slab faces |
| B16 | **No blind ends inside the tissue** | real vessels end only where the volume is cut | Medium–High | An interior dead end is a gap or a spur |

The scale estimates for one of our fields are in [§ Expected amounts in one field](#expected-amounts-in-one-field).

---

## B1. Loops exist; directed flow cycles do not

**Claim.** The brain's vessel graph is **not** a tree and not an undirected acyclic graph. Its
capillary bed is a highly interconnected mesh, and the pial arteries on the surface are joined in
loops too. What is true is narrower: blood flows from high to low pressure, so in steady flow
every vessel can be oriented from its high-pressure end to its low-pressure end, and that
**flow-oriented graph has no directed cycle** (a cycle would need pressure to fall all the way
round and come back to where it started).

**What holds at which scale.**
- *Pial surface arteries:* a 2D network of loops, ~4 edges per loop, spanning the whole
  middle-cerebral-artery territory (Blinder 2010; Blinder 2013 Fig. 2d).
- *Penetrating arterioles and venules:* long radial trunks that feed and drain the mesh; each is a
  flow bottleneck (Nishimura 2007). Their side branches form trees with 3–5 diameter orders
  between the precapillary vessel and the pial origin (Cassot 2010, human).
- *Capillary bed:* a 3D mesh; network resistance between two points stops growing beyond ~150 µm,
  the signature of a 3D lattice, and there are no weakly attached sub-networks (Blinder 2013);
  "mesh-like, in contrast to arterioles and venules, which form quasi-fractal hierarchies" (Smith 2019).

**A caution for scoring.** Any undirected graph can be given an acyclic orientation, so "no
directed cycle" constrains nothing on its own. It bites only together with B8 and B10, which fix
the orientation of some edges from their widths.

**Sources.** Blinder et al. 2013 ([digest](blinder-2013-cortical-angiome/digest.md)); Blinder et al. 2010, *PNAS* 107:12670 ([PMC2906564](https://pmc.ncbi.nlm.nih.gov/articles/PMC2906564)); Smith et al. 2019 ([digest](smith-2019-capillary-networks-across-species/digest.md)); Cassot et al. 2010 ([digest](cassot-2010-cortical-branching-patterns/digest.md)); Nishimura et al. 2007, *PNAS* 104:365 (secondary summary only).

**Confidence.** High.

**Use in scoring.** Never penalize a loop for being a loop. Penalize (a) a surplus of short loops,
per B2, and (b) any orientation, derived from widths, that closes a directed cycle.

Expert: ☐ agree ☐ disagree ☐ comment: ______

## B2. Loops are mostly long

**Claim.** A typical capillary loop has 8–11 segments and runs several hundred micrometres around.
Short loops of 2–4 segments do occur, but they are a minority.

**Numbers.**
- Blinder 2013, mouse vibrissa cortex: **mean 8 edges per loop** over 59,909 loops; the histogram
  (Fig. 2d) runs from 2 to ~15 edges with a mode at 7–8. Read off the figure (approximate): loops
  of 2, 3, 4, 5 edges are ≈ 4%, 5.5%, 6%, 9% of loops, so **2–4-edge loops ≈ 15%**. Its inset shows
  an 8-edge loop only a few tens of µm across.
- Ji 2021, whole mouse brain: the shortest loop through a branch is 8.97 ± 0.53 branches (mean ± SE);
  two-branch loops ≈ 0.011 of loops (median).
- Smith 2019, mouse cortex: 11.2 ± 1.2 edges per loop; mean loop length 486 ± 60 µm.
- Hudetz 1988, rat (cited by Smith 2019): 4–7 capillaries per loop.

**Sources.** Blinder et al. 2013 ([digest](blinder-2013-cortical-angiome/digest.md)); Ji et al. 2021 ([digest](ji-2021-whole-brain-microvascular-topology/digest.md)); Smith et al. 2019 ([digest](smith-2019-capillary-networks-across-species/digest.md)). Smith's mouse loops come from the same reconstructions as Blinder's, so those two are not independent.

**Confidence.** High that loops are typically ~8–11 segments. Medium on the short-loop share: the
sources count loops differently, and Blinder's 2-edge share (~4%) is above Ji's (~1%).

**Use in scoring.** Score the **distribution** of loop sizes, not each loop. A graph where short
loops (≤ 4 segments) are much more than ~15% of loops, or 2-segment loops much more than a few
percent, is merging crossings or tracing one vessel twice. The image that started this research
has several 3–4-segment loops in a small area, which is that surplus.

Expert: ☐ agree ☐ disagree ☐ comment: ______

## B3. Junctions are three-way

**Claim.** Vessel junctions are almost always bifurcations: one vessel splits into two, or two merge into one.

**Numbers.** Blinder 2013: **0.93 triads, < 0.07 four-way "crosses"**; their adjacency matrix has
exactly three entries per vertex. Ji 2021: degree-3 nodes are 0.968–0.987 of nodes (interquartile
range across regions); mean degree 3.02 ± 0.02; branches per node 1.529, close to the 3/2 of a pure
degree-3 graph. Smith 2019: 7.2 ± 0.9% of interior vertices in mouse cortex have more than three connections.

**Sources.** Blinder et al. 2013 ([digest](blinder-2013-cortical-angiome/digest.md)); Ji et al. 2021 ([digest](ji-2021-whole-brain-microvascular-topology/digest.md)); Smith et al. 2019 ([digest](smith-2019-capillary-networks-across-species/digest.md)). Blinder cites earlier cast and dye studies that found
microvessels "joined only as triads".

**Confidence.** High.

**Use in scoring.** A degree-4 node is most often two vessels crossing at different depths. A
degree-4 rate well above ~7% says crossings are being merged. A degree ≥ 5 node is almost
certainly an artifact (a knot).

Expert: ☐ agree ☐ disagree ☐ comment: ______

## B4. Junction angles are wide, and junctions are nearly flat

**Claim.** At a junction the three branches spread out, and they lie close to one plane.

**Numbers.**
- Ji 2021, all vessels, angles between the three branch tangents (tangent = principal direction of
  the first 10 skeleton voxels): smallest 84 ± 4°, median 118 ± 2°, largest 145 ± 3° per node (means across regions).
- Ji 2021, planarity: the third branch sits on average **14.8°** out of the plane of the other two
  (mean projection 0.255), whole mouse brain.
- Cassot 2010, human arteriolar and venular trees, 9,414 bifurcations, mean ± circular SD:
  parent–larger daughter **127° ± 27**, parent–smaller daughter **115° ± 26**, between daughters
  **104° ± 27**. The larger daughter continues straighter than the smaller one, yet still turns ~53°
  from straight on average. Venular daughters sit closer together than arteriolar ones.
- Cassot 2010, planarity: **~⅓ of junctions are flat (< 2° out of plane), over half < 6°, ¾ < 20°,
  under 10% > 50°.**

**Sources.** Ji et al. 2021 ([digest](ji-2021-whole-brain-microvascular-topology/digest.md)); Cassot et al. 2010 ([digest](cassot-2010-cortical-branching-patterns/digest.md)).

**Confidence.** Medium–High: two independent sources agree on wide angles (one mouse, one human);
planarity from two independent sources (Ji mouse ~15° on average, Cassot human ~13°).

**Use in scoring.** Penalize a junction whose two closest branches are under ~40° apart (more
likely one vessel traced twice, or a shallow crossing) and one far out of plane. Measure angles from
tangents just outside the junction (Cassot uses a sphere the size of the widest branch), not from
end-to-end chords.

Expert: ☐ agree ☐ disagree ☐ comment: ______

## B5. Capillary segment length

**Claim.** A capillary runs about 45–50 µm between junctions; long unbranched runs are rare.

**Numbers.** Blinder 2013: lengths **10–200 µm, median 50 µm** (101,992 edges, tortuous length);
"no edges that spanned hundreds of micrometers". Ji 2021: median capillary branch length 46 ± 1 µm
(somatosensory cortex), 45 ± 1 µm (inferior colliculus), 67 ± 3 µm (corpus callosum, white
matter); branches under 40 µm dominate. Smith 2019, mouse cortex: mean 44.8 ± 2.4 µm, SD 28.1 µm
(straight length; tortuous length ~20% longer). Human capillaries are ~34% longer than mouse (Smith 2019).

**Sources.** Blinder et al. 2013 ([digest](blinder-2013-cortical-angiome/digest.md)); Ji et al. 2021 ([digest](ji-2021-whole-brain-microvascular-topology/digest.md)); Smith et al. 2019 ([digest](smith-2019-capillary-networks-across-species/digest.md)).

**Confidence.** High.

**Use in scoring.** Compare the segment-length distribution to a ~45–50 µm median. Many segments
under ~10 µm mean fragmentation or spurious junctions; a segment over ~200 µm with no branch
probably hides missed side branches. Segments cut by the slab faces or the image border are
truncated, so score only interior segments.

Expert: ☐ agree ☐ disagree ☐ comment: ______

## B6. Capillary tortuosity

**Claim.** Capillaries are mildly curved between junctions.

**Numbers.** Ji 2021: tortuosity 1.27 ± 0.05. Smith 2019: tortuous lengths ~20% longer than straight.

**Sources.** Ji et al. 2021 ([digest](ji-2021-whole-brain-microvascular-topology/digest.md)); Smith et al. 2019 ([digest](smith-2019-capillary-networks-across-species/digest.md)), an estimate there, not a measurement.

**Confidence.** Medium.

**Use in scoring.** A traced segment much more tortuous than ~1.3 (say > 2) is likely wandering
between vessels; a perfectly straight chord between distant junctions is likely a shortcut.

Expert: ☐ agree ☐ disagree ☐ comment: ______

## B7. Capillary width is small and nearly uniform

**Claim.** Capillaries have a lumen of ~2–5 µm. A capillary's width varies along its length, but
that variation is local (endothelial structure), about as large as the difference between
capillaries, and not a steady taper in the flow direction.

**Numbers.**
- Blinder 2013: median and mean microvessel radius **near 2 µm**, constant with cortical depth
  (gel-filled vessels, size preserved).
- Ji 2021: mean vessel radius 2.74 µm, median 2.14 µm (whole brain; the PMC author manuscript gives 2.39 / 2.05); in-vivo minimum radius
  1.9 ± 0.3 µm; capillaries ≈ 96% of vessel length; capillary cut-off radius 3.5 µm (where the
  radius distribution leaves its power law). Vessels under ~5 µm shrink after perfusion-fixation;
  Ji corrects lengths by ×1.05.
- Shih lab 2023, EM of mouse visual cortex: lumen ~2–5 µm; standard deviation *within* one
  capillary 0.39 µm vs 0.45 µm *between* capillaries; the transitional segments next to arterioles
  and venules (first ~1–4 branch orders) are wider than mid-capillaries, and the arterial and venous
  transitions do not differ from each other.
- Smith 2019 separates arterioles/venules from capillaries at 7.2 µm diameter (mouse).
- For scale: Blinder's penetrating arterioles have median diameter 11 µm, venules 9 µm.

**Sources.** Blinder et al. 2013 ([digest](blinder-2013-cortical-angiome/digest.md)); Ji et al. 2021 ([digest](ji-2021-whole-brain-microvascular-topology/digest.md)); "Endothelial structure contributes to heterogeneity in brain capillary
diameter", *Vascular Biology* 2023 ([PMC10503221](https://pmc.ncbi.nlm.nih.gov/articles/PMC10503221/)); Smith et al. 2019 ([digest](smith-2019-capillary-networks-across-species/digest.md)).

**Confidence.** High.

**Use in scoring.** At 0.55 µm/px a 0.4 µm variation is under one pixel, and CD31 marks the
endothelium (outer edge), not the lumen. So: expect capillary start and end widths to be equal
within noise, and do **not** infer flow direction from a capillary's own taper. A capillary-sized
trace wider than ~7 µm is either a larger vessel or two vessels side by side.

Expert: ☐ agree ☐ disagree ☐ comment: ______

## B8. Murray's law holds only loosely at a single junction

**Claim.** Averaged over many junctions, trunk and branch sizes follow r₀ᵃ ≈ r₁ᵃ + r₂ᵃ with a
around 3. At any one junction the exponent scatters enormously, and the larger branch is often
wider than the trunk. The robust fact is narrower: **the thinnest of the three branches is almost
always a daughter.**

**Numbers.**
- Cassot 2010, 9,414 human arteriolar and venular bifurcations: per-junction exponent **median 3.58,
  IQR 2.28–6.14, 5–95% range 1.36–16.33**; arterioles 3.61 vs venules 3.54 (no difference); parent
  order 1 (next to capillaries) 3.98, orders 2–4 ≈ 2.7–2.9. Area ratios: (A₁+A₂)/A₀ median 1.52, so
  daughters together are usually wider than the parent (Murray's cap is 1.26; ~¾ exceed it); larger
  daughter A₁/A₀ median 0.91 and **> 1 in ~40% of junctions**; smaller daughter A₂/A₀ median 0.61 and
  **> 1 in under 10%**; daughter ratio A₂/A₁ median 0.72.
- Ji 2021: the radius distribution above r = 3.5 µm follows a power law with exponent −2.73 ± 0.03 (−2.81 in the PMC manuscript),
  which the authors compare to Murray's −3 (a population statistic, not a per-junction one).
- El-Bouri & Payne, statistical model of human penetrating vessels: median exponent 2.5, IQR
  1.75–3.7 (secondary summary).
- Murray 1926 (theory): a = 3. The repo's spur limit also leans on Murray; see
  `analysis/3D-STACKS.md`, "The spur limit — Murray's law".

**Sources.** Cassot et al. 2010 ([digest](cassot-2010-cortical-branching-patterns/digest.md)); Ji et al. 2021 ([digest](ji-2021-whole-brain-microvascular-topology/digest.md)); El-Bouri & Payne ([Liverpool repository](https://livrepository.liverpool.ac.uk/id/eprint/3134475)); Murray CD 1926, *PNAS* 12:207.

**Confidence.** High that a single junction's exponent is too noisy to score tightly (9,414
junctions, though from one human brain). The "thinnest branch is a daughter" rule is >90% in that data.

**Use in scoring.** Do not penalize a junction for missing Murray's law unless it is far outside the
5–95% range (k < ~1.3 or > ~16). Use the **thinnest-branch rule** instead: at a tree junction, the
thinnest branch is a daughter, so the trunk is one of the two wider ones. Only apply this to
non-capillary junctions (r > ~3.5 µm); capillary junctions carry no usable width signal (B7).

Expert: ☐ agree ☐ disagree ☐ comment: ______

## B9. Optimal-branching angle formulas do not predict real angles

**Claim.** Minimum-work theory (Murray 1926) predicts each branch's angle from the radii,
cos θ₁ = (r₀⁴ + r₁⁴ − r₂⁴) / (2 r₀² r₁²), which gives ~75° between equal daughters. Measured cortical
junctions do not follow this.

**Numbers.** Cassot 2010 applied an energy-minimization angle formula (Frame & Sarelius) to 9,414
human junctions: predicted angles between daughters fell in a narrow **75–83°** band; measured angles
average **104°** and spread widely; **the correlation between predicted and measured is close to
zero**. Ji 2021's mouse junctions (median 118°) are wide too.

**Sources.** Cassot et al. 2010 ([digest](cassot-2010-cortical-branching-patterns/digest.md)); Murray CD 1926, *J Gen Physiol* 9:835 (formula from background knowledge).

**Confidence.** High that the formula should not be used for scoring.

**Use in scoring.** Do not score angles against a radius-based optimum. Use the empirical angle
distributions in B4 instead.

Expert: ☐ agree ☐ disagree ☐ comment: ______

## B10. Narrowing gives flow direction only on the arterial side

**Claim.** Blood runs artery → arterioles → capillaries → venules → veins. On the **arterial** side
each junction **divides** flow; on the **venous** side each junction **merges** flow. Combined with
B8, the thinnest branch at a junction is **downstream** on the arterial side and **upstream** on the
venous side. "Narrowing is the flow direction" is therefore true for arterioles and backwards for venules.

**Numbers that bear on telling the sides apart.**
- Blinder 2013, mouse: penetrating **venules outnumber arterioles 3.0 : 1**; median diameter
  **arterioles 11 µm, venules 9 µm**, so in mouse a penetrating venule is not reliably wider. Arteriole
  side branches peak at layer 4; venule side branches peak near the surface.
- Cassot 2010, human: venular trees have **~50% more junctions** per tree, and venular daughters sit
  closer together (smaller angle between them); area ratios differ by only ~5%. The paper sorted
  trees into arterioles and venules "according to their morphological features" without saying which.
- Smith 2019: inside the capillary bed, three-way junctions split **about evenly into converging
  (2 in, 1 out) and diverging (1 in, 2 out)** under a pressure gradient. The bed itself has no
  narrowing direction; the rule above applies only to the arteriolar and venular trees.

**Sources.** Blinder et al. 2013 ([digest](blinder-2013-cortical-angiome/digest.md)); Cassot et al. 2010 ([digest](cassot-2010-cortical-branching-patterns/digest.md)); Smith et al. 2019 ([digest](smith-2019-capillary-networks-across-species/digest.md)).

**Confidence.** High that the two sides run opposite ways. **Low** that our CD31-only stacks can
tell an arteriole from a venule: CD31 labels both, the widths overlap, and Wang 2022 needed α-SMA to
mark arteries. Bushier branching and narrower daughter angles are weak hints for venules.

**Use in scoring.** Score **consistency**, not absolute direction: along one connected tree, every
junction's thinnest branch should point the same way relative to the trunk. Mixed signals along one
tree mean a misread width or a wrong junction. Leave the "artery or vein" label open unless another
channel or the owner supplies it.

Expert: ☐ agree ☐ disagree ☐ comment: ______

## B11. Width changes at junctions, not smoothly along a segment

**Claim.** In the morphometric models of cortical trees, each segment between junctions has a
roughly constant diameter, and diameter drops at branch points. How much it drops depends on the
junction: a trunk that sheds a small side branch barely narrows, while a symmetric split narrows
both daughters clearly. A long arteriole that sheds many small side branches therefore looks
tapered when the side branches are too small to see.

**Numbers.** Cassot 2010: the larger daughter of a same-order (intra-element) junction "arises
without tapering", of an asymmetric-lateral junction "with a weak taper", of a symmetric split
"with a marked taper". Smith 2019 and Blinder 2013 model each edge with a single radius (Blinder's is
the median along the edge).

**Sources.** Cassot et al. 2010 ([digest](cassot-2010-cortical-branching-patterns/digest.md)); Blinder et al. 2013 ([digest](blinder-2013-cortical-angiome/digest.md)); Smith 2019. No source read so far measures taper *within* a segment of a
cortical arteriole directly.

**Confidence.** Low–Medium. This is the first invariant to put to the expert.

**Use in scoring.** A start width and an end width per segment are worth keeping, but expect their
difference to be ~0 on capillaries and small on arterioles. A clear taper along a segment with no
visible side branch is a hint that side branches were missed. The informative signal for direction
is the step across each junction (B8, B10).

Expert: ☐ agree ☐ disagree ☐ comment: ______

## B12. Space filling: no tissue is far from a vessel

**Claim.** Capillaries fill tissue so evenly that every point lies within a few tens of
micrometres of a vessel, and the distance scales with the inverse square root of length density.

**Numbers.** Ji 2021: mean tissue-to-vessel distance 10.0 µm (densest region) to 20.2 µm (corpus
callosum); d̄ = 0.494 · ρ_L^(−1/2) − 3.08. Smith 2019, mouse cortex: mean 18.4 µm, mean of local
maxima 29.4 µm, maximum 50.1 ± 3.7 µm. Deleting one capillary raises the local maximum distance by
only ~2 µm (Ji), so the mesh is redundant.

**Sources.** Ji et al. 2021 ([digest](ji-2021-whole-brain-microvascular-topology/digest.md)); Smith et al. 2019 ([digest](smith-2019-capillary-networks-across-species/digest.md)).

**Confidence.** High for cortex. For CA1, scale by density: ~1.2× larger distances (B13).

**Use in scoring.** Compute, in 3D, the distance from every tissue voxel in the slab interior to the
nearest extracted vessel. Voids with a maximum well over ~50 µm (cortex) or ~60 µm (CA1) most likely
hold a missed vessel. Near the slab faces the nearest vessel may lie outside the stack, so leave a
margin.

Expert: ☐ agree ☐ disagree ☐ comment: ______

## B13. Length density by region

**Numbers.** Ji 2021, metres of vessel per mm³ (shrinkage-corrected): somatosensory cortex
1.01 (capillaries 0.98), piriform cortex 0.72, hippocampus 0.71 (capillaries 0.68), Ammon's horn
0.65, corpus callosum 0.49, inferior colliculus 1.41; vibrissa cortex 0.88 ± 0.17 (Tsai et al.,
as cited). Shaw et al. 2021: lower capillary density in CA1 than in visual cortex, with lower flow
and oxygenation; an older study put perfused capillary density in CA1 at < 30% of cortex.

**Sources.** Ji et al. 2021 ([digest](ji-2021-whole-brain-microvascular-topology/digest.md)); Shaw et al. 2021, *Nat Commun* 12:3190 ([doi:10.1038/s41467-021-23508-y](https://doi.org/10.1038/s41467-021-23508-y)).

**Confidence.** High that CA1 is sparser than frontal cortex, roughly two-thirds. Medium for the
absolute value in our sections: fixed slices shrink differently from Ji's cleared brains, and frontal
cortex is not one of Ji's quoted regions.

**Use in scoring.** A sanity range per region, not a target: a CA1 extraction denser than its
frontal-cortex counterpart deserves a look. Compare normalized densities only; the z-step is unknown,
so per-volume numbers wait on it.

Expert: ☐ agree ☐ disagree ☐ comment: ______

## B14. CD31 signal is patchy along a vessel

**Claim.** CD31 (PECAM-1) concentrates at the junctions between endothelial cells, and capillaries
are one or two endothelial cells around. Along a real vessel the stain therefore brightens and dims
with the cell borders, and short gaps are normal.

**Sources.** PECAM-1 junctional localization (e.g. Privratsky & Newman 2014, *Cell Tissue Res*
355:607; background knowledge, not re-read this session); the one-to-two-cell capillary wall from
the 2023 EM study (B7). The repo's own observation of stain dropouts is in `analysis/STATUS.md`.

**Confidence.** Medium.

**Use in scoring.** When validating a segment by the bright pixels along its path, score coverage
over a window (e.g. the fraction of ~5 µm windows that carry signal), not a mean, so that a few gaps
do not condemn a real vessel. A long stretch with no signal is still evidence against the segment.

Expert: ☐ agree ☐ disagree ☐ comment: ______

## B15. A thin slab cuts most loops open

**Claim (our inference).** A real capillary loop is ~490 µm around and spans tens of micrometres in
every direction, since capillaries are only weakly anisotropic (Ji 2021). Our stacks are a few tens
of micrometres deep, so most loops leave the stack and come back outside it. What survives in the
stack is mostly a forest of pieces with ends on the top and bottom faces, plus a few large loops
that happen to lie flat.

**Confidence.** Low until the z-step is known.

**Use in scoring.** Expect few closed loops, and expect many segment ends at the slab faces; do not
penalize those ends as "dangling". A field full of small closed loops is the opposite of what the
biology predicts here.

Expert: ☐ agree ☐ disagree ☐ comment: ______

## B16. No blind ends inside the tissue

**Claim.** In healthy adult cortex every vessel connects at both ends; nothing dead-ends in the
tissue, and there are no small sub-networks hanging off the main mesh by a single vessel. Within a
volume, a vessel ends only where the volume itself is cut.

**Numbers.** Blinder 2013: in a graph where every junction has three branches, the fraction that can
be weakly attached (a tree hanging off one vessel) scales as (log₂N)/N, negligible at N ~ 10⁴ junctions
per mm³; their community analysis found no near-isolated pockets. Their own extraction found gaps in
**~5% of vessels** and closed them automatically (Kaufhold 2012, "connecting gaps and deleting
open-ended segments"). Ji 2021: the largest connected component holds 0.987 of all branches; even
after a classifier-based cleanup, only 0.485 of interior 240 µm cubes had no open-ended segment, so
residual blind ends are an extraction limit even in the best data.

**Sources.** Blinder et al. 2013 ([digest](blinder-2013-cortical-angiome/digest.md)); Ji et al. 2021 ([digest](ji-2021-whole-brain-microvascular-topology/digest.md)).

**Confidence.** Medium–High for healthy adult tissue. Growing sprouts (development, injury, the
ischemic samples in Wang 2022) can end blindly.

**Use in scoring.** An endpoint well inside the volume (away from the image border and the slab
faces) is evidence of a stain gap or a spur: try to bridge it to a nearby end or vessel, or drop the
stub. Endpoints on the volume's boundary are expected (B15).

Expert: ☐ agree ☐ disagree ☐ comment: ______

---

## Expected amounts in one field

Indicative only. From Ji 2021's density (cortex ~0.98, Ammon's horn ~0.65 m/mm³) and its ratio of
~10.8 junctions per mm of vessel (4.13 million nodes / 384 m), for our 660 × 660 µm field and **per
10 µm of stack depth**:

| Region | Vessel length | Junctions | Median segment |
|---|---|---|---|
| Frontal cortex | ~4.3 mm | ~45 | ~45 µm |
| CA1 | ~2.8 mm | ~30 | ~45 µm (not measured separately) |

Multiply by the slab depth in tens of micrometres once the z-step is known. Fixed-tissue shrinkage,
region differences and slab-face truncation each move these numbers by tens of percent.

---

## Questions for the expert

1. Do CD31-stained cortical arterioles taper between branch points, or only step down at them (B11)?
2. In CD31-only mouse stacks, is there any reliable cue to tell an arteriole from a venule (B10)?
3. Does capillary flow direction stay fixed, or do individual capillaries reverse? If they reverse,
   B1's "no directed cycle" holds only at each instant. (Nguyen et al. 2011, cited by Blinder 2013,
   reports reversals upstream of an occluded venule; we have nothing on healthy tissue.)
4. Are CA1 junction angles, segment lengths and loop sizes known to differ from cortex? Every number
   here except density is from cortex.
5. Is the ~7% ceiling for four-way junctions (B3) real biology, or an extraction artifact? Blinder
   2013 and Smith 2019 both land near 7%; Ji 2021 suggests fewer.
6. Cassot 2010's junction statistics are from human temporal cortex in one brain. Do mouse arteriolar
   junctions have the same spread of Murray exponents and the same wide angles (B4, B8, B9)?

## Sources and what was read

Full `paper-intake` digests in this folder: **Blinder et al. 2013** ([digest](blinder-2013-cortical-angiome/digest.md)),
**Cassot et al. 2010** ([digest](cassot-2010-cortical-branching-patterns/digest.md)), **Ji et al. 2021**
([digest](ji-2021-whole-brain-microvascular-topology/digest.md)) and **Smith et al. 2019**
([digest](smith-2019-capillary-networks-across-species/digest.md)). Smith's mouse data are cut from the
same reconstructions as Blinder's, so mouse-cortex agreement between them counts once.

Read from open full text, not digested: the 2023 capillary-diameter EM study. Abstracts or secondary
summaries only: Blinder 2010, Nishimura 2007, El-Bouri & Payne, Shaw 2021.
