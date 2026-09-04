# Prior art — what already exists for automated node detection

What baseline the MVP has to beat, and what the field has already learned about the parts that
break.

---

## Headline finding

**No published tool does the task in the project's §5.1** — detecting Caspr–Na<sub>v</sub>1.6–Caspr
triplets by their spatial arrangement in two-channel CNS immunofluorescence and counting them.

But that statement is now much narrower than it was, and two related things **have** been done:

- **Automated node counting exists and has a published accuracy** — Appeltshauser, Linke & Heil et
  al. 2022, in PNS teased fibres, single-channel: **97 ± 11% on healthy murine nerve**, degrading
  to a median ~85% with a 15–185% spread on pathological human samples.
- **Automated node segmentation by deep learning exists** — Linke et al. 2025, same group, same
  images: **Dice 87.79%, 100% of objects detected**, trained on 10–25 annotated objects.

> **Correction.** The first pass of this review said the search "turned up node-of-Ranvier
> detection tools essentially not at all", at "medium-high confidence", pending the papers we
> could not fetch. Having read them: **that was too strong.** The right statement is that node
> detection has been automated in an easier regime, by one group, and that the *hard* parts of our
> problem — dense tissue, a two-channel geometric rule, and length measurement — are where their
> results stop.

## What the field does today

**Manual or semi-manual ImageJ/FIJI is still the published standard, including in the papers that
automated part of it.** A human identifies nodes as Na<sub>v</sub>1.6 clusters flanked by Caspr
paranodes; ImageJ measures. Both 2022 papers fell back to blinded manual assessment for their
actual analyses.

**This is the baseline to beat, and its true precision is now measurable.** Two blinded
investigators scoring the same concussion images reached an **ICC of 0.73** (Song et al.). That is
the human agreement level on this exact task — dense white-matter fields, Caspr + Nav1.6 — and it
is the number our pipeline should be judged against, rather than against an assumption that a
manual count is exact.

## The two results that matter most, and what they warn about

### 1. Automated counting degrades on the tissue the study is about

Appeltshauser et al. segmented pan-neurofascin in Imaris and counted the objects. Healthy murine:
97 ± 11%, r = 0.77 against manual. Pathological human: median ~85%, spread 15–185%, variance
significantly increased (F = 0.037, p < 0.0001). They abandoned the automated count for the real
analysis.

Two lessons:

- **Report precision and recall, not a count ratio.** Their "accuracy" exceeds 100% for many
  samples, so it is `automated / manual × 100` — a ratio of totals that cannot distinguish a
  perfect count from one with matched false positives and false negatives.
- **Validate on pathological fields or say plainly that we did not.** A control-only accuracy is an
  upper bound with no bearing on the injury condition.

Also worth being honest about: their pipeline set the **intensity threshold by hand per image**
(500–1400) and **manually discarded** false detections. Our project's value depends on not needing
that, so 97% is not a like-for-like bar.

### 2. Automated *length* measurement was tried and rejected

> *"Accuracy of automated assessment of nodo-paranodal length using Imaris did not reach as exact
> results as manual measurement. Therefore, blinded manual assessment was performed on all
> samples."*

The one group that automated node counting on this kind of data **could not automate node
morphometry** to a standard they trusted — on sparse teased fibres, at 0.075 µm pixels, in 3D.

**§5.3 is the harder half of this project, not the easier one.** That is not a reason to abandon
it: they fitted 3D surfaces in Imaris rather than using the plot-profile method, which is a
different and independently EM-validated technique
([`arancibia-carcamo-2017.md`](arancibia-carcamo-2017.md) §2). It *is* a reason to expect length to
be the part that fights back, and to score it against manual measurement before trusting a number.

## The transfer gap

Both automated results are on **PNS teased fibre preparations** — individual axons pulled apart on
a slide, sparse against near-empty background (node vs background = **1.3% vs 98.7%** by pixel
count). The owner's corpus callosum field is dense, overlapping and crossing.

| | Appeltshauser / Linke | This project |
|---|---|---|
| Preparation | Teased fibres, physically separated | Tissue section, densely packed |
| System | PNS (sural / sciatic) | CNS (corpus callosum) |
| Marker | Pan-neurofascin — labels the node **directly** | Caspr + Nav1.6 — node inferred from **geometry** |
| Detection | Threshold or U-Net on one channel | Two-channel spatial-arrangement rule |
| Confusables | Schmidt-Lanterman incisures | Neighbouring nodes, crossing axons |
| Threshold | Hand-set per image | Must be automatic |

A single-channel threshold works for them because a pan-neurofascin blob on an isolated fibre
essentially *is* a node. We have no such marker — which is the entire reason the project's rules
are geometric.

## Adjacent work

| Work | What it does | Why it isn't our problem |
|---|---|---|
| **Linke et al. 2025**, dSTORM toolkit ([notes](linke-2025-dstorm-toolkit.md)) | U-Net segmentation of nodes, Dice 87.79%, 100% object recall, 10–25 training objects | Teased PNS fibres, single channel, 1.3% foreground. No false-positive rate reported. |
| **Appeltshauser et al. 2022** ([notes](appeltshauser-2022-polyneuropathy.md)) | Imaris threshold segmentation + volume filter; counting accuracy above | PNS teased fibres; hand-set per-image threshold; morphometry abandoned |
| **Automated tracing of myelinated axons and node detection in serial images of peripheral nerves** | Traces axons, finds nodes as gaps via connected components on a 3-class prediction map | Serial EM-style volumes of peripheral nerve, not immunofluorescence. Still the most transferable *concept* — see below. |
| **Generic Fiji tools** — deepImageJ, ImageSURF, Lusca, SNT, AxonTracer | Pixel classification, morphology, neurite tracing | None encodes a multi-channel spatial-arrangement rule; §5.1 remains to be written. SNT's tracing could matter if per-axon grouping is ever wanted. |

## The ideas worth stealing

**Treat the node as a gap in a traced structure, not an isolated object.** From the peripheral-nerve
tracing work. Our analogue: the Caspr channel implicitly traces the axon — paranodes are elongated
*along* it, so each blob's long axis is a free orientation estimate. Pair Caspr blobs that agree on
orientation and are collinear with the vector between them, then require a Nav blob in the gap.
This follows the project's rule 3 directly.

**A learned per-channel blob segmenter is cheaper than it looked.** Linke et al. got a working
segmentation from **10–25 annotated objects** using augmentation. The first pass of this review
dismissed the learned route partly because it "needs annotated training data we do not have" —
a 10–25 object budget is a reasonable thing to ask the owner for. The shape that would fit here is
a learned Caspr/Nav segmenter feeding an **explicit, inspectable** geometric rule, not an
end-to-end node detector.

**Reuse their quality filter for measurable nodes.** Appeltshauser et al.'s criteria for an "intact
looking" node: (1) two Caspr blocks, (2) homogeneous staining, (3) rectangular form.

Both remain **candidates to prototype and score against the naive baseline**, not design decisions.

## Baseline the MVP must beat

Before anything sophisticated is adopted:

1. Threshold + connected components on each channel independently.
2. For every Nav blob, look for two Caspr blobs within a radius on roughly opposite sides.
3. Count.

Record its precision and recall against owner-annotated ground truth, on both healthy and — if
available — pathological fields. Nothing more elaborate gets committed until it beats this.

## What we still do not know

- Whether an **unpublished lab macro** exists — worth asking the owner directly; it would not
  surface in any search.
- Whether **3D** information is available to us. If inputs are z-stacks, the reference method's
  "all three regions within one 0.8 µm optical slice" criterion becomes available and is a far
  better horizontality test than any in-plane angle
  ([`../project-brief.md`](../project-brief.md) §5).
- Whether anyone has published node detection in **dense CNS tissue** specifically. The searches
  found nothing, and the four papers read confirm the gap rather than closing it — but a targeted
  search of the CNS myelin-pathology literature, rather than the tooling literature, has not been
  done.
