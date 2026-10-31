# Reference digest — Wang et al. 2022, CD31 / phalloidin / α-SMA vascular labeling of rat brain

> Self-contained digest of the source paper for the VascularColoring project. Everything the project
> needs — biology, protocol, imaging numbers, quantification, *and* the extracted images — is captured
> here + in `figures/` and `figures/panels/`. **No need to reopen the PDF.**

- **Title:** *The immunolocalization of cluster of differentiation 31, phalloidin and alpha smooth
  muscle actin on vascular network of normal and ischemic rat brain*
- **Authors:** Jia Wang†, Yating Guo†, Dongsheng Xu, Jingjing Cui, Yuqing Wang, Yuxin Su, Yihan Liu,
  Yi Shen, Xianghong Jing, **Wanzhu Bai\*** (†equal contribution; \*corresponding,
  wanzhubaisy@hotmail.com). Institute of Acupuncture and Moxibustion, China Academy of Chinese
  Medical Sciences, Beijing 100700, China.
- **Venue / id:** *Scientific Reports* (2022) **12:22288**. DOI **10.1038/s41598-022-26831-6**. Open
  access (CC BY). 13-page article.
- **One-line thesis:** goat-**polyclonal** anti-CD31 (gP-CD31) labels the cerebral capillary network
  far more completely than **monoclonal** anti-CD31 (mM-CD31), and is highly compatible with
  phalloidin and α-SMA for mapping the vascular network in 3-D, in both healthy and ischemic rat brain.

---

## 0. Abbreviations (glossary)

| Abbr | Meaning |
|---|---|
| **CD31 / PECAM-1** | Cluster of differentiation 31 / platelet-endothelial cell adhesion molecule-1 — endothelial-cell surface marker |
| **gP-CD31** | **g**oat **p**olyclonal anti-CD31 (the "good" vessel marker here) |
| **mM-CD31** | **m**ouse **m**onoclonal anti-CD31 |
| **α-SMA** | Alpha smooth muscle actin — smooth-muscle marker on artery walls |
| **Phalloidin (Pha)** | Probe for filamentous (F-)actin; labels thick vascular walls |
| **Nissl** | Neuronal cell-body stain (counterstain) |
| **DAPI** | 4′,6-diamidino-2-phenylindole — nuclear stain |
| **MCAO** | Middle cerebral artery occlusion (the stroke model) |
| **I/R** | Ischemia / reperfusion |
| **TTC** | 2,3,5-triphenyltetrazolium chloride (a classic infarct stain, *not* used here — Nissl used instead) |
| **PFA / PB** | Paraformaldehyde / phosphate buffer (fixation) |
| **AF488 / AF594 / AF647** | Alexa Fluor fluorophores (green / red / far-red) |

---

## 1. Why this matters to *our* task  ⭐

Our task (from the professor): **detect the fluorescently-labeled cerebral blood vessels and quantify
them — number, length, etc.** This paper is the *source of the example vessel images*. The professor
pointed at specific panels — **all of them are the isolated single vessel channel** (gP-CD31, shown in
**red**): the clean inputs a segmentation/quantification pipeline runs on.

| Professor's pointer | What it is | Region | Extracted file |
|---|---|---|---|
| **Fig 1 – C1** | isolated gP-CD31 (red) vessels, healthy cortex | normal | `panels/VESSEL_fig1_C1_healthy_gP-CD31_red.png` |
| **Fig 3 – B2** | isolated gP-CD31 (red) vessels | ischemic area | `panels/VESSEL_fig3_ischemic_gP-CD31_red.png` |
| **Fig 3 – C2** | isolated gP-CD31 (red) vessels | ischemic penumbra | `panels/VESSEL_fig3_penumbra_gP-CD31_red.png` |
| **Fig 3 – D2** | isolated gP-CD31 (red) vessels | contralateral | `panels/VESSEL_fig3_contralateral_gP-CD31_red.png` |
| **Fig 4 – A2/B2/C2/D2** | isolated gP-CD31 (red) vessels | normal / ischemic / penumbra / contralateral | `panels/VESSEL_fig4_<region>_gP-CD31_red.png` |

**Pipeline takeaway:** the target image is a **2-D confocal slice/projection of the red gP-CD31
channel** — a capillary network as bright curvilinear structures on a dark background. In every
comparison figure the panel-number convention is: `…1` = merged overlay, **`…2` = vessels only (red)**,
`…3` = the other marker, `…4`/`…5` = 3-D reconstruction. **For counting / measuring vessels, use the
`…2` (red) panels only** — they are pre-separated for us in `figures/panels/` (prefixed `VESSEL_`).

**The quantification gap we fill:** the authors published only **intensity** and **area-%** metrics
(§6). They never counted vessels or measured vessel length. **Vessel number, length, and skeleton/
branch metrics are exactly the new quantification the professor wants** (e.g. threshold → binarize →
skeletonize → count branches & sum skeleton length, per region). The paper's area-% is a useful
sanity-check baseline.

---

## 2. Background (why CD31, and why the brain is special)

- Cerebral blood vessels form a complex network supplying O₂/nutrients for brain activity. **Unlike
  vessels elsewhere, they penetrate the cortex radially** — a structural/functional peculiarity — and
  cerebrovascular disorders underlie many diseases, so choosing a *good vessel biomarker* matters.
- **CD31 (= PECAM-1)** is an immunoglobulin-superfamily adhesion molecule on platelets, leukocytes and
  **endothelial cells**; it is *the* classic endothelial marker for existing and developing vessels
  and for microvascular-density counting.
- **Problem the authors previously hit:** CD31 immunolabeling looks *different depending on the
  antibody* (polyclonal vs monoclonal) and on vessel condition. This study systematically compares
  gP-CD31 vs mM-CD31, and adds phalloidin + α-SMA, across health and ischemia, ending in 3-D
  reconstruction of the spatial relationships.

---

## 3. Experimental design at a glance

- **Animals:** 8 male Sprague–Dawley rats, 200 ± 20 g. Randomized into **control (n=4)** and
  **I/R model (n=4)**.
- **Stroke model (I/R):** MCAO — right common/external/internal carotid exposed; a **0.28 mm nylon
  filament** advanced ~18 mm to occlude the middle cerebral artery origin; **1.5 h occlusion**, then
  filament withdrawn ~10 mm for **reperfusion**; **24 h survival**. Controls: no surgery.
- **Fixation:** transcardial perfusion with 0.9% saline then **4% PFA** in 0.1 M PB (pH 7.4);
  post-fix 2 h; cryoprotect in 25% sucrose overnight at 4 °C.
- **Sectioning:** serial **coronal sections, 80 µm thick**, sliding microtome (Yamato REM-710).

### The four cortical regions (the analysis units)
Every comparison figure and bar chart is organized by these — match them when reporting per-region
metrics:
1. **Normal** — healthy control brain.
2. **Ischemic area / core** — MCAO-damaged tissue (**strongest gP-CD31**, most neuron loss).
3. **Ischemic penumbra** — tissue bordering the core.
4. **Matching contralateral** — mirror-image healthy side of the same I/R brain (internal control).

---

## 4. The markers (what "colors" the vessels) — Table 1 reagents

Five multiplex staining combinations were used: ① gP-CD31 + Nissl; ② gP-CD31 + mM-CD31 + DAPI;
③ gP-CD31 + phalloidin + DAPI; ④ gP-CD31 + α-SMA + DAPI; ⑤ gP-CD31 + phalloidin + α-SMA.
Block: 3% normal donkey serum + 0.5% Triton X-100; primaries overnight at 4 °C; secondaries + counter-
stains 2 h; coverslip in 50% glycerin.

| Reagent | Host / type | Dilution | Producer (Cat#) | Channel |
|---|---|---|---|---|
| **CD31 (gP-CD31)** | goat polyclonal | 1:1000 | R&D **AF3628** | red (via AF594) |
| **CD31 (mM-CD31)** | mouse monoclonal | 1:500 | Abcam **ab24590** | green (via AF488) |
| **α-SMA** | mouse monoclonal | 1:1000 | Sigma **a2547** | green (via AF488) |
| Donkey anti-goat **AF594** | secondary | 1:500 | Thermo A11058 | **red** |
| Donkey anti-mouse **AF488** | secondary | 1:500 | Thermo A21202 | **green** |
| **Nissl 500/525** | — | 1:1000 | Thermo N21480 | green |
| **Phalloidin 488** | — | 1:500 | Thermo A12379 | green |
| **Phalloidin 647** | — | 1:500 | Thermo A22287 | far-red |
| **DAPI** | — | 1:50,000 | Thermo D3571 | blue |

**What each marker actually labels:**
- **gP-CD31 (red) — the whole capillary network.** Endothelial cells; labels the branching mesh
  extensively in *both* healthy and ischemic tissue. **← the channel to segment.**
- **mM-CD31 (green)** — capillaries **only in the ischemic region** (co-localizes with gP-CD31 there);
  sparse/absent in normal, penumbra, contralateral. Poor general vessel marker.
- **Phalloidin (green/far-red)** — F-actin on the **wall of larger cortical *penetrating arteries***;
  barely labels capillaries.
- **α-SMA (green)** — smooth muscle on **penetrating-artery walls**, as a disconnected outer layer;
  sparse on capillaries.
- **Nissl (green) / DAPI (blue)** — neurons / nuclei; context and non-vessel exclusion, not vessels.

---

## 5. Imaging parameters (the numbers a pipeline needs) ⭐

- **Two microscopes:**
  - *Panoramic slice scanner* (Olympus **VS120**) — whole-section overview (the big coronal montages,
    panel A of Figs 1–3).
  - *Laser confocal* (Olympus **FV1200**) — the vessel detail fields:
    - **10× field = 1260 × 1260 µm** @ **1024 × 1024 px** (pinhole 152 µm) → **≈ 1.23 µm/px**.
    - **40× field = 310 × 310 µm** @ **640 × 640 px** (pinhole 105 µm) → **≈ 0.48 µm/px**;
      **Z-stack ≈ 40 images @ 2 µm/step** (input to the 3-D reconstructions).
- **Scale bars** (to calibrate a cropped panel): 2 mm (A), 200 µm (B / overview col), **50 µm** (the
  `…1/…2/…3` detail panels — our targets), 40 µm / 20 µm (3-D panels).
- **3-D reconstruction:** **Imaris 7.7.1** (blend mode; only brightness/contrast adjusted — *no data
  removed*). Cosmetic post: Photoshop CS6 / Illustrator CC 2019.
- ⚠️ **Caveat for us:** the extracted panels are **figure-resolution PNGs** (~300–380 px per 50-µm
  panel ≈ 0.15 µm/px *as printed*, i.e. downsampled from the raw confocal), not the original .oib
  data. Good enough to prototype a detection/skeletonization pipeline and to eyeball morphology;
  absolute length numbers should ultimately be recomputed on raw data with the µm/px above.

## 6. How the authors quantified (baseline for our metrics) ⭐

All in **ImageJ (Fiji)** unless noted:
- **Mean labeling intensity** of each marker (gP-CD31, mM-CD31, phalloidin, α-SMA) — from three 10×
  images per rat, every 12th section.
- **Percentage / area fraction** of gP-CD31, Nissl, phalloidin, α-SMA labeling (pixels above
  threshold) — the closest thing to "vessel density" in the paper.
- **Hemisphere area** (ischemic vs contralateral) via the slice-scanner's own analysis system.
- **Stats:** n = 4 rats/group, **12 fields per region**; mean ± SEM; two-tailed t-test / one-way
  ANOVA + Tukey; **P < 0.05** significant. GraphPad Prism 8.2.1.

---

## 7. Results (per section)

1. **Regional gP-CD31 + Nissl mapping (Figs 1–3).** In healthy brain, gP-CD31 vessels thread through
   Nissl-stained neurons forming the cortical network. In I/R brain, the **ischemic hemisphere is
   enlarged (edema, P<0.05)**; **gP-CD31 is more strongly expressed on ischemic-area capillaries in
   parallel with neuronal loss** — clearest in the 3-D views (Fig 3 B4–D4 / B5–D5). Quantified in
   Fig 3E–G: gP-CD31 intensity **and** area-% peak in the ischemic area; Nissl-% drops there.
2. **gP-CD31 vs mM-CD31 (Fig 4).** mM-CD31 labels capillaries **only in the ischemic area** (where it
   co-exists with gP-CD31); much less in normal/penumbra/contralateral (P<0.05, Fig 4E). gP-CD31 labels
   vessels everywhere. → gP-CD31 is the more sensitive/complete marker.
3. **gP-CD31 vs phalloidin (Fig 5).** Phalloidin marks **penetrating-artery walls**, rarely
   capillaries; gP-CD31 sits on the **lumen side**, wrapped by phalloidin. Phalloidin area/intensity
   larger in the ischemic region (P<0.05).
4. **gP-CD31 vs α-SMA (Fig 6).** α-SMA forms a **disconnected layer around** gP-CD31 on artery walls,
   sparse on capillaries; more/stronger in ischemic area (P<0.05).
5. **3-D spatial correlation (Fig 7).** Along penetrating arteries and capillaries, gP-CD31
   (endothelium, lumen side) is **surrounded by** phalloidin and α-SMA on artery walls, but the three
   are **largely independent in capillaries**; phalloidin and α-SMA rarely co-localize.

**Net ordering across the vessel wall (3-D):** lumen → **gP-CD31 (endothelium)** → **phalloidin** →
**α-SMA (smooth muscle)**, on penetrating arteries; capillaries are gP-CD31-dominated.

---

## 8. Discussion — the key ideas

- **Technological consideration.** Combining a panoramic slice scanner (whole-section 2-D context) with
  confocal Z-stacks (3-D detail) on **thick (80 µm) sections** lets you follow vessels from 2-D to 3-D.
  Nissl (vs the usual TTC) shows both the ischemic area *and* cellular-level change.
- **Monoclonal vs polyclonal — why gP-CD31 wins.** Monoclonal Ab = single epitope, high specificity but
  fragile if that epitope is masked; **polyclonal Ab recognizes multiple epitopes / orientations**, is
  more robust across pH/salt, and here detects far more of the vasculature. gP-CD31 immunogen: mouse
  CD31/PECAM-1 (Glu18-Lys590, ~130 kDa, Accession Q08481). mM-CD31 (~130 kDa) concentrates at
  endothelial-cell borders — hence sparser, mainly lit up in ischemia. Underlying mechanism of the
  difference remains unknown.
- **Three markers = three vascular-cell layers.** gP-CD31 (endothelium, first responder to
  cerebrovascular insufficiency) + phalloidin + α-SMA together resolve **sub-types of vascular cells
  from penetrating arteries down to capillaries**, in health and disease.
- **Potential application / open questions.** Elevated gP-CD31 in ischemia may reflect endothelial
  proliferation, migration, capillary formation, permeability, or **angiogenesis** (neural-repair
  process; endothelial proliferation begins ~12 h post-stroke, lasts weeks). Higher permeability →
  edema → parenchymal lesions. Whether raised gP-CD31 is detrimental or beneficial is unresolved.
- **Limitations.** Single time-point (24 h) I/R snapshot; temporal dynamics of endothelial
  proliferation not studied.
- **Conclusion.** gP-CD31 is more sensitive than mM-CD31 for vessel labeling in healthy *and* injured
  rat brain, and is an ideal marker — alone or with neural/glial markers — for revealing the vascular
  network / neurovascular unit under physiological and pathological conditions.

---

## 9. Extracted images

### 9a. Full figures — `figures/`
Native-resolution (300 ppi) embedded figure images pulled from the PDF.

| File | Fig | Content |
|---|---|---|
| `fig1_gP-CD31_Nissl_healthy.png` | 1 | Healthy brain: coronal montage (A) → cortex (B) → detail (C); **C1 = red vessels only**, C2 Nissl, C3/C4 3-D. Cleanest vessel example. |
| `fig2_ischemia_regional.png` | 2 | I/R regional change: serial montages + hemisphere-area bar chart (ischemic hemisphere enlarged by edema). |
| `fig3_gP-CD31_Nissl_ischemic.png` | 3 | Ischemic brain, 3 regions (B core / C penumbra / D contralateral). **B2,C2,D2 = red vessels**; col1 overlay, col3 Nissl, col4/5 3-D; E–G bar charts. |
| `fig4_gP-CD31_vs_mM-CD31.png` | 4 | gP-CD31 (red) vs mM-CD31 (green), 4 regions A–D. **A2–D2 = red vessels**; col3 mM-CD31; col4 3-D; E bar chart. |
| `fig5_gP-CD31_vs_phalloidin.png` | 5 | gP-CD31 (red) vs phalloidin (green, artery walls); same layout. |
| `fig6_gP-CD31_vs_aSMA.png` | 6 | gP-CD31 (red) vs α-SMA (green, artery walls); same layout. |
| `fig7_spatial_correlation_3D.png` | 7 | 3-D spatial relationship of gP-CD31 / phalloidin / α-SMA along & across a penetrating artery. |

### 9b. Individual panels — `figures/panels/`  (94 files)
Every sub-panel cropped out and named `figN_<region>_<channel>.png`. **The 16 isolated red-channel
vessel images — our working dataset — are prefixed `VESSEL_`:**

- `VESSEL_fig1_C1_healthy_gP-CD31_red.png` — healthy (1 image)
- `VESSEL_fig3_{ischemic,penumbra,contralateral}_gP-CD31_red.png` — ischemic brain (3)
- `VESSEL_fig4_{normal,ischemic,penumbra,contralateral}_gP-CD31_red.png` — gP-CD31 vs mM-CD31 set (4)
- `VESSEL_fig5_{normal,ischemic,penumbra,contralateral}_gP-CD31_red.png` — gP-CD31 vs phalloidin set (4)
- `VESSEL_fig6_{normal,ischemic,penumbra,contralateral}_gP-CD31_red.png` — gP-CD31 vs α-SMA set (4)

Companion channels for each field are also cropped (merge / Nissl / mM-CD31 / phalloidin / α-SMA /
3-D / overview) — useful as ground-truth context or for excluding non-vessel signal. See
[`figures/panels/README.md`](figures/panels/README.md) for the full inventory and the crop method.

**Panel-naming convention** (Figs 3–6): row letter = **region**, column number = **channel/view** —
`1` merged overlay, **`2` gP-CD31 red (vessels)**, `3` the second marker, `4`(/`5`) 3-D reconstruction.
