# Working guide — vessel image analysis (rules & conventions)

> **Read this before doing any image work or showing progress on this project.** It captures how the
> project owner wants images handled and how progress is visualized. These are durable rules, not a
> status report — for current state and next steps see [STATUS.md](STATUS.md).

## Project in one line

Detect and quantify the fluorescently-labeled cerebral blood vessels in the **gP-CD31 (red) confocal
panels** from Wang et al. 2022. The professor's three asks: **categorize, count, measure (length)**.
Biology + imaging numbers: [`studies/vascular/docs/literature/wang-2022-cd31-vascular-network/digest.md`](literature/wang-2022-cd31-vascular-network/digest.md).

**Working dataset:** every `references/*/figures/panels/VESSEL_*.png` — the isolated vessel channel,
one folder per source paper. The **16 Wang gP-CD31 (red) rat panels** are the primary set, the one
`expected-results.md` was written against and the one the results tables are built on. Panels from
other papers are additional inputs with their own caveats (species, marker, magnification) — see
each paper's `figures/panels/README.md`, and note that `measure_vessels.py` rolls regions up **per
paper** so the sets are never averaged together. Paper index and the intake protocol:
[`studies/vascular/docs/literature/README.md`](literature/README.md).

## How the owner wants to work on images

1. **Expected results come from real visual inspection — "use your LLM might, not hard-coded."**
   When establishing what a good result looks like, actually *look* at the images and reason about
   them. Never invent/fabricate numbers, and never run the analysis pipeline and present its own
   output as if it were ground truth — that is circular. The visual, LLM-derived expectations live in
   [`studies/vascular/docs/literature/wang-2022-cd31-vascular-network/figures/panels/expected-results.md`](literature/wang-2022-cd31-vascular-network/figures/panels/expected-results.md)
   and are the reference the automated pipeline is judged against.

2. **We converse on visual assertions.** Progress is discussed by *overlaying the extracted data on
   the images* and reacting to what we see. Whenever you propose or revise the extraction, produce a
   visual overlay and make explicit, checkable claims ("this outline = what I call a vessel; that red
   vessel has no outline = the baseline missed it").

3. **Be honest about failure modes.** The overlays are QA tools first. Show where the method breaks
   (missed faint vessels, fragmentation, thick-vessel handling); do not hide it or over-claim.

4. **Metric definitions (locked):**
   - **COUNT = branch segments** (junction-to-junction / junction-to-tip pieces). Junctions and
     connected-vessel count are also reported, but the *segment* is the primary count unit.
   - **CATEGORIZE = vessel caliber**: capillary vs penetrating artery, by centerline diameter.
   - **MEASURE = total centerline length**; report both raw µm and the scale-invariant density.

5. **Real units & cross-figure comparison.** px→µm is calibrated from the **scale bar the figure
   itself prints**, measured off the panel — never assumed from a stated field size. For the Wang
   panels every bar is 50 µm (fig1 = 0.820, fig3 = 1.064, fig4/5/6 = 0.658 µm/px); other papers print
   other lengths, so `SCALEBAR_PX` is keyed by panel-name prefix and `SCALEBAR_UM` carries any bar
   that is not 50 µm. All of it lives in `measure_vessels.py` — the single calibration source.
   The figures are at **different zoom**, so **raw length is NOT comparable across figures** — use
   **length density (mm/mm²)** and **area %** for any cross-region/cross-figure comparison.

   **A panel with no measurable bar is declared, not guessed.** If a figure draws no scale bar, add
   the panel prefix to `UNCALIBRATED` with the reason instead of borrowing a neighbouring row's
   scale. Such panels report area % and pixels only, and drop out of every µm and density number —
   which is fine, as long as it is on the record rather than silent.

6. **Commit rule for images.** Commit image files **only if** they come from real data, or we agree
   they are valuable as progress or ground truth. In practice:
   - **Rendered overlay PNGs are gitignored** (`analysis/overlays/`, `analysis/annotated/`) —
     regenerate them from the scripts; do not commit them without explicit agreement.
   - **Commit the scripts and the derived numeric results** (the markdown tables) — those are the
     tracked progress.

## Visualization conventions (how we show progress)

The annotated overlay is the standard way we look at progress. **Source of truth:**
[`annotate_overlays.py`](../analysis/annotate_overlays.py). Regenerate:
`python3 analysis/annotate_overlays.py [name-substring ...]` → writes to `analysis/annotated/` (gitignored).

The owner iterated to this exact style — keep it:

- **Overlay on the ORIGINAL image at full brightness.** Do not dim the original.
- **Highlight = a slim outline that circles the detected thing — never a color fill.** "Don't add a
  layer of pixels over the thing you want to highlight; make it a very slim boundary."
- **Lines are thin and semi-transparent** so the original signal reads through them. Contours are
  drawn at *display* resolution (1 px, so upscaling doesn't fatten them) and alpha-blended (~0.5).
  Arrows and junction rings are drawn on a semi-transparent overlay (~0.4–0.7 alpha), 1 px.
- **Colors, chosen to contrast with the red signal:** capillary outline = **cyan**, artery outline =
  **green**, junction = small **magenta** hollow ring. **Avoid red for overlays** (it disappears on
  the red vessels).
- **Arrows + labels:** point an arrow at representative measured vessels and write the **length in
  µm**; for an example artery, write its **diameter**. Labels stay opaque/readable.
- **Drawn scale bar** inside the image, labelled with that panel's real bar length (50 µm for the
  Wang panels; other papers differ), and a **totals banner along the bottom**: segment count
  (capillary/artery split), total length + density, junction count, area %. An uncalibrated panel
  gets no overlay at all — `annotate_overlays.py` skips it and says so, rather than drawing a bar
  it cannot justify.
- **Tuning knobs** (in `annotate_overlays.py`): `CONTOUR_A` (contour opacity), `ARROW_A` / `RING_A`
  (arrow/ring alpha), `SC` (render scale), `ARTERY_DIAM_PX` (caliber threshold, in `measure_vessels.py`).

## File map

| Path | What |
|---|---|
| `references/README.md` | Index of every source paper + the intake protocol. |
| `references/METHODS-SYNTHESIS.md` | Cross-paper method comparison: what the literature does, what we adopted, what we rejected. |
| `references/<paper>/digest.md` | Self-contained digest per paper — read this instead of the PDF. |
| `references/<paper>/figures/` + `panels/` | Full figures and cropped panels; `VESSEL_*.png` = working-dataset inputs; each `README.md` = inventory + descriptions. |
| `references/wang-2022-cd31-vascular-network/figures/panels/expected-results.md` | Visual (LLM) expected results for the primary 16 panels — the validation reference. |
| `analysis/measure_vessels.py` | Extraction + metrics (categorize/count/measure). `--overlays` writes a 3-panel debug view. |
| `analysis/annotate_overlays.py` | Presentation overlays in the style above. |
| `analysis/results-first-pass.md` | Measured results, calibration, limitations. |
| `analysis/STATUS.md` | Current state and agreed next step. |
| `analysis/3D-STACKS.md` | The 3D work on the raw stacks: why flattening is not enough, what the literature does, open questions, ledger. |
| `analysis/extraction/` | Versioned 3D-stack vessel extractors, their shared score, provisional labels and ledger; `lab.py` runs them all. |
| `analysis/export_stack_view.py` + `analysis/stack_view/` | One raw stack → a rotatable 3D web viewer for the owner's feedback. |
| `data/README.md` + `data/sources.json` | The owner's raw confocal stacks: kept in Google Drive, never in git; fetched by `analysis/stack_sources.py` and checked by SHA-256. What is known about the microscope and how to read the stacks. |

Setup: `pip install -r requirements.txt` (numpy, scipy, scikit-image, Pillow, gdown, tifffile). Raw stacks: `python3 analysis/stack_sources.py`.
