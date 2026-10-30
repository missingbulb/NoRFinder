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

## R6 — Raw data lives on Drive, never in git, and is trusted only by checksum

The owner's microscope files sit in Google Drive; the repository carries only
[`studies/nor/data/sources.json`](../data/sources.json), naming each one by Drive id with its SHA-256.
[`studies/nor/detection/fetch_data.py`](../detection/fetch_data.py) downloads what is missing into the git-ignored
`data/raw/` and **refuses a file whose checksum differs from the manifest** — a scan silently
replaced on Drive would otherwise change every downstream number with nothing in the repo
recording why. A checksum is `null` until the first fetch pins it (`--pin`); unknown is never
written as a placeholder value. **A fetch can be limited to a subset** (`--match GLOB` over the file's path under `data/raw/`):
the folder is hundreds of MB, and most work needs only a few planes, so pulling everything each
session wastes minutes and disk. Why Drive rather than git, LFS or a Release:
[`studies/nor/data/README.md`](../data/README.md). Test: `tests/test_fetch_data.py`.

## R7 — What counts as a NoR: the owner's validation criteria

Set by the owner (2026-09-25 to 09-27) while reviewing renders; each is a named check in
[`studies/nor/detection/nor3.py`](../detection/nor3.py) (`CHECKS`, letters A-J, plus K and N in
[`studies/nor/detection/nor_rf.py`](../detection/nor_rf.py)), so every rejected candidate says which rule
removed it.

- **Shape of the object.** A green-red-green triplet between nuclei: a short, thick stick
  ("wand"), the red Nav node between two green Caspr paranodes. It is not round, so outlines
  follow its pixels, never an ellipse.
- **Structure.** Exactly three segments in the order green, red, green; the two greens do not
  touch; the three lie roughly on a line (A, B, C).
- **Colour purity.** At most 20% of a segment's core pixels may be lit in the other colour (the
  owner first said 10%, then relaxed it). The 1-px rim where colours meet is left out, because
  optical blur makes it yellow (D, E).
- **Symmetry.** The two greens are similar in area and in total brightness; the smaller is at
  least a fraction of the larger (currently 1/4) (F, H).
- **Stick.** Length along the green-to-green axis over mean width is at least 3, with no gap along
  its length (G; mostly redundant with the others).
- **Bright, not mushy.** The weakest segment is at least 3.5 robust noise units (1.4826·MAD) above
  the local background median. 3.5 sits at a dip in the score histogram; the textbook 5 drops
  good nodes (I).
- **One pixel belongs to at most one NoR.** Overlaps are resolved strongest first (J).
- **Nuclei are not NoRs.** Blue (DAPI) mask: blur σ=2, above 0.45× Otsu (to catch the dim rim),
  drop blobs under 30 px, fill holes, dilate 2 px. The owner approved it on Slide5 (it covers about
  14% of the image). Since 2026-09-27 it is applied after finding: a candidate fails when at
  least 80% of its red lies on the mask (N).

The thresholds are the owner's or were chosen from data with the owner's consent; changing one is
a question for the owner, shown with the objects that only that check rejects.

## R8 — The NoR Finder page

What a user of the page sees and can do is in the page's one spec,
[`dev/requirements/requirements.md`](../../../dev/requirements/requirements.md): §1 for the shell
it runs in, §3 for this study's own page.

## R9 — No finder change loses quality unless the owner accepts it

Set by the owner on 2026-09-30. Every finder the page offers is scored on every ground-truth image
(R10) spot by spot, and
[`studies/nor/detection/lab/quality_baseline.json`](../detection/lab/quality_baseline.json) records, per finder
and image, which real NoRs each one finds, which not-NoR spots it passes and which missing-candidate
marks it proposes a candidate on. A change that loses a real NoR, passes a new not-NoR or stops
proposing a candidate at a missing mark fails the tests; a loss the owner agreed to is recorded with
`python3 tests/test_quality.py --accept`, so the PR's diff names every spot that moved. Gains are
written into the baseline by a local test run and locked from then on
(`tests/test_quality.py`). Until submissions cover it, the reference slide is scored on Claude's
labels, not the owner's (`detection/STATE.md`), so the lock is only as right as they are. How CI runs these tests is the repo's `2.1` ([`dev/requirements/requirements.md`](../../../dev/requirements/requirements.md)).

## R10 — Submitted ground truth joins the data set by code, and outranks older labels

Set by the owner on 2026-10-03.

- **A daily intake, in code.** Every day an open issue labelled `new-ground-truth` exists, the
  nor-study pack's `ground-truth-intake` task takes every such issue's newest attached `.json`,
  checks it (`norfinder-ground-truth/2`, an image from Google Drive with its SHA-256, at least one
  mark inside the image), and adds it to
  [`detection/lab/ground_truth/`](../detection/lab/ground_truth/) with an entry in its
  `dataset.json`. It re-records the quality baseline (R9) against the new reference and opens one
  pull request that closes the issues it took when merged. A file it cannot use gets a comment on
  its issue saying why, and the label comes off until its author fixes it
  (`detection/ground_truth.py`, `tests/test_ground_truth.py`).
- **Then an agent improves the finders**, on the same pull request, at the opus model, following
  the pack's `improve-on-ground-truth` skill: every finder re-scored on every ground-truth image
  against the last recorded results, candidate detection first for the newly marked missing
  candidates, then overall quality. Losses stay the owner's to accept (R9).
- **Images stay on Drive.** A ground-truth file names its image by Drive id and SHA-256;
  `python3 detection/ground_truth.py fetch` downloads every one into `data/raw/` and checks it
  (R6). No image enters git.
- **Newer and human beats older and Claude's.** For one image, a newer submission's label wins over
  an older one's at the same spot, and every submission wins over the lab's own labels; every
  quality assessment (the lock, `ground_truth.py score`) scores against that merged reference
  (`ground_truth.corpus()`).
- **A missing mark is a real NoR** found when a pass lies within its radius, and proposed when any
  candidate does.

## R11 — Every finder's precision and recall are on record, per filter preset

Set by the owner on 2026-10-06. [`studies/nor/web/finder_metrics.json`](../web/finder_metrics.json)
holds, for every finder the page offers, the precision and recall summed over every ground-truth image
(R10), run the way the page runs it, at two stages kept apart: the finder's own candidates before any
filter, and what passes the filters after it at three filter presets (precise, balanced = the
finder's own values, recalling). Precision counts labelled spots only: real spots passed over labelled spots
passed. A preset moves every filter the same share of the way towards a fixed strict or loose end
(`detection/finder_metrics.py`), the same for every finder. The file is rewritten whenever the
quality baseline (R9) is, and `tests/test_finder_metrics.py` fails when it was measured against
another baseline, another ground truth or other presets. The numbers are only as right as the labels
behind them (R9).

On the page (R8), the finder list shows each finder's precision and recall after its best preset (the
highest F1), its "How it works" note its own candidates' numbers before any filter, and the
Post-processing box (the filters) opens with the three presets, each with its precision and recall after the filters; choosing one sets every filter to its values, and
it stays lit while the filters hold them. The Post-processing box has no "restore defaults": there are no
absolute defaults, and Balanced is the finder's own values.
