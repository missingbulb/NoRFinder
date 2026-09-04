# Literature review — index and status

Initial literature review for the Node of Ranvier detection project. Tracked in
[#5](https://github.com/missingbulb/NoRFinder/issues/5).

The scope was deliberately narrow: enough to (a) understand the problem domain, (b) pin down the
measurement the project is automating, and (c) find out whether anyone has already built the
detector. It is **not** a systematic review of node-of-Ranvier biology.

## The notes

| Document | What it answers |
|---|---|
| [`node-biology.md`](node-biology.md) | What Caspr and Na<sub>v</sub>1.6 label, why the Caspr–Nav–Caspr triplet rule is sound rather than heuristic, and what injury does to nodes |
| [`arancibia-carcamo-2017.md`](arancibia-carcamo-2017.md) | The reference implementation of the plot-profile method, its acquisition parameters, and the sanity-check values our output must resemble |
| [`measurement-definitions.md`](measurement-definitions.md) | That "node length" has at least three competing definitions in the literature, how they diverge, and which one to adopt — **carries an open question for the owner** |
| [`prior-art-detection.md`](prior-art-detection.md) | What tooling exists (little), what the real baseline is (manual ImageJ), and the one transferable idea |

The overview document itself is ingested at [`../project-brief.md`](../project-brief.md).

## Sources read in full

| Source | Access | Used for |
|---|---|---|
| Arancibia-Cárcamo, Ford, Cossell, Ishida, Tohyama & Attwell (2017). *Node of Ranvier length as a potential regulator of myelinated axon conduction speed.* eLife 6:e23329. [DOI](https://doi.org/10.7554/eLife.23329) | Open access (CC-BY), publisher PDF | The method, the acquisition spec, every sanity-check number |
| Rasband & Peles (2016). *The Nodes of Ranvier: Molecular Assembly and Maintenance.* Cold Spring Harb Perspect Biol 8:a020495. [PMC4772103](https://pmc.ncbi.nlm.nih.gov/articles/PMC4772103/) | Open access via PMC | Domain architecture, marker identity, assembly order, pathology |

## Findings that changed how we will build this

Four things the review turned up that were not evident from the overview alone:

1. **The MVP has no reference implementation.** The paper the overview leans on measured
   *hand-selected* nodes; it contains no detection step whatsoever. §5.1 is genuinely new work, and
   §5.2/5.3 are the parts with a validated precedent.
2. **"Node length" is ambiguous, and the overview's own figure uses a different definition from the
   paper it reproduces.** A global threshold vs a per-paranode half-maximum give different numbers
   with a brightness-dependent bias. This needs an owner decision before any number is recorded —
   [`measurement-definitions.md`](measurement-definitions.md).
3. **The 1–2 µm ± 0.5 plausibility window is narrower than reality.** Cortical nodes span
   0.43–3.72 µm. A hard filter at 0.5–2.5 µm would discard real nodes at both tails, and would also
   bake the answer into the question for a project whose output *is* the length distribution.
4. **Injury changes exactly what the rules exclude.** Node elongation, void nodes (Caspr pair, no
   Nav) and heminodes all increase after injury. A detector requiring a Nav blob cannot distinguish
   node loss from Na<sub>v</sub>1.6 signal loss, and the excluded categories vary with experimental
   group — so they should be counted and reported separately rather than dropped.

## Sources we could not reach

Requested from the owner in **[#6](https://github.com/missingbulb/NoRFinder/issues/6)**, with a
queued follow-up to ingest them once supplied. Nothing in the notes above depends on them; they
would deepen §4 (pathology) and the prior-art picture, and one of them is the source of a
definition we currently know only second-hand.

Each was blocked by a publisher `403`, per policy not retried and not routed around.

## Not yet attempted

Deliberately out of scope for this first pass, listed so the boundary is unambiguous:

- Blob/spot detection method literature (LoG, DoG, wavelet spot detection) — standard technique, to
  be read when prototyping rather than reviewed up front.
- Colocalization statistics literature — probably not applicable, since the project's rule is
  explicitly *anti*-colocalization (the three regions are adjacent, not overlapping).
- Conduction-velocity modelling — relevant to why node length matters, not to measuring it.
- Corpus-callosum-specific node morphometry — searched incidentally, no per-region reference value
  found; this remains a gap, and means we currently have **no published node-length target for the
  tissue in the owner's example image**.
