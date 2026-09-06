# Song et al. 2022 — Concussion leads to widespread axonal sodium channel loss and disruption of the node of Ranvier

*Acta Neuropathol 144(5):967–985 · DOI [10.1007/s00401-022-02498-1](https://doi.org/10.1007/s00401-022-02498-1) ·
[PMID 36107227](https://pubmed.ncbi.nlm.nih.gov/36107227/) · read from the NIH author manuscript
(PMC, 33 pages) supplied by the owner.*

> **Attribution correction.** The first pass of this review cited this paper as "Reeves et al.",
> taken from a web-search summary. **The authors are Song, McEwan, Ameen-Ali, Tomasevich,
> Kennedy-Dietrich, Palma, Arroyo, Dolle, Johnson, Stewart & Smith.** Issue
> [#6](https://github.com/missingbulb/NoRFinder/issues/6) carries the wrong name; the citation
> here is the correct one.

**Why it matters to us:** it is the closest published tissue to ours — **periventricular white
matter at the lateral ventricle / corpus callosum junction**, Caspr + Na<sub>v</sub>1.6, confocal,
maximum-intensity projection — and it is the source of every quantitative claim in
[`node-biology.md`](node-biology.md) §4 about what injury does to nodes.

---

## 1. Claim

In a swine model of concussion, over two weeks post-injury: widespread loss of Na<sub>v</sub>1.6,
**progressive increases in node length**, appearance of **void nodes** and **heminodes**, and loss
or paranodal diffusion of βIV-spectrin, ankyrin-G and neurofascin-186. The changes sit close to,
but distinct from, APP-immunoreactive swollen axonal profiles — a distinct phenotype of diffuse
axonal injury. Similar changes were confirmed in post-mortem human brain after acute TBI.

## 2. The numbers (Figure 3)

**These are read off the figure's scatter plots** — the paper states none of them numerically in
the text, and the underlying values live in Supplemental Table 2, which is not in the supplied
manuscript. Treat them as approximate to roughly ±0.05 µm / ±0.2 percentage points.

Each point is **one animal** (n = 3–4 per group), not one node, so the visible scatter is
between-animal variance, not the node-length distribution.

| Group | Node length (µm) | % void nodes | % heminodes |
|---|---|---|---|
| Sham | ~1.05 | ~0.2 | ~3.2 |
| 6 h | ~1.55 | ~0.55 | ~7.2 * |
| 72 h | ~1.5 *** | ~1.4 ** | ~7.0 ** |
| 2 weeks | ~1.15 | ~1.7 ** | ~6.1 * |

*Significance as marked in the figure, against sham. Note the oddity that 6 h has the highest mean
node length but no asterisk, while 72 h is `***` — consistent with much tighter between-animal
spread at 72 h.*

### What these numbers buy us

- **A sham node length of ~1.05 µm in periventricular white matter** is the closest thing we have
  to a reference value for the owner's corpus callosum images — much closer in tissue than the
  optic nerve (1.02 µm) or cortex (1.50 µm) figures in
  [`arancibia-carcamo-2017.md`](arancibia-carcamo-2017.md). It is, encouragingly, almost identical
  to the optic nerve value. **Caveat: swine, not rat, and a different length definition** (§3
  below) — so it is a plausibility anchor, not a target.
- **Heminodes are ~3% of nodes even in healthy tissue**, and roughly double after injury. Void
  nodes go from ~0.2% to ~1.7% — an **eight-fold** change on a small base. Both categories are
  excluded by the project's detection rules, and both vary strongly with condition. This is the
  hard number behind the warning in [`node-biology.md`](node-biology.md) §4: the excluded fraction
  is condition-dependent, so dropping it silently biases a group comparison.
- **Node length is not monotonic in time** — it rises by 6–72 h and falls back toward baseline at
  2 weeks. A study design that measures only one late timepoint would miss the effect.

## 3. Node length definition — underspecified, and *not* what the first pass recorded

> **Correction.** The first pass of this review recorded this paper's definition as *"the distance
> between the inner edges of the Caspr-positive paranodal regions"*, sourced from a web-search
> summary. **That phrasing does not appear in the paper.** The summary was a paraphrase, not a
> quotation, and it attributed more precision to the source than the source has.

What the paper actually says, in full:

- Methods: *"Caspr staining labeled septate-like paranodal space, and therefore used for measuring
  NOR length and characterizing NOR morphologies"* — measured **using ImageJ**.
- Figure 3g axis: **"Node Length (µm)"**.
- Figure 3g legend: *"Significant elevations of node lengths **(gap size)** were identified at 72
  hrs post injury."*
- *"Detailed measurements were included as Supplemental Table 2"* — not in the supplied manuscript.

So the definition is **the gap between the paired Caspr domains, measured by hand in ImageJ**, with
**no stated threshold, edge criterion, or profile method**. It is a gap-family definition (the same
family as Appeltshauser et al.), but this paper does not operationalise it. Recorded as such in
[`measurement-definitions.md`](measurement-definitions.md).

## 4. Morphology definitions — these *are* precise, and directly usable

Stated cleanly enough to implement:

- **Void node** — *"paired Caspr domain in the absence of Na<sub>v</sub>1.6 expression"*; the
  figure legend adds *"complete loss of Nav1.6 with normal Caspr labeling paranodal space."*
- **Heminode** — *"unpaired Caspr domain"*; legend: *"loss of Caspr immunoreactivity on one side of
  NOR, with normal or reduced Nav1.6 expression."*
- Percentages are computed by dividing by **the total number of NOR observed**.

These map exactly onto the two categories the project's rules exclude, and give us the vocabulary
and the denominator to report them in.

## 5. The number that should set our accuracy expectations

> **Two blinded investigators scoring these images independently reached an ICC of 0.73.**

That is *good* inter-rater reliability by convention, and it is also a sobering ceiling: on this
exact task — dense white-matter fields, Caspr + Nav1.6, counting and classifying nodes — two
trained humans agree only moderately. Any automated method should be evaluated against that
spread rather than against an assumption that the manual count is exact, and a pipeline that
disagrees with one annotator by less than the annotators disagree with each other has essentially
matched the human baseline.

## 6. Acquisition parameters

- **Analysis imaging:** Leica SP5 confocal, **63× oil, NA 1.40**, numerical zoom 2. Stacks of
  **10 z-series, z-step 0.22 µm**, final area **0.0445 mm²**. Laser lines 488 / 561 / 633.
  **Pinhole 1 Airy unit for the Caspr signal** — the same choice as Arancibia-Cárcamo et al.
  A **maximum intensity projection** was generated.
- **Figures / 3D only:** Zeiss LSM 880 with Airyscan, 63× / NA 1.40, no pinhole (area detector).
  Surfaces reconstructed in **Imaris v9.7.2**.
- **Antibodies:** Na<sub>v</sub>1.6 (Alomone ASC-009, 1:200 swine / 1:100 human) — the same
  supplier as the eLife paper; Caspr (Waxman lab, anti-rat p190/Caspr cytoplasmic domain, 1:2000
  swine / 1:200 human). Alexa Fluor 488/568/647 secondaries at 1:250.
- **Colour convention in the figures: Caspr red, Na<sub>v</sub>1.6 cyan** — a *third* mapping,
  different again from both the owner's (Caspr green / Nav red) and the eLife paper's (Caspr red /
  Nav green). Three sources, three conventions. Nothing may key on colour.
- **Sampling:** 2–4 non-overlapping ROIs per animal, ~0.14 mm² total surveyed, in posterior
  hippocampal sections at the lateral ventricle / corpus callosum junction and the lateral
  ventricle / temporal lobe intersection. ROIs were **selected for the presence of co-existing
  APP-immunoreactive axons** — a deliberate, non-random sampling bias worth knowing about.
- Human tissue additionally treated with TrueBlack to quench lipofuscin autofluorescence.

## 7. Gaps — what this paper does not state

- **Any operational node-length rule** (§3). The single largest gap.
- **Pixel size.** The 0.0445 mm² area implies a ~211 µm field side, but the frame dimensions in
  pixels are never given, so µm/px cannot be derived.
- **Absolute node counts** — only percentages and per-animal means; the denominator ("total number
  of NOR observed") is never stated numerically.
- **Any node-length value as a number**, anywhere in the text (§2).
- Whether node length was measured on the projection or in 3D, and whether tilted axons were
  excluded — no analogue of the eLife "parallel to the plane of section" criterion is described.
- How Na<sub>v</sub>1.6 "absence" was thresholded when classifying a void node.

## 8. Deliberately omitted

Cross-checked against the full manuscript. Not summarised: the swine rotational-acceleration
injury model and its biomechanics, the APP immunohistochemistry protocol and DAI quantification,
the βIV-spectrin / ankyrin-G / neurofascin-186 diffusion results (Figs 4–6) beyond their existence,
the human post-mortem cohort's clinical characteristics (Fig 7), the sodium-channelopathy
discussion, and the statistical detail beyond the ICC. None of it bears on detection or
measurement.
