---
name: vessel-overlay-review
description: Show extraction results as an annotated overlay with explicit visual assertions. Use whenever proposing, revising, or reporting on the segmentation/measurement pipeline in this repo — before quoting numbers.
metadata:
  body: guidelines
---

# Reviewing a vessel extraction on the overlay

The owner reacts to **pictures with claims attached**, not to metric tables. Any change to
`studies/vascular/analysis/measure_vessels.py` (segmentation, pruning, branch graph, caliber threshold) is presented
this way before its numbers are quoted.

## 1. Regenerate

```
python3 studies/vascular/analysis/measure_vessels.py                  # per-image + region metrics table
python3 studies/vascular/analysis/annotate_overlays.py [name-substr]  # presentation overlays -> studies/vascular/analysis/annotated/
```

Both output directories hold renders, not data: regenerate them, never commit their PNGs; the
study's `.gitignore` keeps them out of git. Setup:
`pip install -r requirements.txt`.

## 2. Keep the agreed overlay style

`studies/vascular/analysis/annotate_overlays.py` is the source of truth for it, and it is the style the owner
iterated to — change it only on request:

- overlay on the **original at full brightness**; the debug 3-panel view in `measure_vessels.py`
  (`--overlays`) may dim, the presentation overlay may not;
- a highlight is a **slim outline that circles the thing — never a colour fill**; contours drawn at
  display resolution, 1 px, alpha-blended so the signal reads through;
- colours contrast with the red channel — cyan capillary, green artery, magenta junction, yellow
  labels. **No red overlay marks**;
- arrows label representative vessels with their length in µm, one artery with its diameter; a drawn
  50 µm bar and a totals banner (segments cap/artery, length + density, junctions, area %).

## 3. State the assertions

Alongside the overlay, write the claims a reader can check against it, in both directions:

- **what the method caught** — "each cyan outline is one segment I counted";
- **what it missed or broke** — "the red vessel at lower-left carries no outline: under-detection in
  this dim field"; "this vessel is split into three segments by a stain dropout, so COUNT is
  inflated here".

Compare against the visual expectations in
`studies/vascular/docs/literature/wang-2022-cd31-vascular-network/figures/panels/expected-results.md`.

## 4. Then the numbers

Use **length density / area %** for anything cross-figure (the
figures are at different zoom). Record the accepted change and its metric delta in
`studies/vascular/docs/results-first-pass.md`, and refresh `studies/vascular/docs/STATUS.md`'s "trustworthy vs not" and next
step so the next session resumes from it.
