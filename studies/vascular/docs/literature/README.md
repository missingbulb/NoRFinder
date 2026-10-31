# References — source papers

One folder per paper. Each folder is **self-contained**: the original PDF, a digest written so the
PDF never has to be reopened, and every figure extracted and described. This repository is public,
so a copyrighted paper keeps only its digest and figure descriptions; the PDF and images are
committed only under an open licence such as CC BY.

```
references/
  README.md                  <- you are here: the paper index
  METHODS-SYNTHESIS.md       <- cross-paper: what the literature does vs what we adopted
  BIOLOGY-INVARIANTS.md      <- what a real vessel graph must look like: scoring invariants, for expert sign-off
  _tools/extract_pdf_assets.py
  <paper-slug>/
    <paper-slug>.pdf         the original article
    digest.md                self-contained digest (no need to reopen the PDF)
    figures/
      README.md              every figure, described, with the images inline
      crop_panels.py         reproducible sub-panel crop
      figN_<name>.png        full figures at native resolution
      panels/
        README.md            sub-panel inventory + caveats
        VESSEL_*.png         isolated vessel channel = working-dataset inputs
        <other>.png          companion channels / context
```

**Slug format:** `<first-author>-<year>-<short-topic>`, lowercase, hyphenated.

**Adding a paper?** Follow the `paper-intake` skill.
It is the repeatable protocol these folders were built with.

---

## Papers

| Paper | What it gives us | Panels in the dataset |
|---|---|---|
| [**wang-2022-cd31-vascular-network**](wang-2022-cd31-vascular-network/digest.md)<br>*Sci Rep* 12:22288 — gP-CD31 / phalloidin / α-SMA, normal and ischemic **rat** brain | **The source of the primary images** and of the biology: which marker labels what, the four cortical regions, why gP-CD31 beats mM-CD31. Published only intensity + area %. | **16** — the primary set |
| [**rust-2020-fiji-vascular-analysis**](rust-2020-fiji-vascular-analysis/digest.md)<br>*Front Neurosci* 14:244 — automated **Fiji** analysis | **The methods reference**, and now the **strongest validation** we have: its supplementary material supplies the exact Fiji macro plus a µm-calibrated native-resolution vessel image, on which our pipeline reproduces their method to within 5–16%. | **21** (incl. the native supplementary image) |
| [**freitas-andrade-2022-pyvane-endothelial-networks**](freitas-andrade-2022-pyvane-endothelial-networks/digest.md)<br>*Neurophotonics* 9(3):031916 — **Pyvane** | **The closest analogue of our pipeline** and the only **external ground truth**: three images with published density/branching/tortuosity, plus reference masks and skeletons. Fully specified algorithm. | **6** (grayscale, uncalibrated) |
| [**stefanitsch-2015-tpa-cerebrovascular-tree**](stefanitsch-2015-tpa-cerebrovascular-tree/digest.md)<br>*Front Cell Neurosci* 9:456 — tPA⁻/⁻ mice | **The only quantitative reference for CATEGORIZE**: CD31⁺ caliber bins (<5 / 5–10 / >10 µm) and ASMA⁺ artery diameters (mean 22.9 µm). Says our artery threshold is too low. | none — all micrographs are multi-channel |
| [**hill-2020-aging-mra-cerebrovascular-loss**](hill-2020-aging-mra-cerebrovascular-loss/digest.md)<br>*Front Aging Neurosci* 12:585218 — CE-MRA | A **cross-modality validation design** worth imitating, a reference count density (458 vessels/mm², young mouse), and aging as a confounder. | none — MR angiography, different modality |
| [**bizou-2026-nvu-angiogenic-programs**](bizou-2026-nvu-angiogenic-programs/digest.md)<br>*Nat Commun* 17:6746 — NVU communications | **Whole-brain vascular-density heatmaps** (the second paper to converge on the grid-heatmap construct), an open analysis toolkit, and a warning that density is region-specific. | none — all micrographs are multi-channel |
| [**blinder-2013-cortical-angiome**](blinder-2013-cortical-angiome/digest.md)<br>*Nat Neurosci* 16:889 — the cortical angiome | **What a correct mouse cortical vessel graph looks like**: 93% three-way junctions, median vessel 50 µm, radius ~2 µm, loops of ~8 edges, no dangling sub-networks, penetrating venules 3× arterioles. Feeds [`BIOLOGY-INVARIANTS.md`](BIOLOGY-INVARIANTS.md). | none — renders of vectorized networks and plots |
| [**cassot-2010-cortical-branching-patterns**](cassot-2010-cortical-branching-patterns/digest.md)<br>*Brain Res* 1313:62 — human cortical arteriole and venule bifurcations | **Junction geometry from 9,414 bifurcations**: Murray's exponent scatters (IQR 2.3–6.1), the larger daughter is wider than the parent in ~40%, angles are wide (~104° between daughters) and mostly planar; optimal-angle theory fails. | none — human, India ink, renders and plots |
| [**ji-2021-whole-brain-microvascular-topology**](ji-2021-whole-brain-microvascular-topology/digest.md)<br>*Neuron* 109:1168 — three whole mouse brains at sub-µm resolution | **The largest measured vessel graph**: 97–99% three-way junctions, angles 84/118/145°, junctions ~15° out of plane, loops of ~9 branches, median capillary 45–46 µm, tortuosity 1.27, length density per region including hippocampus. Copyrighted: digest only, no PDF or figures. | none — no figures committed |
| [**smith-2019-capillary-networks-across-species**](smith-2019-capillary-networks-across-species/digest.md)<br>*Front Physiol* 10:233 — mouse vs human capillary beds, CC BY | **Capillary-bed statistics and a generator**: loops of ~11 edges and ~490 µm, 7% four-way junctions, tissue-to-vessel distance ~18 µm, junctions about half converging and half diverging. Mouse data shared with Blinder 2013. | none — renders and plots |

**Seven of ten contribute no panels, and that is a result, not a gap.** A paper enters the
working dataset only if it has isolated single-channel vessel images; forcing multi-channel
merges or a different imaging modality into `VESSEL_*` would break the one contract the dataset
has. Each of those digests says explicitly why, in its §5.

---

## What goes in the working dataset

A panel earns the `VESSEL_` prefix — and so gets picked up by
[`studies/vascular/analysis/measure_vessels.py`](../../analysis/measure_vessels.py) — when it is an **isolated
single-channel vessel image**: vessels bright on a dark background, no second marker mixed in.
Merged overlays, co-stain channels, 3-D renders and schematics keep a plain name and stay as
context.

Two hard requirements come with the prefix:

1. **A calibration entry.** Either a measured `SCALEBAR_PX` prefix, or an explicit `UNCALIBRATED`
   declaration with the reason. The `panel-scale-calibration` check enforces this.
2. **A unique prefix.** The Wang panels are the incumbents and keep bare `figN` keys; **every paper
   added since carries a paper tag** (`rust20fig1_…`) so calibration prefixes cannot collide.

**Different papers are never averaged together.** `measure_vessels.py` groups its region rollup by
paper, because species, injury model, marker and magnification all differ across the corpus.
