---
name: paper-intake
description: Take a research paper PDF into studies/vascular/docs/literature/. Use whenever a new article is added to this repo, or an existing one needs re-processing.
metadata:
  body: guidelines
---

# Paper intake

The owner adds articles so the project can keep working **without reopening them**. An intake is
finished when someone could delete the PDF and lose nothing they need: the biology, the method,
the parameters, the numbers, and every figure are all in the repo, described.

Layout, slug format and the working-dataset contract: [`studies/vascular/docs/literature/README.md`](../../../../../../studies/vascular/docs/literature/README.md).
Cross-paper decisions: [`studies/vascular/docs/literature/METHODS-SYNTHESIS.md`](../../../../../../studies/vascular/docs/literature/METHODS-SYNTHESIS.md).

## The steps

### 1. Place the paper

Slug is `<first-author>-<year>-<short-topic>`. Create `studies/vascular/docs/literature/<slug>/` and `git mv` the PDF in
as `<slug>.pdf` — the original file keeps its content but not its unwieldy download name.

### 2. Extract text and images

```
python3 studies/vascular/docs/literature/_tools/extract_pdf_assets.py studies/vascular/docs/literature/<slug>/<slug>.pdf /tmp/<slug>
```

Writes `fulltext.txt`, `raw/` and `manifest.tsv`. **Work from the scratchpad**, not the repo —
only named, described figures get committed.

### 3. Chase the supplementary material — it is often where the method actually lives (1)

**Ask for it if it is not to hand.** Commit supplementary code, scripts, LUTs and data images under
`studies/vascular/docs/literature/<slug>/supplementary/`. Transcribe supplementary *tables* into the digest.

### 4. Read the whole paper

Read `fulltext.txt` end to end. Then **look at every extracted image** — do not skip this (2).
Anything that is only in an image and matters must be **transcribed into the digest**.

### 5. Name and commit the figures

`git mv` each real figure to `studies/vascular/docs/literature/<slug>/figures/figN_<short-name>.png` (convert to PNG).
Drop logos, glyphs and icons. Write `figures/README.md`: every figure **shown inline**
as a Markdown image of its `figN_….png` file, with a description of each sub-panel, what the
scale bars say, and **what you actually see in it** — including anything that will trip the
pipeline up (surface vessels, drawn annotation lines, cross-sections rather than networks).

### 6. Crop the panels

Locate the grid programmatically where possible (photomicrograph panels are dark, the page is
white — find the dark bands), then **freeze the coordinates** into
`studies/vascular/docs/literature/<slug>/figures/crop_panels.py` so the crop is reproducible. Prefix the isolated
vessel-channel panels `VESSEL_` and nothing else. Tag every panel name with the paper
(`rust20fig1_…`) so calibration prefixes stay unique. Write `figures/panels/README.md`: the
inventory, the µm/px per row, and the caveats that come with folding these into the dataset.

### 7. Calibrate — measure, never assume

**Measure the drawn scale bar in pixels off the panel itself** and add the prefix to
`SCALEBAR_PX` in `studies/vascular/analysis/measure_vessels.py` (plus `SCALEBAR_UM` if the bar is not 50 µm).

If the source image **states its own µm/px** (an ImageJ TIFF carries `unit=` and `XResolution`),
use that instead and record it in `UMPP_DIRECT` with its provenance — acquisition metadata is
better evidence than a bar measured off a printed page. **Cross-check it against biology** before
trusting it: capillaries should come out at roughly 4–8 µm across.

If a figure draws **no** bar, put the prefix in `UNCALIBRATED` **with the reason**. That panel
then reports area % and pixels only.

Cross-check when the figure lets you: a close-up's ROI box in its overview gives an independent
magnification estimate. **Record the agreement, and record it when it is poor** — that is a real
uncertainty in every length the panel produces.

### 8. Write the digest

`studies/vascular/docs/literature/<slug>/digest.md`. It must stand alone. Always include:

- **Citation block** — title, authors, venue, DOI, licence, link to the PDF, one-line thesis.
- **§ Why this matters to *our* task** — first, and concrete. What does this paper change about
  what we build? What does it explicitly *not* cover?
- **The method, in full.** Every parameter the paper states. Every parameter it *fails* to state,
  listed as a gap, so nobody re-hunts.
- **The reported numbers**, in tables, with the stats.
- **Calibration facts** for the extracted panels, with the caveats from step 7.
- **Discussion arguments worth keeping**, and the authors' own stated limitations.
- **§ What is not in this PDF** — supplementary material, scripts, anything you tried to fetch and
  could not (record the URL and what happened).
- **§ Extracted images** — the figure table, linked.

### 9. Fold into the synthesis

Update [`studies/vascular/docs/literature/METHODS-SYNTHESIS.md`](../../../../../../studies/vascular/docs/literature/METHODS-SYNTHESIS.md): add
the paper to the folded-in list, extend the metric and processing tables, add reference
magnitudes, and — most valuable — **compare the published numbers to ours and say what the gap
means**. A published branch density 5× below ours is a sharper statement of our fragmentation
problem than any overlay.

Add the paper's row to [`studies/vascular/docs/literature/README.md`](../../../../../../studies/vascular/docs/literature/README.md).

### 10. Verify

```
python3 studies/vascular/analysis/measure_vessels.py                                   # new panels appear, µm sane
.claudinite/bin/cn check --pack local/vascular-study              # checks still pass
```

## The rules that bite here

- **Never invent a number.** Not a scale bar, not a field size, not a metric. Measure it, cite it,
  or declare it unknown. This is the project's first rule and intake is where it is most tempting
  to break.
- **A digest may quote what the *authors* measured**; it must not present our run over their
  images as validation.
- **Say what is weak.** A calibration you half-trust, a panel type the metrics do not suit, a
  direction-of-change that contradicts another paper — all of it goes in the digest. The digests
  are read later by someone deciding what to believe.
- **Prefer a same-image comparison to a table comparison.** If the paper ships code *and* an
  image, reimplement the method and run both on that image. A number from a summary table may not
  be the raw output of the method it describes.
