# Prior art — what already exists for automated node detection, and what does not

The point of this file is to establish what baseline the MVP has to beat, and to record a **negative
result** honestly so no later session re-runs the same search.

---

## Headline finding

**No published, off-the-shelf tool does the task in the project's §5.1** — detecting
Caspr–Na<sub>v</sub>1.6–Caspr triplets by their spatial arrangement in two-channel CNS
immunofluorescence and counting them.

Searches across the tool literature (ImageJ/Fiji plugin ecosystem, deep-learning bioimage
pipelines, node-of-Ranvier morphometry papers) turned up node-of-Ranvier *measurement* protocols in
abundance and node-of-Ranvier *detection* tools essentially not at all. The closest published work
is in a different tissue (PNS), a different modality (EM / serial sections / dSTORM), or a different
marker (pan-neurofascin, a single-channel target that needs no geometric rule).

**Confidence: medium-high on the CNS two-channel case, lower as a universal claim.** These are
literature searches, not a systematic review, and an unpublished lab macro would never surface. It
is worth asking the owner whether their lab or collaborators already run something.

## What the field actually does today

**Manual or semi-manual ImageJ.** The dominant published workflow, and therefore the real baseline:

- A human scans the merged image and identifies nodes by eye as Na<sub>v</sub>1.6 clusters flanked
  by Caspr-labelled paranodes.
- ImageJ is used to quantify size and density of Na<sub>v</sub>1.6 accumulations, and per-fibre
  analyses measure the axial length of the nodal gap and the immunofluorescence intensity of each
  marker.
- Node length comes from a hand-drawn line profile (see
  [`measurement-definitions.md`](measurement-definitions.md)).

**This is the baseline to beat, and it is a strong one on precision and a weak one on throughput.**
An expert makes very few false positives; what they cannot do is process a full field of hundreds
of candidates reproducibly, or do it twice the same way. The MVP's honest value proposition is
throughput and reproducibility, and it should be evaluated on agreement with the expert rather than
on any absolute notion of truth.

## Adjacent work, and why each one does not transfer

| Work | What it does | Why it isn't our problem |
|---|---|---|
| **Deep-learning segmentation of nodes in teased murine nerve fibres, pan-neurofascin stain** (reported at Dice ≈ 87.8%, within a dSTORM high-content toolkit — [ScienceDirect S2667074725000060](https://www.sciencedirect.com/science/article/pii/S2667074725000060), **not retrieved, publisher 403**) | Semantic segmentation of nodes in a single channel | **Teased PNS fibres**, i.e. physically separated axons on a slide — none of the crossing/density problem of a corpus callosum field. Pan-neurofascin labels the node directly, so no geometric triplet rule is needed. Needs annotated training data we do not have. |
| **Automated tracing of myelinated axons and node detection in serial images of peripheral nerves** | Traces axons, then finds nodes as gaps in myelinated membrane via connected-component analysis on a 3-class prediction map (myelin / axon interior / background) | Serial **EM**-style volumes of peripheral nerve, not immunofluorescence. The "node as a gap in a traced axon" idea is nonetheless the most transferable concept here — see below. |
| **Super-resolution (dSTORM/STED) nodal morphometry in polyneuropathy** ([medRxiv 2022.08.05.22278366](https://www.medrxiv.org/content/10.1101/2022.08.05.22278366v1.full), **not retrieved, 403**) | Ultrastructural nodal changes in patient samples | Super-resolution regime; measurement-focused, and a resolution we will not have. |
| **General Fiji tools** — deepImageJ, ImageSURF, Lusca, SNT, AxonTracer | Pixel classification, morphology, neurite tracing | Generic. None encodes a multi-channel spatial-arrangement rule; any of them would still leave §5.1 to be written. SNT's tracing could matter later if per-axon grouping is ever wanted. |

## The one idea worth stealing

From the peripheral-nerve tracing work: **treat the node as a gap in a traced structure, not as an
isolated object.** Our analogue is that the Caspr channel implicitly traces the axon — paranodes are
elongated *along* the axon and their long axis is a free per-blob orientation estimate. A detection
route built around "pair Caspr blobs that agree on orientation and are collinear with the vector
between them, then require a Nav blob in the gap" uses the same insight and follows the project's
rule 3 directly.

**This is a candidate to prototype, not a design decision.** It should be built as a scratchpad
prototype and shown against a naive baseline before anything is wired in — and per the research
playbook, a signal-driven method only earns adoption if it measurably out-scores the simple one.

## Baseline the MVP must beat

Before any sophisticated method is adopted, the naive baseline has to be measured:

1. Threshold + connected components on each channel independently.
2. For every Nav blob, look for two Caspr blobs within a radius on roughly opposite sides.
3. Count.

Recording that baseline's precision/recall against owner-annotated ground truth is the first
scoring milestone. Nothing more elaborate should be committed until it beats this.

## What we do not know

- Whether any **unpublished lab macro** exists for this — worth asking the owner directly.
- Whether the **deep-learning route is viable at all here**: it needs annotated training data, and
  the project currently has none. The environment also favours a lightweight dependency set, so a
  learned method is a gated, opt-in route to justify later, not a starting point.
- Whether **3D** information is available. If inputs are z-stacks, the reference method's
  "all three regions within one 0.8 µm optical slice" criterion becomes available and is a far
  better horizontality test than any in-plane angle. This is unanswered in the overview
  ([`../project-brief.md`](../project-brief.md) §5).
