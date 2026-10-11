# Arancibia-Cárcamo et al. 2017 — Node of Ranvier length as a potential regulator of myelinated axon conduction speed

*eLife 2017;6:e23329 · DOI [10.7554/eLife.23329](https://doi.org/10.7554/eLife.23329) ·
CC-BY · UCL (Attwell lab) + Iwate Medical University · full text read from the publisher PDF.*

**Why this source is first among all of them:** the owner's overview reproduces this paper's
Figure 1 as its own Figures 2 and 7, and its §5.3 plot-profile requirement *is* this paper's node
length method. This is the reference implementation we are automating. These notes are written to
make re-opening the paper unnecessary.

---

## 1. Claim

In rat optic nerve and cerebral cortical axons, node of Ranvier length varies over a **4.4-fold**
(optic nerve) and **8.7-fold** (cortex) range, and varies **much less along a single axon than
between axons**. Modelling predicts these length differences alter conduction speed by ~20% —
comparable to changing the number of myelin wraps or the internode length — while requiring
>270-fold less membrane area change. Node length is therefore proposed as an energy-efficient,
rapid mechanism for tuning information arrival time in the CNS.

For our purposes the biology is context; the **method and its numbers** are the payload.

## 2. The node length method — exactly as performed

This is the procedure the project's §5.3 automates.

**Selection of measurable nodes.** Confocal images analysed in ImageJ. Images were **background
subtracted**. Only nodes lying **approximately parallel to the plane of section** were selected —
operationally defined as *displaying nodal Na<sub>v</sub>1.6 labelling with flanking Caspr-labelled
paranodes all within a single 0.8 µm optical slice*. This is the paper's answer to the project's
§5.2 "horizontal nodes" requirement, and note that it is a **3D** criterion, not an in-plane angle.

**Validation of that selection.** Measuring the angle of the axon to the plane of the slice for a
subset of **10 randomly chosen axons** showed the apparent node length measured this way
**underestimates the true node length by only 1.7% ± 0.6%**. This is a directly reusable
sanity-check target: a correct "horizontal node" filter should carry a bias of this order, and a
much larger one means the filter is admitting tilted axons.

**Projection.** A **maximum intensity projection** was generated over the sections in which Caspr
labelling was present for that particular node — *up to five interleaved confocal slices at 0.38 µm
intervals, maximum stack thickness 2.32 µm*.

**The profile.** A **line intensity profile** was drawn spanning **both Caspr-labelled paranodes**.
Its **thickness was slightly less than the Caspr labelling thickness** — i.e. the line is a
finite-width average, deliberately narrower than the paranodal blob, not a single-pixel sample.
This is a detail the project overview omits and that materially affects profile noise.

**The measurement.** A MATLAB script computed the distance between **the half maximum intensity for
each paranode**. Node length = that distance.

> **The definition is per-peak half-maximum** — each paranode's crossing is taken at 50% of *its
> own* peak height. The project overview's Figure 6 draws a single global threshold instead, and
> also offers 30% as an alternative. The consequences are worked through in
> [`measurement-definitions.md`](measurement-definitions.md); it is a real fork, not a
> restatement.

**What the profile is sampled from.** The **Caspr** channel only. Na<sub>v</sub>1.6 is used to
*identify* a mature node, never to measure its length.

**Cross-validation against EM.** Mean confocal node length was **not significantly different**
(p = 0.06) from the electron-microscopy measurement of the same tissue. This is the strongest
available evidence that the fluorescence plot-profile method is not merely self-consistent but
accurate — and it is why we are automating this method rather than inventing one.

## 3. Acquisition parameters (our closest thing to a target imaging spec)

- **Microscope:** Zeiss LSM700 or LSM780 confocal, **63× NA 1.4 oil** immersion.
- **Pinhole:** set to 1 Airy unit *for the Caspr signal* → **0.8 µm optical slice**.
- **Pixel size:** 39.7 nm (Fig 1A–H); 99.2 nm (Fig 1I); **52.7 nm for the node measurements in
  Fig 2**; 263.6 nm for internode measurements.
- **Z step:** 0.38 µm intervals, interleaved.
- **Antibodies:** rabbit anti-Na<sub>v</sub>1.6 (Alomone, 1:500); mouse anti-Caspr clone K65/35
  (NeuroMab, UC Davis, 1:100). Secondaries: anti-rabbit AlexaFluor488, anti-mouse Dy-Light 647,
  both 1:500. **So in this paper Nav is the 488 (rendered green) and Caspr the 647 (rendered
  red)** — the inverse of the owner's convention.
- **Tissue:** 8–10 week old male Sprague-Dawley rats; 50 µm vibratome slices (10 µm cryostat for
  Na<sub>v</sub>1.6 density); 4% PFA. **Not corrected for tissue shrinkage during fixation.**

> **A ~50 nm pixel is roughly 20–40 px across a 1–2 µm node.** That is the sampling density this
> method was validated at. If the owner's images are coarser, the profile has correspondingly fewer
> samples across the gap and the threshold-crossing interpolation becomes the dominant error term.
> Measuring that is one of the first diagnostics worth running once real data arrives.

## 4. Sanity-check values — what our numbers should look like

Reusable targets. Any pipeline output far outside these on comparable tissue is suspect.

| Quantity | Optic nerve | Cortex (layer V, motor) |
|---|---|---|
| Mean node length | **1.02 ± 0.02 µm** (s.e.m.) | **1.50 ± 0.05 µm** (s.e.m.) |
| Standard deviation | 0.29 µm | 0.58 µm |
| n (nodes) | 164 | 158 |
| Range | 4.4-fold | **8.7-fold — 0.43 to 3.72 µm** |
| Mean node diameter | — | 0.64 ± 0.01 µm (s.d. 0.14, n = 158) |

- **EM node length** (optic nerve, independent modality): mean not significantly different from the
  confocal 1.02 µm, p = 0.06.
- **Node length does not depend on node diameter** (p = 0.14 optic nerve, p = 0.42 cortex) nor on
  **axon diameter at the paranode** (p = 0.89, p = 0.98). EM regression slope also not different
  from zero (p = 0.46). *Useful as a null: if our measured lengths correlate with blob size, we are
  probably measuring a blob-detection artefact rather than a node.*
- **Summed Na<sub>v</sub>1.6 intensity over a node is linearly correlated with node length**
  (p = 1.2 × 10⁻¹⁵) — sodium channel number is approximately proportional to node length, but with
  large scatter at any given intensity. *This is a genuinely useful independent check on a detection:
  a detected "node" whose Nav signal is wildly off the length–intensity line is a candidate false
  positive. It is a validation signal, not a detection rule.*
- **Node lengths are correlated along an axon** — variability between axons ≫ variability along one
  axon.

> **The 0.43–3.72 µm observed range is much wider than the overview's 1–2 µm ± 0.5 (i.e.
> 0.5–2.5 µm) plausibility window.** In cortex, a hard 0.5–2.5 µm acceptance filter would discard
> real nodes at both tails. This is the concrete evidence behind the warning in
> [`../project-brief.md`](../project-brief.md) §3 about rule 4.

## 5. Where our approach must diverge from this reference

- **They measured; we must first detect.** Every node here was **hand-selected** by an expert
  before any profile was drawn. The paper supplies no candidate-detection step at all — no blob
  detection, no collinearity test, no triplet assembly. **§5.1 of the project (the MVP) has no
  reference implementation in this paper.** That is the genuinely new work.
- **They discarded most nodes.** The parallel-to-section criterion is a selection for
  measurability, applied without any obligation to count what it rejected. Our §5.1 must count
  *all* nodes including the ones §5.2 will later refuse to measure — so the two stages have
  different, and differently-tuned, error costs.
- **Their region is optic nerve and cortex; our example is corpus callosum.** No node length for
  corpus callosum is given here, so neither table column above is a legitimate target for our
  example image. Corpus callosum is white matter and plausibly nearer the optic nerve figure, but
  that is an expectation, not a citation.
- **They used a MATLAB script that is not published.** The paper commits to releasing the
  *simulation* code on GitHub ("by August 1st 2017"); the **node-length measurement script is not
  offered** — it is described in prose only. There is nothing to port.

## 6. Gaps — what this paper does not state

- The **peak-detection** step: how the two Caspr peaks were located in the profile, whether any
  smoothing was applied, and what happened when a profile had more or fewer than two peaks.
- The **background subtraction** method and its parameters (rolling-ball radius, or otherwise).
- The exact **line thickness** — only "slightly less than the Caspr labelling thickness".
- Whether the line was drawn by hand per node or fitted, and whether its **orientation** was
  optimised.
- **Inter-observer variability** on the manual selection, or any repeat-measurement error.
- Any **detection** performance figure — there is no notion of a false positive or a missed node in
  this paper, because a human found every node.
- Whether node length was corrected for the **point spread function**; given a 63×/1.4 lens the
  lateral PSF is ~200 nm FWHM against a ~1 µm measurement, which is not negligible, and the paper
  does not discuss it.

## 7. Deliberately omitted from these notes

Cross-checked against the full 15-page text. Not summarised because it is not algorithmically
relevant: the conduction-velocity modelling (Richardson et al. 2000 model C in MATLAB, parameter
Table 1, 51 simulated nodes, speed measured between nodes 20 and 30), the energy/membrane-area
argument behind the 270-fold claim, the tracer-injection protocol (tetramethylrhodamine dextran
iontophoresis) except as it establishes the along-axon correlation result, the EM sample
preparation chemistry, funding, and acknowledgements. The eLife digest adds nothing beyond the
abstract.
