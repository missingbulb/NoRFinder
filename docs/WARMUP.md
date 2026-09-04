# Session warm-up — read this first

The map for a fresh session. If you read only one file, read this one, then
[`project-brief.md`](project-brief.md).

## What this project is

Automated detection, counting and length measurement of **Nodes of Ranvier** in two-channel
immunofluorescence microscopy images of CNS tissue. A node is identified by a **spatial
arrangement**, not by colour: two Caspr-labelled paranodes with a Na<sub>v</sub>1.6-labelled node
between them, all three collinear along one axon.

Three requirements, in order of dependency:

1. **MVP** — detect and count all nodes; output count, per-node coordinates, and a visualization
   for manual control.
2. **Horizontal-node selection** — pick the nodes oriented so length can be measured reliably.
3. **Node length** — plot-profile method on the Caspr channel, with a tunable threshold.

Full specification, including the parts the overview leaves unstated:
[`project-brief.md`](project-brief.md).

## Where things stand — 2026-09-04

**Literature review done, six sources read in full. Nothing else exists yet.**

- ✅ Project overview ingested durably ([`project-brief.md`](project-brief.md) +
  [`figures/`](figures/)) — the PDF upload path does not persist, these files are the record.
- ✅ Literature review ([`literature/`](literature/README.md)), issues
  [#5](https://github.com/missingbulb/NoRFinder/issues/5) and
  [#8](https://github.com/missingbulb/NoRFinder/issues/8). Nothing is unreachable.
- ❌ **No sample data.** The images in `figures/` are document illustrations — re-rendered
  screenshots at unknown scale. **No number may be measured off them.**
- ❌ **No ground truth.** No annotated image, and no stated annotation convention.
- ❌ **No code, no pipeline, no scoring harness.**

There is no metric to report yet, because there is nothing to score.

## What blocks starting

In priority order. The first two block the MVP; the third blocks §5.3 entirely.

1. **Real sample images** — the multi-channel microscope files, in their native format.
2. **Ground-truth annotations** on at least a few of them, plus the convention used to make them
   (what mark means "node"). Per the research playbook, ground truth is **annotated, never
   invented** — we do not get to label these ourselves.
3. **Native multi-channel files, not exports.** Blocks the µm output of §5.3, the z-stack that the
   reference horizontality criterion needs, and unambiguous channel identity. Not a blocker on
   detection at all — see [`requirements.md`](requirements.md) R1/R3.

## Settled — do not re-open these

- **The pipeline is scale-free and unit-free; physical units enter once, at output.**
  [`requirements.md`](requirements.md) R1 and R3.
- **Detection must be invariant to rescaling, rotation and reflection**, in three tiers — exact for
  the resampling-free transforms, within tolerance for the rest, and with the working scale range
  *measured* rather than promised. R2.
- **The node-length definition is not chosen up front.** All the definitions are computed and
  reported side by side; the owner's own hand measurements pick the winner later. R4. The owner
  should not be asked to choose a definition again — only to demonstrate how they measure a node.
- **The corpus includes pathological tissue, not only controls.** R5.

## Open questions for the owner

- **Should void nodes (Caspr pair, no Nav) and heminodes be counted and reported separately?** They
  are excluded by the current rules, they are biologically real, and their frequency changes with
  injury — so excluding them silently biases group comparisons. More pressing now that pathological
  tissue is confirmed ([`literature/node-biology.md`](literature/node-biology.md) §4).
- **What is the cost asymmetry between a false positive and a missed node?** Unstated, and it is
  the trade-off the MVP is tuned against.
- **Is there an existing lab macro or script for this?** The literature has none; an unpublished one
  would not surface in a search.

## How to work here

Claudinite's **research-project** pack governs, and its rules load into every session here, so
there is nothing to go and read. The parts that bite hardest on this project:

- **Show, don't tell.** Every algorithmic change is presented as a rendered comparison — original |
  result, and against ground truth where scoring applies — inline in the conversation. The picture
  leads; metrics confirm.
- **Prototype in the scratchpad first.** Tracked code is touched only after the visual result is
  right.
- **Don't overfit.** No single-image special-casing. And specifically here: **no rule may bake in an
  assumed node length**, because node length is what the project measures — which is also why the
  spec's 1–2 µm plausibility window becomes a ratio rather than a constant
  ([`requirements.md`](requirements.md) R1).
- **No absolute pixel or µm constants anywhere in a decision rule**, and every change is checked
  against the transform-invariance harness before it is scored for accuracy (R2).
- **Record each accepted change** as a numbered iteration note (`R1`, `R2`, …) — what was wrong,
  what changed, the metric delta, and *what was tried and rejected*.

Standing preferences learned so far are folded into this doc; if the owner corrects *how* work is
done, it belongs here (or in the doc that owns the topic), not just in the reply.

## Environment

Fresh containers start with nothing installed. Keep the dependency set small.

```
pip install pymupdf pillow numpy      # what this session needed
```

- **No `pdftoppm` / poppler.** Render PDFs with PyMuPDF in-process, not a system binary — the
  built-in PDF reader fails on this box for exactly that reason, on every PDF.
- **Do not trust the harness's reported PDF page count.** It has been wrong on every PDF attached
  to this project so far, sometimes by a lot (a 4-page overview reported as 26; a 29-page preprint
  as 201). Open the file with PyMuPDF and read `page_count`; extract all pages in one pass rather
  than working through the ranges the harness suggests.
- Outbound HTTPS goes through a proxy. Publisher `403`s are a policy boundary: don't retry, don't
  try sibling URLs, don't route around it. Record the source as unreachable and ask the owner —
  which is what [#6](https://github.com/missingbulb/NoRFinder/issues/6) did, successfully.
- **A web-search summary is not a source.** Two author attributions and one metric definition taken
  from search snippets in the first literature pass were all wrong, and only the PDFs caught it.
  Never write a name, number or definition into the notes from a snippet.
- Scratchpad, not `/tmp`, for throwaway renders and diagnostics. Only the final artifact and the
  code that regenerates it get committed.

## Repo map

```
docs/
  WARMUP.md                          this file
  requirements.md                    standing constraints on HOW it is built — read with the brief
  project-brief.md                   the specification, ingested from the owner's PDF
  project-overview-extracted-text.txt  verbatim PDF text, for wording questions
  figures/                           overview figures — ILLUSTRATIONS, not analysis inputs
  literature/                        the review; start at its README
```

Nothing else is real yet. When a pipeline exists, this map must say which folder is *the pipeline*
and which are spikes.
