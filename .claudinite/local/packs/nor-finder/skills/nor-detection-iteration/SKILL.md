---
name: nor-detection-iteration
description: Procedure, checkpoints and tools for improving the NoR (green-red-green node) detector in detection/. Use when starting, resuming or iterating on it.
metadata:
  body: workflow
  usage:
    expect: judgment
---

# NoR detection iteration

## Purpose
This skill improves an algorithm that finds nodes of Ranvier (NoRs) in 3-channel fluorescence slide images:
- Caspr is green.
- Nav is red.
- DAPI is blue.

Work in the loop that Ariel (the domain expert) used:
- Claude runs the research loop by itself.
- Ariel gives criteria, priorities and threshold corrections at explicit checkpoints.
- Ariel rarely labels single objects. They turn what they see into rules. Ask them for rules and priorities, backed by concrete visual evidence.

## Inputs
- A slide TIFF: an ImageJ 3-channel file whose LUTs give the display colours. Its XResolution gives µm/px. The reference image is `Slide5_4AP_NoR.sld - Slice1_up_left2.tif` (Drive file id `1NRObE-kEsINGTvFkI-uh3dFjiZgcWMUp`).
- The NoRFinder repo (`github.com/missingbulb/NoRFinder`). `naive_nor.py` imports `src/nor.py` from it.
- The last accepted version folder and its `nor_candidates.csv`: the comparison baseline.
- Any new instruction from Ariel.

## Scripts (in `detection/` of this repo)
Dependencies: numpy, scipy, scikit-image, pillow and tifffile. The scripts import `src/nor.py` from this repo (override with `NORFINDER_SRC`). The slide TIFF comes from `python3 src/fetch_data.py` into `data/raw/` (`NOR_TIF` overrides); the loaded image and blue mask are cached in `detection/.cache/`, which is never committed.

Start every session by reading `detection/STATE.md` (where the work stands and what is next) and `detection/lab/ledger.md` (what was already tried). Update both before the PR that changes them merges: the repo, not a project folder, is where the work lives. Output images are processing artifacts that validate the code; never commit them.

- `python3 naive_nor.py INPUT OUTDIR [--blue-mask]`
  - Baseline (`nor.detect`). It writes `redgreen.png`, `overlay_yellow.png` (traced 1/3-px yellow outline at 3×) and `contact_sheet.png`.
  - With `--blue-mask` it also writes `blue_mask_outline.png` (the mask edge in cyan).
  - The module exports `load()`, `blue_mask()` and `to8()`.
- `python3 nor3.py INPUT.tif OUTDIR [--blobs]`
  - The three-segment detector plus validation. The blue mask is always on.
  - The default candidate finder is `walk` (walk along the fibre). `--blobs` uses the older finder, where each red blob is a candidate and its greens are the green blobs nearby.
  - It writes `overlay_all_candidates.png` (overlay plus a side panel with legend and list) and `nor_candidates.csv` (`n,result,reason,x_px,y_px,length_um,red_length_um,red_over_length,length_over_width`).
  - Parameters live in the `P` and `P2` dicts. The checks are in `CHECKS`, their order in `ORDER`, and the letters and colours in `REASONS` and `REASON_TEXT`.
- `python3 render_std.py SPEC OUTDIR`: the standard review images (overlay_all_candidates, overlay_zoom_with_legend at the v8 crop, CSV) for any finder spec. **The review format is an API: don't change it unless Ariel asks. Propose improvements and wait for approval.**
- `python3 nor_lab.py ablate BASE VARIANT...`: keep/drop verdict per change (paired bootstrap on labels: P(better) ≥0.8 keep, ≤0.2 drop, otherwise no evidence, so keep the simpler option or the incumbent).
- `python3 perf.py snapshot|check|profile SPEC`: the performance pass (below).
- `detection/lab/ledger.md`: every direction, change, pitched idea and perf attempt, with its verdict. Add a row for every attempt, failures included.
- Not in any script yet: the zoom crop, the contact sheets of passes and rejects, and `brightness_bands.png`. Write them as functions in a new script and don't re-type them ad hoc, so every version can be reproduced.

**Shared-folder rule:** never edit an accepted script in place. Copy it to `nor<N>.py` (or add a new `--method`), leave older versions runnable, and write outputs to a **new** folder each time.

## Domain knowledge (from Ariel)
- **A NoR looks like** a green-red-green triplet between nuclei: a short, thick stick or "wand". The red Nav node sits between two green Caspr paranodes. It is **not** round, so outlines must follow its shape.
- **Structure:**
  - Exactly three segments, in the order green, red, green.
  - The two greens do not touch each other.
  - The three segments lie roughly on a line.
- **Colour purity:** a green segment contains little red, and a red segment little green. Ariel first set this at <10%, then relaxed it to **≤20%**. Leave the 1-px rim at each green/red boundary out of the measurement, because optical blur makes it yellow.
- **Symmetry:** the two greens are similar in **area** and in **total brightness**. A big mismatch means a bad image or a bad analysis. The current limit is that the smaller is at least 1/3 of the larger.
- **Shape:** a short stick. Length (green end → red → green end, along the green-to-green axis) ÷ mean width (area ÷ length) must be ≥ 3. This check is currently redundant with the others.
- **Brightness:** keep only bright NoRs, not "mushy" ones. Each segment's (mean − local background median) ÷ robust noise (1.4826·MAD) is scored, and the weakest segment must be ≥ 3.5. That cutoff was chosen at a dip in the score histogram; the textbook value of 5 drops good nodes.
- **One pixel belongs to one NoR.** Resolve duplicates strongest-first.
- **Blue mask recipe** (approved by Ariel):
  1. Blur DAPI with gaussian σ=2.
  2. Keep pixels above 0.45 × Otsu, which catches the dim nucleus rim.
  3. Drop blobs under 30 px.
  4. Fill holes.
  5. Dilate by 2 px.
  6. Inside the mask, set red and green to their background median and leave them out of thresholds.

  On the reference image this masks about 14% and removed 72 detections that sat inside nuclei.
- **Known false-positive sources:**
  - red specks inside nuclei (fixed by the mask)
  - lone red dots and background grain in grainy tissue (lower-right of the reference image)
  - dim, mushy blobs
  - double-counted shared greens
- **Known false-negative source:** the candidate generator. Pixel noise breaks a paranode into specks, so real triplets show up as "only one green" (A), which is the largest reject class (415–467). Ariel: "Our biggest problem right now are misformed original candidates."
- **Scale-free rule:** candidate generation must not use absolute pixel or µm constants. Express lengths as multiples of the image-derived `unit` (median green-blob half-length), and cut-offs as fractions of local intensity (for example, half the blob's peak brightness) or as noise multiples.

## The iteration loop
Run one iteration per change. Each iteration is a new version `vN`.

1. **Baseline.** If no version exists, run `naive_nor.py`. After that, run the last accepted version and confirm that its metrics reproduce.
2. **Diagnose.** Read the reject counts by letter and look at the zoom of the dense region. Decide which is the bottleneck:
   - The generator: many A/B rejects, or obvious triplets not drawn at all. **A ("one green") measures candidate quality, not NoR quality.** A large A count means candidates are built wrong: green and red are not being separated properly. Fix the generator, not the filters.
   - A filter: a letter that rejects things that look like NoRs, or a letter that only rejects what others already reject.
3. **Hypothesise.** Write one sentence covering the change, the expected effect on the metrics, and the rejects or misses it targets.
4. **When redesigning the generator, use Ariel's procedure:**
   1. Describe the current algorithm in plain words.
   2. Ask whether it makes visual and geometric sense for a thick-wand triplet.
   3. Write how you would explain to a child how to find one. Number the steps, and make each step concrete enough to draw.
   4. Implement that explanation literally.
   5. Check every constant against the scale-free rule.
   6. If the A count stays high, assume the child said "I don't understand". Don't tweak the old explanation: explain it in a **totally different way**, as a new algorithm built on a different idea. Think outside the box, and try more than one idea if needed.
5. **Implement** the change as a versioned variant (a new script or a new `--method`) with a new output folder `Slide5_Slice1_up_left2/v<N>_<short_name>/`. Every new filter gets:
   - the next free letter
   - a distinct colour
   - a `REASON_TEXT` line that states the threshold
   - a CSV reason
6. **Produce the standard QA outputs** (see the conventions below).
7. **Compute metrics** (see below) and write `metrics.json` plus a one-screen `compare.md` against the previous version.
8. **Decide:**
   - **Generator changes:** keep the change only if passes ≥ the previous version's AND candidates ≤ the previous version's, so that yield rises. Otherwise keep the previous version and record why.
   - **Filter changes:** keep the change if it removes rejects Ariel called wrong, or removes redundancy, without moving the length and ratio medians by more than about 10%.
   - Show both versions side by side whenever a change moves the pass count by more than 10%.
9. **Stop or continue.**
   - Continue on your own while each iteration improves the metrics.
   - After **two iterations without improvement**, stop and go to a human checkpoint with what you have ("show me what you have… and we'll chat").
   - Always stop at the checkpoints listed below.

### False-negative rescue cycles (run a few cycles after each accepted version)
1. Go over the result image (overlay and zoom) and look for **blatant false negatives**: clear green-red-green wands drawn in blue (rejected).
2. Pick a few, and record their numbers and reject letters.
3. For each one, find the filter that removed it and the score that failed, and how far that score was from the threshold.
4. Adjust that filter (threshold or measurement) so these pass, without letting in obvious junk. Check the only-reason contact sheet for that filter before and after.
5. Rerun, compare metrics and repeat. Stop after a few cycles, or when no blatant false negatives remain, and report the cycles in one table.

### Filter ablation (run whenever filters are added or changed)
- For each check in `CHECKS`, over the candidates that have two greens, count:
  - `standalone`: how many it rejects when run alone
  - `only_reason`: how many it is the only failing check for
  - how many rejects it shares with each other check
- Reorder `ORDER` by `standalone`, descending: the toughest judge goes first.
- Flag a check as **redundant** when `only_reason` < 10% of `standalone`, as G was with 3 of 48. Report it, and don't delete it without asking.
- Remember that order changes only which letter a reject gets. The pass count stays the same.

### Threshold choice when Ariel says "you decide"
- Plot a histogram of the score and put the cutoff at a natural valley or dip. Say where the dip is.
- Render `*_bands.png`: contact tiles of candidates grouped in score bands around the cutoff, so Ariel can judge the cutoff by eye.
- For ratios with no valley, use 1/3 (a factor of 3), as was done for green area and brightness balance, and say that this is a default.

## QA output conventions (Ariel's stated preferences)
- **Never cover the image.** Draw outlines only: a 1-px ring just *outside* each segment's pixel mask, drawn on a 3× upscaled copy so the line is 1/3 of an original pixel wide. Never draw circles or ellipses.
- **Outline each of the three segments** (green, red, green) separately.
- **Transparency:** all NoR borders are at 40% transparency (alpha 0.6). The red-segment border may be fainter.
- **All-candidates overlay** (`overlay_all_candidates.png`):
  - Draw every candidate that has at least one green: **pink** border for passes, **blue** for failures.
  - Put a small number next to each one, **numbered top to bottom**.
  - Failures also get a coloured **letter** for their first failing reason, in `ORDER`.
  - Add a side panel with:
    - a legend (letter, colour, rule with its threshold, count)
    - a note on how many bare red specks were left out
    - the full list: `#, pass/letter, length µm, red length µm, red/length, L/W`
- **Zoom** (`overlay_zoom_with_legend.png`): a crop of the densest region with the legend, where shapes are easiest to judge.
- **Contact sheets** (`contact_pass.png`, `contact_rejected.png`): numbered crops, zoomed in, with the same numbers as the overlay list. On the reject sheet, tag each crop with its letter.
- **CSV** (`nor_candidates.csv`): one row per shown candidate, with the same numbers.
- **Blue mask** (`blue_mask_outline.png`): the DAPI at half intensity, with the mask edge in cyan.
- For every new filter or threshold, also render a contact sheet of the candidates for which **this filter is the only reason** for rejection. That is what Ariel needs to judge whether it is too strict.

## Metrics (compute for every version, into metrics.json)
- `n_red_seeds`, `n_candidates` (shown), `n_pass`, `yield = n_pass / n_candidates`
- `rejects_first_reason` by letter; `rejects_standalone` and `only_reason` per check; redundancy flags
- `frac_centres_in_blue_mask` (it must be 0 with the mask on)
- For passes, the median and IQR of `length_um`, `red_length_um`, `red_over_length` and `length_over_width`. Reference values: length ~4.7 µm and red ~1.6 µm (S4).
- Fragility: for each threshold, the number of passes within 10% of it
- Version diff: passes matched between vN-1 and vN (centre distance < 1 unit), reported as kept, lost and gained, with contact sheets of lost and gained
- A spatial split of passes and rejects by image quadrant, to catch the grainy-tissue false-positive zone
- **When a labelled set exists** (`labels.csv`: x, y, is_nor): precision, recall and F1 of the passes. These then replace `n_pass` as the objective. Until then, say plainly that pass count is only a proxy.

## HUMAN CHECKPOINTS: stop and ask Ariel
At every checkpoint:
- Show the images inline.
- Give numbers.
- Ask **one** concrete question.
- Do not continue past the checkpoint until Ariel answers.

1. **New image or slide: blue mask approval.**
   - Show `blue_mask_outline.png` and say what % it masks.
   - Ask: "Does the cyan outline cover the nuclei, including their dim rim, and nothing else? OK to ignore these areas?"
2. **After the baseline, and whenever the bottleneck is unclear: set the priority.**
   - Show the all-candidates overlay and zoom, and the reject counts by letter.
   - Ask: "Is the biggest problem the candidate finder or one of the filters? Which one should I attack first?"
3. **Threshold sanity, after any new filter or a threshold Ariel didn't set.**
   - Show the only-reason contact sheet for that filter and the band tiles around the cutoff.
   - Ask: "Are any of these rejected ones real NoRs? Should the limit move?" This is how purity went from 10% to 20%.
4. **New structural criterion proposed by Claude.**
   - Show 10–20 example crops the criterion would reject.
   - Ask: "Is this a real property of NoRs, or would it remove true ones?" Only Ariel adds domain rules.
5. **Generator redesign.**
   - Show the plain-language "explain to a child" steps, with the before and after metrics.
   - Ask: "Does this description match how you find a NoR by eye? Which step is unclear?"
6. **Stalled: two iterations with no metric improvement.**
   - Show the latest images and the metric history table.
   - Ask what to try next.
7. **Before calling a version final, or running it on other slides.**
   - Show vN-1 and vN side by side, with lost and gained contact sheets.
   - Offer to build a labelled set: a sampled contact sheet of about 150 candidates, where Ariel marks real or not by number.

## Improve the process itself
This loop is the core of the work, so time spent making it cheaper is worthwhile. Look for savings in each of these and build tools where they pay off:
- **Time and CPU:** cache the loaded image, blue mask and candidates (for example as `.npz`) so a filter change doesn't redo generation; iterate on a representative crop before running the full image; vectorise slow per-candidate loops.
- **Tokens:** write one `run_version.py` that produces every QA output, `metrics.json` and `compare.md` in one command; read `metrics.json` and the diff instead of opening large images; open only the zoom or the small contact sheets you need.
- **Human interactions:** batch questions for Ariel into one checkpoint; always show the only-reason and lost/gained contact sheets so one look is enough; push towards a labelled set, which lets most future checks run without asking.

Report any tool you build, what it saves, and how to use it, and add it to the Scripts section of this skill.

## What runs autonomously (no need to ask)
- Implementing a criterion Ariel stated, including choosing its threshold when Ariel says "you decide".
- Filter ablation, reordering, duplicate resolution, and redundancy reports.
- Tuning parameters against the validator's pass count or yield, within the scale-free rule.
- Trying alternative generators and keeping one only under the acceptance rule.
- False-negative rescue cycles.
- Building tools that save time, CPU, tokens or human interactions.
- All rendering, CSVs, metrics and version comparisons.
- Rendering-only restyles Ariel has already specified (colours, transparency, numbering).

## Reporting each iteration
Keep each report short. Include:
- the pass count, the candidate count and the change from the last version
- what changed and why
- counts per reject letter
- any deviation from Ariel's rule, with the reason, as with the 1-px purity rim
- the folder path
- the one question from the relevant checkpoint, if there is one

Mark what you only eyeballed as "inferred, not scored".

## Performance pass
Run it at the end of a long algorithmic task (a new direction or finder). Skip it for quick fixes and whenever Ariel is waiting on results.
1. `perf.py snapshot SPEC` (saves the output signature and the min-of-3 time).
2. `perf.py profile SPEC` and pick the top hotspot you own.
3. Change one thing.
4. `perf.py check SPEC`. Keep it only if the output is IDENTICAL and it is faster (timing noise is about ±15%, so re-check small gains). Otherwise revert.
5. Log the attempt, kept or reverted, in detection/lab/ledger.md §4, and report before/after in one line.
