# Domain primer — what the two stains mean and why the triplet rule works

Enough Node of Ranvier biology to reason about the detection rules, no more. Written for someone
building the detector, not for a neuroscientist.

Principal source: **Rasband & Peles 2016**, *The Nodes of Ranvier: Molecular Assembly and
Maintenance*, Cold Spring Harbor Perspectives in Biology 8:a020495,
[PMC4772103](https://pmc.ncbi.nlm.nih.gov/articles/PMC4772103/) — full text read. Points sourced
elsewhere are attributed inline.

The same authors' newer review — **Rasband & Peles 2021**, *Mechanisms of node of Ranvier assembly*,
Nat Rev Neurosci 22:7–20 — was also read in full and **supersedes nothing here**. It is a mechanism
review: no node dimensions, no methodology, nothing algorithmically relevant. Its one contribution
to this file is §4's opening — that node length varies, is predicted to strongly influence
propagation, and that *"how these morphological properties of nodes are regulated remains
unknown"*, with perinodal astrocytes a candidate regulator of the distance between flanking
paranodes. Do not re-read it for this project.

---

## 1. The four domains along a myelinated axon

Running outward from a node, a myelinated axon is divided into repeating domains:

**node** — **paranodal junction (PNJ)** — **juxtaparanode (JXP)** — **internode** — (mirror image)

- **Node**: the gap between two myelin segments. Densely packed with voltage-gated Na⁺ channels;
  this is where the action potential is regenerated. In the CNS the nodal gap is filled with
  charged extracellular matrix and contacted by perinodal astrocyte or OPC processes (in the PNS,
  by Schwann cell microvilli).
- **Paranodal junction**: where the myelin lamellae split into cytoplasmic loops that spiral onto
  the axon, separated from it by only 2.5–3 nm — the largest known vertebrate intercellular
  junction. It attaches the sheath to the axon, insulates nodal from internodal membrane, and acts
  as a **diffusion barrier** limiting lateral movement of axonal membrane proteins.
- **Juxtaparanode**: beneath the compact myelin just past the paranode; Kv1 K⁺ channel clusters.
  **Not stained in this project** — but worth knowing it exists, because it is the next thing along
  the same axis and a marker that bled into it would break the geometry.
- **Internode**: the long stretch under the sheath.

The domains are strictly ordered along the axon. **That ordering is what makes the project's
geometric rule sound**: Caspr–Nav–Caspr collinearity is not a heuristic about how the picture tends
to look, it is a direct read-out of an obligate molecular architecture.

## 2. What each channel actually labels

### Caspr (contactin-associated protein) → the paranodes

Caspr is an **axonal** transmembrane protein of the paranodal junction, part of a heterotrimeric
adhesion complex: glial **neurofascin-155** binding an axonal complex of GPI-anchored **contactin**
and **Caspr**. It is essential for forming the septate-like paranodal junction.

Consequences for detection:

- Caspr labels **two** regions per node, one on each side, and they are elongated *along the axon*
  (the paranode is a tapering cylinder, not a point). Expect anisotropic blobs whose long axis
  **is the axon direction** — a free orientation estimate per blob.
- Caspr also appears at every *other* node along the same axon and along adjacent axons, so a
  field is full of Caspr blobs that are correctly paired with something other than the node you
  are looking at. In the PNS, Caspr additionally follows the inner-mesaxon line along the
  internode; in the CNS it does not (no juxtamesaxonal organization) — relevant only if PNS tissue
  ever enters scope.
- A Caspr blob is not a node marker by itself. **Any Caspr-only pairing rule will over-count.**

### Na<sub>v</sub>1.6 → the node itself, and specifically a *mature* node

Nodes are not uniform in channel composition: Na<sub>v</sub>1.1, 1.2, 1.6, 1.7, 1.8 and 1.9 all
occur at nodes depending on tissue and stage. **Na<sub>v</sub>1.6 is the marker of a *mature*
node** — during development Na<sub>v</sub>1.2 appears first and is replaced by Na<sub>v</sub>1.6
(Boiko et al. 2001; Kaplan et al. 2001, as cited by Arancibia-Cárcamo et al. 2017, which relies on
exactly this to exclude developing nodes).

Consequences for detection:

- The requirement for a Nav blob between the Caspr pair is not just a geometric confirmation, it
  **silently restricts the count to mature nodes**. Anything the pipeline reports is a count of
  mature nodes, and that qualifier belongs on the number.
- **Heminodes** — a Nav cluster with a paranode on one side only — are a real, biologically
  meaningful structure, not noise. They appear during myelination and after injury. The project's
  rule 1 (*two* Caspr regions) excludes them by construction. Whether the owner wants them counted
  separately is an open question, not something to decide silently.

## 3. Assembly order — why the node is bounded by paranodes at all

Two cooperating extrinsic mechanisms cluster Na⁺ channels, giving reciprocal backup:

1. **Active clustering at heminodes**, via glial gliomedin and NrCAM binding axonal NF186, which
   recruits ankyrin-G, then βIV spectrin, then the Na⁺ channels.
2. **Restriction to the nodal gap** by the paranodal junction acting as a barrier — this depends on
   the paranodal submembranous cytoskeleton (4.1B, αII/βII spectrin), not merely on the adhesion
   molecules or the transverse bands.

In the CNS, Na⁺ channel clustering **follows** paranode formation. As myelin segments grow, two
neighbouring Nav clusters converge until they fuse into one new node.

The practical point: the Nav signal is *positioned by* the paranodes. A Nav blob that is not
bracketed by paranodes is either a heminode, a developing cluster, or disrupted — which is exactly
why the project's triplet rule is the right primitive and a Nav-only blob count would be wrong.

## 4. What pathology does — the reason the project exists

- Loss of the paranodal junction (Caspr-null, NF155-null, galactolipid-null mice) leaves nodes
  **gradually larger and more irregular in shape** — the Na⁺ channel cluster is still made but is
  no longer confined.
- Autoantibodies against nodal adhesion molecules (Guillain–Barré, CIDP, multiple sclerosis) cause
  nodal disorganization, **binary nodes**, **lengthening of the nodal gap**, and reduced conduction.
- After concussion / traumatic axonal injury: widespread loss of Na<sub>v</sub>1.6, **progressive
  increases in node length**, appearance of **void nodes and heminodes**, and loss or paranodal
  diffusion of βIV-spectrin, ankyrin-G and NF186 — Song et al., *Acta Neuropathologica* 2022, in
  swine periventricular white matter, the closest published tissue to the owner's corpus callosum
  images ([`song-2022-concussion.md`](song-2022-concussion.md)):

  | Group | Node length | % void nodes | % heminodes |
  |---|---|---|---|
  | Sham | ~1.05 µm | ~0.2 | ~3.2 |
  | 6 h | ~1.55 µm | ~0.55 | ~7.2 |
  | 72 h | ~1.5 µm | ~1.4 | ~7.0 |
  | 2 weeks | ~1.15 µm | ~1.7 | ~6.1 |

  *Read off the paper's scatter plots — it states none of these numerically. Each point is one
  animal (n = 3–4 per group), and the node-length definition is an undefined "gap size"
  ([`measurement-definitions.md`](measurement-definitions.md) definition C), so these are
  plausibility anchors rather than targets. Node length is **not monotonic in time** — it rises by
  6–72 h and falls back toward baseline at 2 weeks.*

- In human polyneuropathy, paranodal Caspr-1 is **severely elongated** and partly detached from its
  β2-spectrin anchor: nodo-paranodal length rises from 12.4 µm (chronic axonal) to 15.6 µm (acute
  axonal, p = 0.002), and to 16.8 µm where axonal loss is histopathologically severe
  ([`appeltshauser-2022-polyneuropathy.md`](appeltshauser-2022-polyneuropathy.md)). The elongation
  shows up in the **paranodes**, not only in the gap — so a detector whose Caspr blob model assumes
  a healthy size or shape range is exposed here too, not just its length filter.

Four consequences that bear directly on the algorithm, and that argue against tuning it on healthy
tissue alone:

1. **Node elongation is the signal being measured.** A detector whose length filter is tuned to
   healthy nodes will systematically reject the injured ones — i.e. it will be blindest precisely
   in the condition the study is about.
2. **Void nodes** (paranodes present, Na<sub>v</sub>1.6 lost) fail rule 2 and vanish from the count.
   A "reduced number of nodes" result could therefore be genuine node loss *or* Na<sub>v</sub>1.6
   signal loss at intact nodes, and the two are indistinguishable to a Nav-requiring detector.
   Counting Caspr pairs *without* a Nav partner, as a separate reported category, is the cheap way
   to tell them apart, and is worth proposing to the owner.
3. **Heminodes increase after injury**, so the population the rules exclude is itself
   condition-dependent — an excluded category whose size varies with the experimental group is a
   bias, not a constant offset. Concretely: ~3.2% of nodes in sham, rising to ~7% after injury, and
   void nodes rising ~8-fold from ~0.2% to ~1.7%. **Together the excluded categories move by about
   5 percentage points between conditions** — the same order as many effects a study of this kind
   is trying to detect.
4. **A detector tuned on healthy tissue degrades unpredictably on diseased tissue** — measured, not
   speculated. Appeltshauser et al.'s automated node count ran at 97 ± 11% accuracy on healthy
   murine nerve and collapsed to a median ~85% with a 15–185% spread on pathologically altered
   human samples ([`appeltshauser-2022-polyneuropathy.md`](appeltshauser-2022-polyneuropathy.md)
   §2). Any accuracy we report on control images is an upper bound that says nothing about the
   injury condition.

## 5. Terms, quickly

| Term | Meaning here |
|---|---|
| Node of Ranvier | Myelin gap; Na⁺ channel cluster; the thing being counted |
| Paranode / PNJ | Caspr⁺ region flanking the node on each side |
| Juxtaparanode | Kv1⁺ region past the paranode; unstained here |
| Internode | Myelinated stretch between nodes |
| Heminode | Nav cluster with a paranode on one side only |
| Binary node | Pathological doubled/split node |
| Void node | Paranodes intact, nodal Na⁺ channel signal absent |
| Nodal gap | The node's axial extent — what "node length" measures |
| CNS / PNS | Oligodendrocyte- vs Schwann-cell-myelinated; this project is CNS (corpus callosum) |
