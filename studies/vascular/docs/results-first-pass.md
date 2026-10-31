# First-pass measured results — categorize / count / measure

> Output of [`measure_vessels.py`](../analysis/measure_vessels.py) on the 16 `VESSEL_*.png` gP-CD31 panels.
> Measured companion to the visual [`expected-results.md`](literature/wang-2022-cd31-vascular-network/figures/panels/expected-results.md).
> **First pass — parameters not yet tuned; treat rankings as the real result, absolute numbers as directional.**

## Scale calibration (px → µm) — measured from the figures

Each figure prints a **50 µm scale bar** on its merge/montage panel, at the *same resolution* as its
VESSEL panel, so the µm/px transfers directly. Bar widths measured from the images:

| figure(s) | 50 µm bar | **µm/px** | panel field of view |
|---|---:|---:|---|
| fig1 | 61 px | **0.820** | ~301 µm |
| fig3 | 47 px | **1.064** | ~311 µm |
| fig4 / fig5 / fig6 | 76 px | **0.658** | ~228 µm |

**Fig 4/5/6 are zoomed in further** (smaller field) than Fig 1/3. Consequence: raw total length (px
*or* µm) is **not comparable across figures** — a larger field simply contains more vessel. The
comparable metrics are the **scale-invariant densities** below (and area %, which is already a fraction).
Calibration is figure-space; the digest (§5) still recommends recomputing absolute length on raw `.oib`
data, since these are downsampled figure crops.

## What each column is (the professor's three asks)

- **CATEGORIZE** → `cap` / `art`: each branch classified capillary vs penetrating artery by centerline
  diameter (threshold 9 px). `wp90` = 90th-pct diameter.
- **COUNT** → `seg` (raw) and **`cnt_dens`** = segments per mm² (comparable). Segment = junction-to-junction / junction-to-tip piece.
- **MEASURE** → `len_um` (raw, figure-space) and **`len_dens`** = mm of vessel per mm² of tissue (comparable).

## Per-image

| panel | len µm | **len_dens** (mm/mm²) | **cnt_dens** (seg/mm²) | seg | cap | art | area% | wp90 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| fig1_C1_healthy | 2145 | 23.6 | 1951 | 177 | 157 | 20 | 14.2 | 10.0 |
| fig3_ischemic | 2287 | 23.9 | 1131 | 108 | 91 | 17 | 18.1 | 10.0 |
| fig3_penumbra | 2701 | 28.3 | 1508 | 144 | 133 | 11 | 18.4 | 8.2 |
| fig3_contralateral | 1860 | 19.5 | 1068 | 102 | 96 | 6 | 13.0 | 8.0 |
| fig4_ischemic | 1689 | 32.3 | 2870 | 150 | 139 | 11 | 12.6 | 8.5 |
| fig4_penumbra | 1249 | 24.0 | 2130 | 111 | 101 | 10 | 10.2 | 8.1 |
| fig4_contralateral | 845 | 16.6 | 1773 | 90 | 80 | 10 | 9.1 | 10.2 |
| fig4_normal | 766 | 14.7 | 2136 | 111 | 102 | 9 | 6.8 | 10.0 |
| fig5_ischemic | 1341 | 25.7 | 1741 | 91 | 87 | 4 | 10.2 | 8.2 |
| fig5_penumbra | 1684 | 32.1 | 2480 | 130 | 117 | 13 | 15.0 | 10.0 |
| fig5_contralateral | 1055 | 21.1 | 2059 | 103 | 91 | 12 | 11.1 | 12.0 |
| fig5_normal | 1180 | 22.4 | 1878 | 99 | 92 | 7 | 11.4 | 12.6 |
| fig6_ischemic | 1569 | 30.1 | 2514 | 131 | 108 | 23 | 16.1 | 10.8 |
| fig6_penumbra | 1384 | 26.5 | 2277 | 119 | 99 | 20 | 13.8 | 11.7 |
| fig6_contralateral | 762 | 15.1 | 1600 | 81 | 79 | 2 | 7.0 | 8.5 |
| fig6_normal | 772 | 14.8 | 1516 | 79 | 69 | 10 | 6.7 | 10.8 |

## Region means (scale-invariant — the validation target)

| region | **len_dens** (mm/mm²) | **cnt_dens** (seg/mm²) | area% | n |
|---|---:|---:|---:|---:|
| ischemic | 28.0 | 2064 | 14.2 | 4 |
| penumbra | 27.7 | 2099 | 14.3 | 4 |
| contralateral | 18.1 | 1625 | 10.0 | 4 |
| normal | 17.3 | 1843 | 8.3 | 3 |
| healthy (fig1) | 23.6 | 1951 | 14.2 | 1 |

- **Length density and area %** rank **ischemic ≈ penumbra > contralateral ≈ normal** — matches the
  paper's biology and the visual expectations. This is the trustworthy result.
- **Count density does NOT rank cleanly** (normal comes out spuriously high): fragmentation in the dim
  normal/contralateral fields splits vessels into extra segments, inflating the count. Confirms *count*
  is the metric that still needs the fragmentation fix before it's reliable.

## Known limitations (first pass)

1. **Count is confounded by fragmentation** — short stain dropouts create spurious segments/endpoints,
   worst in dim fields. Next: stronger gap-bridging + segment-level reconnection, then re-check count density.
2. **Artery/capillary split is one diameter threshold** — borderline vessels flip. Note the "normal"
   fields carry higher `wp90` (fig5/fig6 normal contain penetrating arteries), so caliber varies within
   a region more than the region label implies.
3. **Figure-resolution crops** — µm/px is calibrated, but the underlying panels are downsampled from raw
   confocal; recompute absolute length on raw `.oib` for publication numbers.

Regenerate overlays: `python3 analysis/measure_vessels.py --overlays` (writes to `analysis/overlays/`, gitignored).
