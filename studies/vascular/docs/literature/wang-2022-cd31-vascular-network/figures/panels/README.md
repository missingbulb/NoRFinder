# Extracted panels — inventory & method

94 sub-panels cropped from the 7 paper figures (see `../` for the full figures and
`../../wang-2022-cd31-vascular-network.md` for the paper digest).

## The working dataset — `VESSEL_*.png` (16 files)

The isolated **red gP-CD31 (endothelial) channel** = the cerebral capillary network on a dark
background. **These are the inputs for vessel detection / counting / length quantification.**

| File | Region | Source panel |
|---|---|---|
| `VESSEL_fig1_C1_healthy_gP-CD31_red.png` | healthy | Fig 1 C1 |
| `VESSEL_fig3_ischemic_gP-CD31_red.png` | ischemic core | Fig 3 B2 |
| `VESSEL_fig3_penumbra_gP-CD31_red.png` | penumbra | Fig 3 C2 |
| `VESSEL_fig3_contralateral_gP-CD31_red.png` | contralateral | Fig 3 D2 |
| `VESSEL_fig4_{normal,ischemic,penumbra,contralateral}_gP-CD31_red.png` | 4 regions | Fig 4 A2–D2 |
| `VESSEL_fig5_{normal,ischemic,penumbra,contralateral}_gP-CD31_red.png` | 4 regions | Fig 5 A2–D2 |
| `VESSEL_fig6_{normal,ischemic,penumbra,contralateral}_gP-CD31_red.png` | 4 regions | Fig 6 A2–D2 |

Fig 4/5/6 all share the same normal/ischemic/penumbra/contralateral gP-CD31 red channel (different
co-stain in the green channel), so the 12 of them are 3 independent captures per region — handy for
testing robustness of a detector across acquisitions.

## Companion panels (the other 78)

Named `figN_<region>_<channel>.png`. Channels: `merge` (overlay), `Nissl_green` / `mM-CD31_green` /
`phalloidin_green` / `aSMA_green` (second marker), `3D*` (Imaris reconstruction), `overview`
(low-mag). Use these as context / ground-truth or to exclude non-vessel signal. `fig7_*` are the 3-D
spatial-correlation panels (penetrating artery long/transverse, capillaries).

## Crop method (reproducible)

Regenerated from `../fig*.png` with `crop_panels.py` (PIL). Grids were located from the figures'
gutters: Figs 4/5/6/7 have white gutters at x ≈ 352/707/1062/1418 (5 columns) detected automatically;
Figs 1/3 use black gutters, split evenly over the measured grid bounds (Fig 1 bottom strip y 745–1121
×4 cols; Fig 3 middle grid y 899–1790 ×3 rows ×5 cols). A 4-px inner trim avoids gutter bleed.
**Resolution caveat:** these are figure-resolution crops (~300–380 px per 50-µm panel), downsampled
from the raw confocal — fine for prototyping; recompute absolute lengths on raw data using the µm/px
in the digest (§5).
