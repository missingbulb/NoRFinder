# "Node length" is not one quantity — the competing definitions

The literature reports node length under one name and at least three different definitions. They
are not interchangeable and they do not differ by a constant. Because a definition change is
silent — the column keeps its name and its units while the quantity underneath moves — this file
exists to force the choice into the open **before** any number is recorded.

**Nothing here is settled. Choosing the project's definition is the owner's call, not a tuning
step.** The recommendation at the end is a recommendation.

---

## The definitions in play

### A. Per-paranode half-maximum (the reference method)

Distance between **the half-maximum intensity point of each paranode**, taken from a line intensity
profile of the **Caspr** channel drawn through both paranodes. Each crossing is at 50% of *its own*
peak's height.

*Arancibia-Cárcamo et al. 2017 — see [`arancibia-carcamo-2017.md`](arancibia-carcamo-2017.md).*
This is the definition validated against electron microscopy (mean not significantly different,
p = 0.06), which is the only definition in this list with an independent-modality check behind it.

### B. Global-threshold crossings at 50% or 30% of peak height

Same profile, but a **single horizontal threshold** across the whole trace, and the threshold
fraction is tunable (50% or 30%).

*This is what the project overview's Figure 6 actually draws* — both threshold lines sit at 50% and
30% of the **left** peak (54), not of each peak (the right peak is 67). See
[`../project-brief.md`](../project-brief.md) §4.3.

### C. "Gap size", undefined

Node length = the gap between the paired Caspr domains, measured by hand in ImageJ. The source
gives the quantity a name — *"node length (gap size)"* — and **no operational rule**: no threshold,
no edge criterion, no profile.

*Song et al., Acta Neuropathologica 2022 — see
[`song-2022-concussion.md`](song-2022-concussion.md).*

> **This entry was wrong in the first pass of this review**, and the correction matters. It
> previously read *"the distance between the inner edges of the Caspr-positive paranodal
> regions"*, attributed to this paper and sourced from a web-search summary. **That phrasing is
> not in the paper.** The summary paraphrased, and in paraphrasing invented a precision the source
> does not have. Definition C is a *family* of definitions, not a definition — which is exactly
> why a number measured under it cannot be compared with one measured under A or B.
>
> The same first pass also mis-attributed the paper to "Reeves et al."; the authors are Song et al.

### E. Smallest gap between the two Caspr blocks

Node length = *"the smallest gap between two paranodal Caspr-1 blocks"*, measured by hand in FIJI
as a linear ROI on the Caspr channel.

*Appeltshauser, Linke & Heil et al., medRxiv 2022 — see
[`appeltshauser-2022-polyneuropathy.md`](appeltshauser-2022-polyneuropathy.md).* This is the
**clearest operational statement of the gap family** in any source we have, and it is what
definition C should have said.

It is a **minimum over the pair**, not a distance measured along a fitted axis. On a straight,
in-plane node the two coincide; on a tilted or curved axon the minimum gap is systematically
*shorter* than the axial distance, so E under-reports where A and B over-report (via 1/cos θ).

The same source defines two companion quantities on the same staining, worth keeping distinct:
**nodo-paranodal length** (*"the maximal extension of both Caspr-1 blocks and the nodal gap in
between"*, 10.0 ± 4.9 µm in human sural nerve) and **paranodal axonal diameter** (*"the maximal
diameter of paranodal Caspr-1 staining"*, 2.3 ± 0.9 µm).

### D. Serial-section count (electron microscopy)

Node length assessed from the **number of ultrathin sections containing the node**. Not available to
us — listed because it is the yardstick definition A was validated against, and because any
EM-derived literature value is on this definition.

---

## Why the differences matter

**A vs B — asymmetric paranodes.** The two paranodes flanking a node are routinely unequal in
brightness; the overview's own Figure 6 shows peaks of 54 and 67, a 24% difference. Under A each
crossing sits at 50% of its own peak. Under B both sit at 50% of one peak, so the crossing on the
brighter paranode is pushed **outward** — further from the node — because a fixed absolute level is
reached earlier on a steeper, taller flank. **B systematically reports longer nodes than A, by an
amount that grows with the brightness asymmetry.** Since asymmetry varies with staining quality,
depth in the slice and photobleaching, B's bias is not a constant offset that could be calibrated
away — it varies image to image and, worse, potentially between experimental groups.

**50% vs 30% within B.** A lower threshold sits further down the flank, so **30% reports a
systematically longer node than 50%.** The magnitude depends entirely on the flank's steepness,
which is set by the point spread function and the sampling density — so the 50%↔30% gap is itself a
function of the acquisition, not of the biology. Two datasets acquired differently are not
comparable at a fixed threshold fraction.

**A/B vs C/E.** Threshold crossings and segmented edges answer different questions. A gap between
segmented blocks depends on whatever threshold produced the Caspr mask, which is usually a
background-relative absolute level rather than a peak-relative one — so C and E inherit their bias
from the **background** estimate, where A and B inherit theirs from the **peak** estimate. Raise the
background estimate and the blocks shrink and the gap grows; raise the peak and A's crossings move
the other way. There is no general conversion between them.

**C vs E.** They are the same family and still not the same number: E takes the *minimum* gap
across the pair, C is unspecified and was measured by a human drawing a line. Two labs both
reporting "node length from Caspr" can differ systematically without either being wrong.

**E vs everything else, on tilted axons.** E's minimum-gap rule under-reports as the axon tilts out
of plane; A and B, measured along a line drawn through both paranodes, over-report by 1/cos θ if the
line is off-axis. **The two families fail in opposite directions on the same defect**, which means a
disagreement between them is diagnostic of geometry rather than of thresholding — potentially a
useful internal check for us, since we will have both available.

**All of them vs the PSF.** At 63×/1.4 the lateral PSF is roughly 200 nm FWHM against a node of
1–2 µm. Every definition here is measured on a blurred image, and none of the sources corrects for
it. Since blur widens both paranodes symmetrically, it pushes the half-maximum crossings **inward**,
so all of A–C plausibly *under*-report relative to EM — which is consistent with A's p = 0.06
near-difference from the EM mean, and is a reason to treat that agreement as an empirical result
for that acquisition rather than a guarantee that transfers.

---

## The rules this project must hold itself to

- **Report the definition beside every number.** A node length quoted without its definition and
  threshold fraction is not a measurement.
- **Do not re-define mid-project and keep the history.** If the definition changes, re-measure the
  old inputs under the new definition or mark the old numbers as belonging to the old one. Never
  carry both under one column.
- **Keep the threshold a parameter, per the overview's §5.3** — but treat *changing* it as changing
  the metric, not as tuning.
- **Do not compare our numbers to a published value across a definition boundary.** Every published
  value we have is on a *different* definition from at least one other, as the table below shows.

## Every reference value we have, tagged by definition

The whole point of this file, in one place. Note how tightly the healthy-tissue values cluster
**despite** spanning three definitions, two nervous systems and three species — reassuring for
plausibility checking, and no basis at all for a precise comparison.

| Value | Definition | Tissue / species | Source |
|---|---|---|---|
| 1.02 ± 0.02 µm (s.d. 0.29, n = 164) | **A** | Rat optic nerve | [Arancibia-Cárcamo 2017](arancibia-carcamo-2017.md) |
| 1.50 ± 0.05 µm (s.d. 0.58, n = 158, range 0.43–3.72) | **A** | Rat cortex layer V | [Arancibia-Cárcamo 2017](arancibia-carcamo-2017.md) |
| ~1.05 µm (sham; ~1.5 µm at 72 h post-injury) | **C** | Swine periventricular white matter | [Song 2022](song-2022-concussion.md) |
| 0.9 ± 0.3 µm (n = 69) | **E** | Human sural nerve (PNS) | [Appeltshauser 2022](appeltshauser-2022-polyneuropathy.md) |
| ≈ the optic nerve confocal value (p = 0.06) | **D** | Rat optic nerve | [Arancibia-Cárcamo 2017](arancibia-carcamo-2017.md) |

**Closest to the owner's corpus callosum images: Song et al.'s ~1.05 µm** — white matter, and the
only entry from a tissue adjacent to ours — but on the undefined definition C, in swine.

## Recommendation

**Implement A (per-paranode half-maximum) as the project's primary definition**, with the threshold
fraction exposed as a parameter and the global-threshold variant B available behind it for
comparison against the overview's figure.

The case: A is the only definition **operationally specified and validated against an independent
modality** (EM, p = 0.06); it is the definition behind the only published node-length
*distributions* rather than group means; and its per-peak normalisation removes a
brightness-asymmetry bias that B carries into the result. C is not implementable as stated, and E,
though clearly specified, is a minimum-gap rule that will fight us on tilted axons.

Implementing A does not cost us the others: **E is cheap to compute alongside it** once Caspr blobs
are segmented, and the disagreement between the two is diagnostic (see "E vs everything else"
above). Reporting both, clearly labelled, is better than choosing one blind.

The cost is that A is not what the overview's figure draws, so the owner should confirm the
divergence rather than discover it.

**This is a question for the owner, not a decision to implement quietly.**

---

## Open, and not yet answerable

- **What is the µm-per-pixel of the owner's images?** Every definition above yields a length in
  pixels; none yields µm without a per-image calibration read off the acquisition metadata. This
  blocks all of §5.3. It is the first thing to establish when real data arrives, and it is a
  **measurement of each input**, never a constant borrowed from a neighbouring file or inferred
  from a stated microscope setting.
- **What happens when a profile does not have exactly two clean peaks?** No source states it.
  Three peaks (a crossing axon), one merged peak (a very short node), or a shoulder are all
  guaranteed to occur in a field as dense as the overview's Figure 4. The rejection rule is ours to
  invent, and — critically — **the rejected fraction must be reported**, because a definition that
  quietly drops hard cases reports a biased distribution.
- **Is the profile line's orientation fitted or fixed?** The reference drew it by hand. An
  automated line fitted to the Caspr blob axes will differ, and an off-axis line lengthens the
  apparent node by 1/cos θ.
- **Line thickness.** The reference used "slightly less than the Caspr labelling thickness" and
  gave no number.
