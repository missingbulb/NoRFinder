# Extracted panels — Freitas-Andrade et al. 2022

12 sub-panels from Figs 3, 8, 9 and 13. Full figures: [`../README.md`](../README.md).
Digest: [`../../digest.md`](../../digest.md).

> **These panels are GRAYSCALE** — white vessels on black, not the red channel of the other
> papers. `measure_vessels.py` detects this (`MIN_RED_FRACTION`) and falls back to a luminance
> path; the red panels stay on exactly the code path they were originally measured with.

> **All of them are UNCALIBRATED.** No figure in this paper prints a scale bar and no pixel size
> is stated. They report area % and pixel counts only — never µm, never a density.

## Working-dataset panels — `VESSEL_*.png` (6 files)

| File | What | Why it is here |
|---|---|---|
| `VESSEL_fa22fig9_a_dense.png` | dense mesh — published VD **22.60** mm/mm², branch **234.3** mm⁻², tortuosity **0.90** | **ground truth** |
| `VESSEL_fa22fig9_b_sparse.png` | sparse — published **16.72**, **134.3**, **0.97** | **ground truth** |
| `VESSEL_fa22fig9_c_straight.png` | long straight parallel vessels — published **8.84**, **49.0**, **0.61** | **ground truth** |
| `VESSEL_fa22fig8_original.png` | the worked example | has a **reference mask and skeleton** beside it |
| `VESSEL_fa22fig3_MIP_CD31.png` | 10 µm-deep CD31 MIP | has a **reference skeleton** beside it |
| `VESSEL_fa22fig13_original.png` | the tortuosity example | **currently a failing case** — see below |

## Reference panels (6 files) — the authors' own output

Not `VESSEL_`-prefixed: these are results, not inputs. They are the closest thing we have to an
externally-produced answer key for segmentation.

| File | What it is a reference for |
|---|---|
| `fa22fig8_binary_reference.png` | the binary mask our `segment()` should approximate on `VESSEL_fa22fig8_original.png` |
| `fa22fig8_skeleton_reference.png` | the skeleton it should produce |
| `fa22fig8_graph_reference.png` | the pruned graph — bifurcations/terminations in blue, edges green |
| `fa22fig3_skeleton_reference.png` | the skeleton for `VESSEL_fa22fig3_MIP_CD31.png` |
| `fa22fig13_tortuosity_d10um.png` | per-pixel tortuosity at d = 10 µm |
| `fa22fig13_tortuosity_d20um.png` | per-pixel tortuosity at d = 20 µm |

**How to use them (and how not to).** Compare our mask/skeleton against these *visually*, in the
overlay style the working guide prescribes. Do **not** score against them numerically as if they
were pixel-perfect labels — they are figure-resolution JPEG/PNG renderings of the authors'
output, re-cropped, with their own compression artefacts.

## Known failure: `VESSEL_fa22fig13_original.png`

Our pipeline currently reports **43.7% area** and a 90th-percentile width of **66 px** on this
panel — both obviously wrong; the visible vasculature is nothing like 44% of the field. The
cause is visible in the image: unlike the other originals, this one has a **bright, textured grey
background**, and the luminance fallback plus the Otsu floor swallow it.

It is kept in the dataset **deliberately, as a hard test case**. A segmentation change that fixes
the faint-vessel misses without also fixing this panel has probably just moved the threshold.

## What these panels are good for

1. **The one external numeric check we have** — Fig 9, see [`../../digest.md`](../../digest.md) §5.
   Ranking is reproduced exactly; relative counts agree to ±9%; panel (b), the sparse dim one, is
   our worst case in both metrics, which independently confirms the faint-vessel failure mode.
2. **A visual answer key** for segmentation and skeletonization (Figs 3, 8).
3. **Marker/appearance robustness** — grayscale, a different microscope, a different lab. If our
   detector only works on Olympus red-channel rat panels, these are where that shows.

## What they are not good for

- Any **µm or density** number (uncalibrated).
- Any **cross-paper mean** — `measure_vessels.py` groups the rollup per paper for this reason.
- **Absolute branch counts.** The published number counts *bifurcation points*; ours counts
  *branch segments*. Related, not equal.

## Crop method

[`../crop_panels.py`](../crop_panels.py) (Pillow), coordinates located from the figures' dark
image bands and frozen. 3-px inner trim.
