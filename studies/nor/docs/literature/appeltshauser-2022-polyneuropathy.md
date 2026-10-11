# Appeltshauser, Linke & Heil et al. 2022 — Super-resolution imaging pinpoints ultrastructural changes at the node of Ranvier in patients with polyneuropathy

*medRxiv preprint 2022.08.05.22278366 · [DOI](https://doi.org/10.1101/2022.08.05.22278366) ·
CC-BY 4.0 · University of Würzburg · read from the supplied PDF (29 pages + supplement).*

> **Attribution correction.** The first pass cited this as "Stengel et al.", from a web-search
> summary. The co-first authors are **Appeltshauser, Linke and Heil**; issue
> [#6](https://github.com/missingbulb/NoRFinder/issues/6) carries the wrong name.

**This is the most important of the four supplied papers, and it was the one I predicted would
matter least.** It is the only source in the whole review that **automates node counting and
reports an accuracy for it** — and the only one that tried automating node *morphometry* and
**abandoned it**. Both results bear directly on §5.1 and §5.3.

The caveat that governs everything below: this is **PNS teased nerve fibre** — individual axons
physically separated on a slide, sparse against a near-empty background. See §5.

---

## 1. Claim

The ~190 nm periodic arrangement of axonal cytoskeletal proteins is conserved in humans but
impaired at the paranode in polyneuropathy; paranodal Caspr-1 and neurofascin-155 are severely
elongated and partly detached from their β2-spectrin anchor. Alongside the dSTORM work, a
high-content confocal pipeline assessed node counts and nodo-paranodal morphometrics across
patient cohorts.

The super-resolution / periodicity half is not relevant to us. **The confocal high-content half
is.**

## 2. Automated node counting — the published accuracy, and what it is really measuring

The pipeline, in full:

- **Zeiss LSM 980 Airyscan 2**, three-colour, **20× magnification**, 3D stacks and tiles, stitched
  in Zen blue 3.3. **Pixel size 0.075 µm** (stated indirectly: smoothing was set to "2 times
  pixelsize (0.15 µm)").
- Nodes counted by segmenting **anti-pan-neurofascin** staining in **Imaris**: image smoothing
  0.15 µm, **intensity threshold set manually to values (500–1400) individually for every image**,
  then a volume (voxel) filter, then **falsely detected Schmidt-Lanterman incisures discarded**.
- Ground truth: node count per sample by **two independent blinded investigators** in FIJI, over
  the whole slide.
- n = 20 high-content images of murine sciatic nerve, n = 20 from human samples.

**Results (Figure 4C):**

| Samples | Counting accuracy |
|---|---|
| Murine (healthy) | **97 ± 11%**, correlation with manual count r = 0.77, p < 0.0001 |
| Human (pathologically altered) | **median ~85%, spread ~15% to ~185%** — variance significantly increased (F = 0.037, p < 0.0001) |

> **Read the metric carefully before borrowing the number.** Accuracy exceeds 100% for many human
> samples — up to ~185% — so it is plainly `automated count / manual count × 100`, a **ratio of
> totals**, not a detection accuracy. It cannot distinguish a perfect count from one with equal
> numbers of false positives and false negatives, and a systematic over-detector scores above 100%
> rather than being penalised. **We should not report our MVP this way.** Precision and recall
> against matched per-node ground truth say what this cannot.

**And "fully automated" is generous.** The threshold was hand-set per image (a 500–1400 range) and
false detections were manually discarded. That is a semi-automated pipeline with a human in the
loop twice. Our project's value depends on *not* needing per-image hand-tuning, so 97% is not a
like-for-like bar.

### The finding that should shape our expectations

**Accuracy collapsed on pathological tissue** — from 97 ± 11% to a median ~85% with a spread from
15% to 185% — *"due to the heterogeneity of pathological alterations"*. The authors' response was
to fall back to the manual FIJI count for the actual analysis.

This is the same warning as [`node-biology.md`](node-biology.md) §4 arriving from a completely
different direction, now with numbers: **an intensity-threshold node detector tuned on healthy
tissue degrades badly and unpredictably in exactly the diseased tissue the study exists to
measure.** Any accuracy we report on healthy control images is an upper bound with no bearing on
the injury condition, and our validation must include pathological fields or say plainly that it
does not.

## 3. Automated morphometry was tried and rejected

> *"Accuracy of automated assessment of nodo-paranodal length using Imaris did not reach as exact
> results as manual measurement. Therefore, blinded manual assessment was performed on all
> samples."*

The supplement is blunter: significant differences between automated and manual analysis were
detected (p = 0.02, p < 0.0001), *"thus arguing against accuracy of automated measurement."*

So the one group that automated node *counting* on this kind of data **could not automate node
length** to a standard they trusted, on sparse teased fibres, at 0.075 µm pixels, in 3D. The
project's §5.3 is harder than §5.1, and this is the evidence.

That is not a reason to abandon §5.3 — their approach was 3D surface fitting in Imaris, **not** the
plot-profile method, which is a different and better-validated technique
([`arancibia-carcamo-2017.md`](arancibia-carcamo-2017.md) §2). But it is a reason to expect the
length measurement to be the part that fights back, and to report it against manual measurement
before trusting it.

## 4. Definitions and reference values

Three morphometrics, all measured on **Caspr-1** staining, by hand in FIJI using linear ROIs:

| Quantity | Definition, verbatim | Human sural nerve (n = 69 intact nodes, 4 patients) |
|---|---|---|
| **Nodo-paranodal length** | *"the maximal extension of both Caspr-1 blocks and the nodal gap in between"* | **10.0 ± 4.9 µm** |
| **Nodal length** | *"the smallest gap between two paranodal Caspr-1 blocks"* | **0.9 ± 0.3 µm** |
| **Paranodal axonal diameter** | *"the maximal diameter of paranodal Caspr-1 staining"* | **2.3 ± 0.9 µm** |

*"No significant differences to murine sural nerve parameters … these values can be considered as
normal values of unaltered nodes of Ranvier in adult humans."*

**"The smallest gap between two paranodal Caspr-1 blocks" is the clearest operational statement of
a gap-family node-length definition in any source we have** — clearer than Song et al., who use the
same family without defining it. It is recorded as definition E in
[`measurement-definitions.md`](measurement-definitions.md).

Note it is a *minimum* over the pair, not a distance along a fitted axis — a subtly different
quantity again, and one that will systematically under-report on a tilted or curved axon.

**Their criteria for an "intact looking" node** are directly reusable as a quality filter: (1) two
Caspr-1 blocks, (2) homogeneous staining, (3) rectangular form.

**A nodal length of 0.9 ± 0.3 µm** in human PNS sits just below the CNS values we have (1.02 µm
optic nerve, ~1.05 µm swine white matter, 1.50 µm cortex) — but it is a **different definition, a
different nervous system and a different species**, so it is context, not a target.

## 5. Why the counting result does not transfer directly

Figure 4A makes the regime obvious: **teased fibre preparations** are individual myelinated fibres
pulled apart and laid on a slide — long, well-separated magenta strands against black, with nodes
as isolated bright spots. Compare the owner's Figure 4, a dense corpus callosum field of hundreds
of overlapping, crossing axons.

Concretely, what differs:

| | Appeltshauser et al. | This project |
|---|---|---|
| Preparation | Teased fibres, physically separated | Tissue section, densely packed |
| Nervous system | PNS (sural / sciatic) | CNS (corpus callosum) |
| Marker | Pan-neurofascin — labels the node **directly** | Caspr + Nav1.6 — node inferred from **geometry** |
| Detection | Threshold + volume filter on one channel | Two-channel spatial-arrangement rule |
| Confusable objects | Schmidt-Lanterman incisures (PNS-specific) | Neighbouring nodes, crossing axons |
| Threshold | Hand-set per image | Must be automatic |

A single-channel intensity threshold works for them because a pan-neurofascin blob on an isolated
fibre essentially *is* a node. Our project has no such marker, which is the entire reason for the
Caspr–Nav–Caspr rule.

## 6. Gaps

- **The FIJI script is on Zenodo** but the paper's data-sharing statement is the only pointer, and
  the DOI is not in the text we have. Worth locating if we ever want their tissue-volume routine.
- The Imaris volume-filter cut-off for nodes is never stated (only the tissue-volume one, >10000
  voxels).
- How the manual counters resolved disagreements, and their inter-rater agreement — not reported,
  in contrast to Song et al.'s ICC.
- The acquisition parameters table (Supplemental Table S9) is not in the supplied text, so the
  frame size and number of tiles are unknown.
- No per-node matched comparison between automated and manual detection — only totals — which is
  why §2's metric is what it is.

## 7. Deliberately omitted

Cross-checked against the full preprint. Not summarised: the dSTORM localisation methodology and
190 nm periodicity analysis, autocorrelation and colocalization statistics, the β2-spectrin
results, the patient cohort's clinical and electrophysiological characterisation, the correlations
between node density and gold-standard cross-sectional histopathology (interesting biology, no
bearing on detection), and the diagnostic-potential discussion.
