# Extracted panels — Rust et al. 2020

25 panels: 24 cropped from the 3 figures, plus the authors' own supplementary image. Full figures and their descriptions:
[`../README.md`](../README.md). Paper digest: [`../../digest.md`](../../digest.md).

## The working-dataset panels — `VESSEL_*.png` (21 files)

Isolated **vessel channel** (red on black), the inputs for detection / counting / length
quantification. These are picked up automatically by
[`studies/vascular/analysis/measure_vessels.py`](../../../../../analysis/measure_vessels.py), which globs
`references/*/figures/panels/VESSEL_*.png`.

### Fig 1B — four labelling methods × two ages (16 files)

| File pattern | Age | Marker | µm/px |
|---|---|---|---|
| `VESSEL_rust20fig1_dev_overview_<marker>.png` | p10 | CD31 / IsolectinB4 / Perfusion-LectinDylight594 / Cldn5-eGFP | 0.685 |
| `VESSEL_rust20fig1_dev_closeup_<marker>.png` | p10 | same four | 0.704 |
| `VESSEL_rust20fig1_adult_overview_<marker>.png` | 3 mo | same four | 1.351 |
| `VESSEL_rust20fig1_adult_closeup_<marker>.png` | 3 mo | same four | 0.980 |

**Why these are valuable:** the same tissue type imaged four different ways. They are the
cleanest available test of whether our detector is **marker-agnostic** — a segmentation that
scores very differently on CD31 vs Cldn5-eGFP vs perfusion is keying on staining style, not on
vessels.

### The supplementary representative image (1 file) ⭐ the best input in the repo

| File | What | µm/px |
|---|---|---|
| `VESSEL_rust20suppl_representative.png` | **native-resolution 1024 × 1024 red vessel channel, published by the authors** as the example their macro was written against | **0.6058** |

Unlike every other panel here, this is **not a figure crop**. It comes from
[`../../supplementary/Representative_Image.tif`](https://github.com/missingbulb/vascularColoring/blob/54badaa922556913bed2e51834440b5419b940ca/references/rust-2020-fiji-vascular-analysis/supplementary/Representative_Image.tif),
an ImageJ TIFF that **carries its own calibration** (`unit=µm`, 1.650568 px/µm → 620 × 620 µm
field). It is recorded in `UMPP_DIRECT` rather than `SCALEBAR_PX` — the scale is the
acquisition's own, not a bar measured off a printed page.

**Use it as the primary sanity-check panel.** [`../../digest.md`](../../digest.md) §7.4 runs the
authors' published macro and our pipeline side by side on it: we agree to within **5–16%** on
area fraction, length density and branch count.

### Fig 2B / 3B — injury and disease (4 files)

| File | What | µm/px |
|---|---|---|
| `VESSEL_rust20fig2_overview_intact_vasculature.png` | mouse intact cortex | **uncalibrated** |
| `VESSEL_rust20fig2_overview_core-ibz_vasculature.png` | mouse stroke core + ischemic border zone | **uncalibrated** |
| `VESSEL_rust20fig3_overview_Ctrl_vasculature.png` | human control frontal cortex | 1.190 |
| `VESSEL_rust20fig3_overview_AD_vasculature.png` | human Alzheimer's frontal cortex | 1.190 |

## Companion panels (4 files)

`rust20fig2_closeup_*` and `rust20fig3_closeup_*` — **vasculature (red) + pericytes (cyan)**
two-channel close-ups. No `VESSEL_` prefix: the cyan channel is a second marker, so these are
context/ground-truth images, not clean segmentation inputs. Useful for checking that the
red-dominance segmentation really does ignore a co-stain.

---

## ⚠️ Read this before comparing these numbers to the Wang panels

These panels were folded into the working dataset deliberately, but they are **not**
interchangeable with the 16 gP-CD31 rat panels:

1. **Different species and model** — mouse (development, photothrombotic stroke) and human
   (post-mortem AD) here; rat MCAO in Wang.
2. **Different markers** — CD31 (rat anti-, mouse tissue), isolectin B4, perfused lectin,
   Cldn5-eGFP, biotinylated lectin. Wang is goat-polyclonal CD31 throughout.
3. **Different magnifications**, spanning 0.24–1.35 µm/px against Wang's 0.66–1.06. Raw length
   is meaningless across this set; only **length density (mm/mm²)** and **area %** compare.
4. **The supplementary representative image is the exception to all of the above** — native
   resolution, self-calibrated, and the only panel here validated directly against the authors'
   own method.
5. **`measure_vessels.py` rolls regions up per paper for exactly this reason** — nothing in the
   output averages a Wang region with a Rust region.
6. **Two panels are uncalibrated** (`rust20fig2_overview_*`, no scale bar drawn on that row —
   declared in `UNCALIBRATED` in `measure_vessels.py`). They report area % and pixels only and
   are excluded from every µm and density figure.
7. **The human panels are cross-sections, not networks** (5 µm paraffin). Branch/junction
   counts on them are not comparable to anything else in the set — treat area % as the only
   meaningful metric there.

**Expected-results discipline:** there is no visual `expected-results.md` for these panels yet.
Per [`studies/vascular/docs/WORKING-GUIDE.md`](../../../../WORKING-GUIDE.md) rule 1, the pipeline's
own output on them is **not** ground truth. Until someone eyeballs them and writes down what a
good result looks like, treat the numbers as exploratory.

## Crop method (reproducible)

Regenerated from `../fig*.png` by [`../crop_panels.py`](../crop_panels.py) (Pillow). The grid was
located automatically from the figures' own dark image bands (photomicrographs are
black-background, the page is white) and then frozen as literal coordinates so the crop is
deterministic. A 3-px inner trim avoids edge bleed.

**Resolution caveat:** as with the Wang panels, the 24 cropped panels are figure-resolution
(~360–440 px each), downsampled from the raw confocal — fine for prototyping, not for
publication-grade absolute lengths. `VESSEL_rust20suppl_representative.png` is **not** cropped by
this script: it is copied straight from the supplementary TIFF at native 1024 × 1024.
