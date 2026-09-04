# Requirements the implementation must satisfy

Standing constraints on *how* the pipeline is built, as distinct from
[`project-brief.md`](project-brief.md), which is what it must do. Each is stated so it can become
a test.

---

## R1 — The pipeline carries no absolute pixel constants

**Every decision rule is expressed in quantities the image measures for itself**, never in pixels
and never in µm. A rule may say "the gap is between 0.3× and 3× the mean paranode length"; it may
not say "the gap is between 8 and 40 pixels" or "between 0.5 and 2.5 µm".

Where a constant is genuinely tied to the sensor rather than to the biology — a denoising radius
matched to the point spread function, say — it is **isolated and labelled** as scale-dependent, so
it is the first thing revisited on new-scale data.

**This is not extra work; it removes work.** Detection needs no physical units at all:

| Spec rule | What it actually needs |
|---|---|
| §4.3.1 two distinct Caspr regions | Blob detection — no units |
| §4.3.2 Nav between them | Ordering along an axis — no units |
| §4.3.3 all three collinear | Angles — dimensionless |
| §4.3.4 gap in a plausible range | **The only rule with a µm number** |

Rule 4 is the one to re-express, and re-expressing it is an improvement on its own terms: a µm
window on node length is a window on **the very quantity the project exists to measure**, so a hard
filter would make the reported distribution partly an artefact of the filter. Stating it as a ratio
to the paranodes flanking that same node removes both problems at once — the units and the circular
prior. Same for §4.2's "close to horizontal", which is an angle and was never a length.

**Consequence:** R1 and R2 are the same requirement seen twice. An algorithm with no absolute
constants is scale-free by construction; there is nothing left in it for a change of scale to break.

## R2 — Detection is invariant to rescaling, rotation and reflection of the input

Running the detector on a transformed image and mapping the results back through the inverse
transform must agree with running it on the original.

**"Agree" means the same nodes, not the same numbers.** A 2× image yields 2× the pixel lengths, and
that is correct. What must match is the *set of detected nodes*, their correspondence, and any
length expressed in physical units or as a ratio.

Three tiers, because they are not equally achievable and pretending otherwise would be dishonest:

### Tier 1 — exact, no tolerance

Transpose, horizontal and vertical flip, and 90/180/270° rotation. These are pixel permutations:
no interpolation, no information lost. **The detection set must be identical after inverse
mapping**, and this is a cheap, strong test that should never be allowed to go amber.

Things that silently break Tier 1, worth watching for: structuring elements that are not
symmetric, filters whose application order differs per axis, and any tie-break that depends on
raster scan order.

*Transpose is a reflection, so it flips handedness.* Our rules survive that because they are
chirality-free — collinearity and betweenness have no left or right. **Any future rule that uses a
signed angle or a sense of rotation would break transpose invariance**, and that is a reason to
reject such a rule rather than to weaken this tier.

### Tier 2 — within a stated tolerance

Arbitrary rotation (34°, the owner's example) and rescaling within the operating range. These
resample, so they blur, shift sub-pixel, and — for rotation — move content across the frame
boundary. Detections must match within a tolerance **expressed as a fraction of paranode length**,
not in pixels, or the tolerance itself violates R1.

The test must pad before rotating, or compare only over the region common to both, so that content
rotated out of frame is not scored as a miss.

### Tier 3 — measured, not asserted

**The scale range over which Tier 2 holds is a measurement, not a promise.**

Downscaling destroys information, and at some point the node gap stops existing in the data. Real
acquisitions put roughly 12–20 pixels across a node gap — 19 px at Arancibia-Cárcamo et al.'s
52.7 nm/px, ~12 px at Appeltshauser et al.'s 75 nm/px, for a ~1 µm node. Halve that once and it is
6–10 px; halve it again and two peaks either side of a gap have ~4 px to live in, which the point
spread function has already smeared together. **No algorithm recovers a gap that is no longer in
the image.**

So the deliverable is a **scale-response curve** — detection count, precision and recall swept
across scale — with the breakdown point read off it and published. That is more useful than a
binary claim, and it tells us directly whether a new dataset at a different magnification is inside
the tested envelope or outside it.

**Explicitly out of scope:** anisotropic scaling (different factors in x and y). It changes angles,
so collinearity genuinely changes, and invariance to it would be wrong rather than desirable.
Microscope pixels are square in xy in every acquisition in the literature notes.

### The harness

A transform-invariance harness needs **no ground truth** — it tests the algorithm against itself.
It can therefore be built and run before any annotation exists, and even against a synthetic
Caspr–Nav–Caspr field before real images arrive. Invariance is a property of the algorithm, not of
the data.

That makes it the **first testable thing this project can have**, and one of the few pieces of work
not blocked on the owner. It is not a substitute for accuracy testing: a detector that finds
nothing is perfectly invariant.

## R3 — Physical units enter only at the reporting boundary

The pipeline computes in pixels. **Exactly one place** converts to µm, at output, using a
per-image factor.

That factor is **read from the file's own acquisition metadata, never measured and never assumed**.
Native microscope formats record physical pixel size — CZI, LIF, ND2 and OME-TIFF all carry it —
so this is a field lookup, not a calibration step. *(Which Python reader to use is unverified until
we have a real file in hand; candidates are `bioio`/`aicsimageio`, `readlif`, `czifile`. Do not
commit to one on this note's say-so.)*

It is a **measurement of that input**, not a project constant: never borrowed from a neighbouring
file, never inferred from a stated microscope setting, and living in exactly one place in the code.

**The one thing that would make this hard:** if images arrive as exported PNG or JPEG rather than
native format, the metadata is gone and no µm output is possible — only pixel-space and
dimensionless quantities. An input offering nothing to calibrate from is **not silently dropped**:
it is marked uncalibrated with the reason, reports only its scale-free quantities, and stays
visible as a known gap.

This is one of several reasons to ask for native multi-channel files rather than exports — the
others being the z-stack (which the reference method's horizontality criterion depends on) and
unambiguous channel identity.

## R4 — Node length is reported under several definitions until data chooses one

The literature offers at least five definitions of "node length"
([`literature/measurement-definitions.md`](literature/measurement-definitions.md)), and the project
overview's own figure uses a different one from the paper it reproduces. **The owner has declined
to pick one, correctly — there is no basis to pick yet.**

The question dissolves rather than waits, because **the definitions share almost the entire
pipeline** and differ only in the last step. Detect the node, fit its axis, sample the Caspr
profile, find the two peaks — all common. Then:

- **A** — crossing at 50% of *each peak's own* height
- **B** — crossing at a *single* threshold (50%, 30%) taken from one peak
- **E** — smallest gap between the two segmented Caspr blocks

Computing all of them costs one extra function each over computing one. So: **compute them all,
report them side by side, each labelled.** No number ever appears without its definition.

The choice then becomes empirical rather than a priori: once the owner has hand-measured a handful
of nodes the way they normally would, **whichever definition best reproduces their own
measurements is the project's definition.** The question they actually have to answer is "show me
how you'd measure this one node" — concrete, and something they already know how to do — not
"which definition do you want", which needed expertise nobody has yet.

**The disagreement between definitions is itself useful**, because they fail in known and opposite
directions: E under-reports on a tilted axon while A and B over-report by 1/cos θ off-axis, and B
alone drifts with brightness asymmetry between the two paranodes. A node where all definitions
agree is well-behaved; a node where they diverge is tilted, asymmetric or noisy. **That spread is a
free per-node quality flag**, and it will be reported alongside.

Honest limit: "report all of them" defers the choice, it does not abolish it. One number eventually
goes in a paper. But that call can be made later, with evidence, and it blocks nothing now.

## R5 — Validation covers pathological tissue, not only controls

Confirmed by the owner: the corpus will include many images, with pathologies.

This is not a nicety. The one published automated node count degraded from **97 ± 11% on healthy
tissue to a median ~85% with a 15–185% spread on pathological tissue**
([`literature/prior-art-detection.md`](literature/prior-art-detection.md)), and the group abandoned
it for their real analysis. Concretely, for us:

- **No accuracy figure is reported without saying which tissue it was measured on.** A control-only
  number is an upper bound and says nothing about the condition the study exists to measure.
- **No threshold or plausibility range is tuned on controls alone.** Node elongation *is* the
  signal; a filter fitted to healthy nodes is blindest exactly where it matters.
- **Void nodes and heminodes will be present in quantity** — ~3% heminodes even in sham, roughly
  doubling after injury, and void nodes rising ~8-fold. They are excluded by the spec's rules, and
  the excluded fraction moves with experimental group. Whether to count and report them separately
  is still an open question for the owner, and now a more pressing one.
- **Report precision and recall against matched per-node ground truth**, never a count ratio. The
  published metric above exceeds 100% because it is `automated / manual`, which cannot distinguish
  a correct count from one with matched false positives and false negatives.
