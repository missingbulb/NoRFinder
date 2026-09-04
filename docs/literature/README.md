# Literature review — index and status

Literature review for the Node of Ranvier detection project. Tracked in
[#5](https://github.com/missingbulb/NoRFinder/issues/5); the second pass, ingesting four papers the
owner supplied, in [#8](https://github.com/missingbulb/NoRFinder/issues/8).

The scope is deliberately narrow: enough to (a) understand the problem domain, (b) pin down the
measurement the project is automating, and (c) find out whether anyone has already built the
detector. It is **not** a systematic review of node-of-Ranvier biology.

## The notes

| Document | What it answers |
|---|---|
| [`node-biology.md`](node-biology.md) | What Caspr and Na<sub>v</sub>1.6 label, why the Caspr–Nav–Caspr triplet rule is sound rather than heuristic, and what injury does to nodes — with numbers |
| [`measurement-definitions.md`](measurement-definitions.md) | That "node length" has **five** competing definitions across our sources, how they diverge, every reference value tagged by definition, and which to adopt — **carries an open question for the owner** |
| [`prior-art-detection.md`](prior-art-detection.md) | What has and has not been automated, the two published results that warn us where it breaks, and the baseline to beat |
| [`arancibia-carcamo-2017.md`](arancibia-carcamo-2017.md) | The reference implementation of the plot-profile method, its acquisition parameters, and the sanity-check values |
| [`song-2022-concussion.md`](song-2022-concussion.md) | The closest published tissue to ours; what injury does to node length, void nodes and heminodes; the human inter-rater ceiling |
| [`appeltshauser-2022-polyneuropathy.md`](appeltshauser-2022-polyneuropathy.md) | The only published automated node **count** with an accuracy, and the automated **length** measurement that was tried and abandoned |
| [`linke-2025-dstorm-toolkit.md`](linke-2025-dstorm-toolkit.md) | The deep-learning node segmentation result, and how small its training budget was |

The overview document itself is ingested at [`../project-brief.md`](../project-brief.md).

## Sources read in full

| Source | Access | Used for |
|---|---|---|
| Arancibia-Cárcamo, Ford, Cossell, Ishida, Tohyama & Attwell (2017). *Node of Ranvier length as a potential regulator of myelinated axon conduction speed.* eLife 6:e23329. [DOI](https://doi.org/10.7554/eLife.23329) | Open access (CC-BY), publisher PDF | The method, the acquisition spec, the node-length distributions |
| Rasband & Peles (2016). *The Nodes of Ranvier: Molecular Assembly and Maintenance.* Cold Spring Harb Perspect Biol 8:a020495. [PMC4772103](https://pmc.ncbi.nlm.nih.gov/articles/PMC4772103/) | Open access via PMC | Domain architecture, marker identity, assembly order, pathology |
| Song, McEwan, Ameen-Ali, Tomasevich, Kennedy-Dietrich, Palma, Arroyo, Dolle, Johnson, Stewart & Smith (2022). *Concussion leads to widespread axonal sodium channel loss and disruption of the node of Ranvier.* Acta Neuropathol 144:967–985. [DOI](https://doi.org/10.1007/s00401-022-02498-1) | Owner-supplied (NIH author manuscript) | Pathology numbers, void/heminode definitions, the ICC |
| Appeltshauser, Linke & Heil et al. (2022). *Super-resolution imaging pinpoints ultrastructural changes at the node of Ranvier in patients with polyneuropathy.* medRxiv 2022.08.05.22278366. [DOI](https://doi.org/10.1101/2022.08.05.22278366) | Owner-supplied (CC-BY preprint) | Automated counting accuracy, the gap definition, reference morphometrics |
| Linke, Appeltshauser, Doppler & Heinze (2025). *Deep learning-driven automated high-content dSTORM imaging with a scalable open-source toolkit.* Biophys Rep 5:100201. | Owner-supplied | Deep-learning node segmentation, training-data budget |
| Rasband & Peles (2021). *Mechanisms of node of Ranvier assembly.* Nat Rev Neurosci 22:7–20. [DOI](https://doi.org/10.1038/s41583-020-00406-8) | Owner-supplied | **Nothing algorithmically relevant** — a mechanism review, superseding nothing in `node-biology.md`. Do not re-read it for this project. |

Nothing is now unreachable. [#6](https://github.com/missingbulb/NoRFinder/issues/6) is closed.

## Findings that changed how we will build this

1. **The MVP has no reference implementation.** The paper the overview leans on measured
   *hand-selected* nodes; it contains no detection step. §5.1 is new work.
2. **"Node length" is ambiguous** — five definitions across our sources, and the overview's own
   figure uses a different one from the paper it reproduces. Needs an owner decision before any
   number is recorded — [`measurement-definitions.md`](measurement-definitions.md).
3. **The 1–2 µm ± 0.5 plausibility window is narrower than reality.** Cortical nodes span
   0.43–3.72 µm. A hard filter would discard real nodes at both tails, and bakes the answer into a
   project whose output *is* the length distribution.
4. **Injury changes exactly what the rules exclude** — and by how much is now measured. Void nodes
   and heminodes together shift ~5 percentage points between sham and injured, the same order as
   the effects such a study is trying to detect.
5. **§5.3 is the harder half, not the easier one.** The one group that automated node counting on
   this kind of data tried automating node morphometry and abandoned it as insufficiently accurate.
6. **A detector tuned on healthy tissue degrades unpredictably on diseased tissue** — measured:
   97 ± 11% → median ~85% with a 15–185% spread. Control-only accuracy is an upper bound that says
   nothing about the injury condition.
7. **The human baseline is not perfect, and we can quote it.** Two blinded investigators on this
   exact task agree at ICC 0.73. That, not an assumed ground truth, is what to measure against.

## Corrections made in the second pass

Recorded because they are a lesson about method, not just about content. Two claims resting on
web-search summaries did not survive contact with the sources:

- **Two author attributions were wrong.** "Reeves et al." is **Song et al.**; "Stengel et al." is
  **Appeltshauser, Linke & Heil et al.** Issue
  [#6](https://github.com/missingbulb/NoRFinder/issues/6) carries the wrong names.
- **A definition was invented by paraphrase.** Node-length definition C was recorded as *"the
  distance between the inner edges of the Caspr-positive paranodal regions"*. That phrasing is
  **not in the paper**, which defines nothing beyond "gap size". The summary attributed a precision
  the source does not have.
- **The prior-art negative finding was too strong** — see
  [`prior-art-detection.md`](prior-art-detection.md).

The general lesson, already in the working rules and now with a worked example: a search snippet is
evidence about what a paper is *about*, never a quotation from it, and a definition or a number
taken from one needs the source before it is written down as fact.

## Not yet attempted

Deliberately out of scope, listed so the boundary is unambiguous:

- Blob/spot detection method literature (LoG, DoG, wavelet spot detection) — standard technique, to
  be read when prototyping rather than reviewed up front.
- Colocalization statistics — probably not applicable, since the project's rule is explicitly
  *anti*-colocalization (the three regions are adjacent, not overlapping).
- Conduction-velocity modelling — relevant to why node length matters, not to measuring it.
- **Node detection in dense CNS tissue specifically.** The tooling literature has been searched;
  the CNS myelin-pathology literature has not. This is the most likely place a fifth relevant
  paper is hiding.
- **Corpus-callosum-specific node morphometry.** Still no published per-region value. Song et al.'s
  swine periventricular white matter (~1.05 µm) is the closest substitute we have, and it is a
  different species on an undefined definition.
