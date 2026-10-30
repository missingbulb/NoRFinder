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

## Where things stand

[`../detection/STATE.md`](../detection/STATE.md) holds the current state — the default finder, its
scores, what to run — and is updated in every PR that changes it, so this file does not repeat it.

Run the tests: `pip install -r requirements.txt && python3 studies/nor/detection/ground_truth.py fetch && python3 -m pytest web-tests studies` from the repo root (the page tests also need `npm i --prefix web-tests pyodide@314.0.7` and Playwright's Chromium). CI runs the fast set (`-m "not full"`, no Node or browser) on every PR (`.github/workflows/tests.yml`) and every test nightly and on each push to main (`.github/workflows/tests-full.yml`), where a green run wakes the site release.
Fetch the raw data: `python3 studies/nor/detection/fetch_data.py`

## What blocks starting

In priority order. The first two block the MVP; the third blocks §5.3 entirely.

1. ~~**Real sample images**~~ — arrived 2026-09-25: 55 single-plane, 3-channel TIFFs with pixel size
   in their metadata ([`../data/README.md`](../data/README.md)). Still no z-stack.
2. **Ground-truth annotations** on at least a few of them, plus the convention used to make them
   (what mark means "node"). Per the research playbook, ground truth is **annotated, never
   invented** — we do not get to label these ourselves.
3. **Native multi-channel files, not exports.** Blocks the µm output of §5.3, the z-stack that the
   reference horizontality criterion needs, and unambiguous channel identity. Not a blocker on
   detection at all — see [`requirements.md`](requirements.md) R1/R3.
   The 2026-09-25 files carry µm per pixel, so the µm output is unblocked; the z-stack and a
   recorded channel identity are still missing (the raw `.sld` has both).

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

Keep the dependency set small.

The project's own stack — numpy, scipy, pillow, matplotlib — is declared as an `env` requirement
on the local pack, so the environment image installs it from `requirements.txt` and a session
should find it already present. If SessionStart halt-gates saying it is missing, the setup script
needs re-pasting into the environment's Setup script field; nothing project-specific goes in that
body.

`pymupdf` is **not** in `requirements.txt` and is installed ad hoc: it is for reading source PDFs,
which is intake work, not part of the pipeline.

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

## The study's map

This study is one of the page's studies; the repo's own map, and what the shell around it does, is
[`../../../docs/WARMUP.md`](../../../docs/WARMUP.md). Paths below are under `studies/nor/`.

```
web/         the study's page: panels, script, style, finder_metrics.json
detection/   the finders, nor.py (the R1 baseline), harness.py (invariance), fetch_data.py; STATE.md
data/        sources.json: the Drive images by checksum (the images stay out of git)
tests/       every requirement that can be executed; test_quality.py locks the finders (R9)
docs/
  WARMUP.md                          this file
  requirements.md                    standing constraints on HOW it is built, which no user sees;
                                     what the page does is ../../../dev/requirements/requirements.md
  results/                           iteration notes; R1 is the first
  project-brief.md                   the specification, ingested from the owner's PDF
  project-overview-extracted-text.txt  verbatim PDF text, for wording questions
  figures/                           overview figures — ILLUSTRATIONS, not analysis inputs
  literature/                        the review; start at its README
```

`detection/` is **the pipeline**: the finders the page runs, the R1 baseline they grew from, and
the lab tooling around them; [`../detection/STATE.md`](../detection/STATE.md) says which file does what.
