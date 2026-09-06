# Linke et al. 2025 — Deep learning-driven automated high-content dSTORM imaging with a scalable open-source toolkit

*Biophysical Reports 5:100201 ·
[ScienceDirect S2667074725000060](https://www.sciencedirect.com/science/article/pii/S2667074725000060) ·
University of Würzburg · read from the supplied PDF (11 pages).*

Same group as [`appeltshauser-2022-polyneuropathy.md`](appeltshauser-2022-polyneuropathy.md), and
it reuses that study's node images as one of its demo datasets.

**What it actually is:** a general-purpose open-source toolkit that automates dSTORM acquisition —
scan a large area, segment it with a trained network, drive the microscope to the interesting
positions. **Nodes of Ranvier are one of four demonstration datasets**, not the subject. The paper
is about the tooling, not about nodes.

---

## 1. The node result, in context

Four demo datasets, evaluated by Dice score (DS) and pixel accuracy (PA):

| Dataset | Dice score |
|---|---|
| CHO cells stained for actin | 94.96% (95.58% in the figure legend — the paper is internally inconsistent by 0.6 pp) |
| **Nodes of Ranvier, murine teased nerve fibres, pan-neurofascin** | **87.79%** |
| Nuclei, H&E human cancer tissue | 75.83% |
| DAPI nuclei | (PA 99.17%) |

For the node dataset: **pixel accuracy 99.60%**, and the class balance is **node 1.3% vs
background 98.7%** — which is why PA is near-meaningless here and DS is the number to read.

**Detection, as distinct from segmentation:** *"In both DAPI-stained nuclei and Ranvier nodes,
**100% of all objects were detected**, with 93.67 and 86.67% of individual objects having a DS of
at least 75%."*

So: **100% recall on node detection, 86.67% of detected nodes segmented well.** On teased fibres
with a 1.3% foreground.

## 2. The finding that genuinely changes our options

> *"Due to the use of image augmentation in the training scripts, a relatively small amount of
> training data was sufficient. In most cases, **labeling just 10–25 objects was adequate**"* —
> and one network was trained from **a single annotated nucleus**.

The first pass of this review dismissed the learned route partly because *"it needs annotated
training data we do not have."* **That objection is weaker than stated.** A 10–25 object annotation
budget is an entirely reasonable thing to ask the owner for, and is far below what "needs training
data" usually implies.

Two things keep this from being a recommendation:

1. **Their task is much easier than ours.** Segmenting a bright, isolated, single-channel object
   against a 98.7% empty background is not the same problem as finding Caspr–Nav–Caspr triplets in
   a dense field. A segmentation network trained on 10–25 objects will not learn a two-channel
   geometric relation from that budget, and 100% recall on their regime says nothing about ours.
2. **It remains a gated route, not a baseline.** The environment favours a small dependency set,
   and the naive baseline in [`prior-art-detection.md`](prior-art-detection.md) has not been
   measured yet. Prove the lightweight route is exhausted first.

Where it could genuinely earn its place is as a **per-channel blob segmenter** feeding the
geometric rule — replacing a threshold with a learned Caspr/Nav segmentation, while the triplet
logic stays explicit and inspectable. That keeps the annotation budget small and the decision rule
auditable. **A candidate to prototype and score against the threshold baseline, nothing more.**

## 3. Details worth keeping

- Architecture is a U-Net-family semantic segmentation network; the paper cites **nnU-Net**
  (Isensee et al. 2021) and **U-Net** (Falk et al. 2019).
- The node training images come from the polyneuropathy study, so the imaging is that paper's
  20× Airyscan high-content confocal on teased fibres.
- Toolkit is **freely available and open source**, aimed at non-experts.
- Metrics are defined as standard: DS over the positive class, PA over all pixels.

## 4. Gaps

- **No per-image or per-object variance** on the node DS — a single number, no confidence interval,
  no held-out test-set description separate from the training images.
- **No false-positive rate.** "100% of objects detected" is recall; nothing is said about spurious
  detections, which is the failure mode that matters in a dense field.
- The exact node training-set size is never given — only the general "10–25 objects" claim across
  datasets.
- No comparison against a classical threshold baseline on the same node data, so the paper never
  establishes that the network was necessary.
- Training hyperparameters, augmentation specifics, and the Zenodo/repository URL are not in the
  main text.

## 5. Deliberately omitted

Cross-checked against the full paper. Not summarised: the dSTORM acquisition automation itself
(microscope control, position translation, high-content workflow timing), the SpheroRulers
calibration sample, the microtubule and β2-spectrin super-resolution demonstrations, and the
software-engineering and usability discussion. None of it bears on our detection problem.
