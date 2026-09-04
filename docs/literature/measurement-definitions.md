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

### C. Inner edges of the Caspr-positive regions

Node length = the distance between the **inner edges** of the Caspr⁺ paranodal regions enclosing the
Na<sub>v</sub>1.6⁺ nodal domain — an edge/segmentation definition rather than a profile-threshold one.

*Used in the concussion / traumatic axonal injury literature (Reeves et al., Acta Neuropathologica
2022 — **abstract and secondary summaries only**, full text not retrieved).*

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

**A/B vs C.** Threshold crossings and segmented edges answer different questions. An "inner edge"
depends on whatever segmentation threshold produced the Caspr mask, which is usually a
background-relative absolute level rather than a peak-relative one — so C inherits its bias from
the background estimate, where A inherits its bias from the peak estimate. There is no general
conversion between them.

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
- **Do not compare our numbers to a published value across a definition boundary.** The
  sanity-check table in [`arancibia-carcamo-2017.md`](arancibia-carcamo-2017.md) is on definition A
  and is a legitimate target only if we implement A.

## Recommendation

**Implement A (per-paranode half-maximum) as the project's primary definition**, with the threshold
fraction exposed as a parameter and the global-threshold variant B available behind it for
comparison against the overview's figure.

The case: A is the only definition validated against an independent modality; it is the definition
behind every number we can use as a sanity check; and its per-peak normalisation removes a
brightness-asymmetry bias that B carries into the result. The cost is that A is not what the
overview's figure draws, so the owner should confirm the divergence rather than discover it.

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
