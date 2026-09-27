---
name: image-algorithm-development
description: State-by-state procedure for developing an image detection, segmentation or reading algorithm with an owner validating - which of the inputs, the approved render, the answer key and the grader exists yet, what to build next, what to ask and when to stop. Use when starting, resuming or iterating on any such algorithm, from microscope channels to phone photos.
metadata:
  body: workflow
  usage:
    expect: judgment
---

# Developing an image detection, segmentation or reading algorithm

research-project's `RULES.md` holds the standing rules - ground truth is annotated and never
invented, every change is shown as a picture, no overfitting to the learning set, numbered
iteration notes. This skill is the procedure they run inside: which state the project is in,
what to do there, and when to leave it. Examples come in pairs, **microscopy** (fluorescence
channels, cells and nodes, µm/px from metadata) and **phone photo** (books, receipts, labels at
everyday scale, EXIF and perspective); the method is the same and the examples are only examples.

The work is three nested loops. The **outer loop** is the owner judging a render and answering
one question. The **inner loop** is you scoring a version against the answer key and keeping or
dropping it, with no owner. The **innermost loop** is build-until-working: run a change on one
sample and fix it until the stage emits the artefact it should (a mask, crops, numbers), before
it is scored. The states below build the loops from the outside in, because each loop needs the
artifact of the one outside it.

## Ask at the start - one message, before any research

1. **Which invariances the result must hold**: rotation, flip, scale (near vs far, one objective
   vs another), perspective, polarity, orientation, lighting, several objects per frame. Stated
   now, an invariance is a test in State 4; discovered later, it is a rebuild.
2. **Three to six diverse samples, each a different failure class**, not six of one condition -
   name the classes you want (microscopy: dense vs sparse, a dim channel, an out-of-focus tile, a
   stitched seam; phone: far, angled, glare, both polarities, upside down).
3. **Whether an answer key exists**; if not, whether a capable model may draft it, and whether
   the images may leave the machine or be committed at all.
4. **The tiers and what "good enough" means downstream** (a detection that lands the crop with a
   rough outline; a reading with a few wrong letters that still finds the catalogue entry).
5. **Where the code will run and the rough cost limit** (a workstation over a slide server; a
   phone or browser), so any library or engine survey is scoped once.
6. **Where the docs and the ledger live**, by the project's convention.

Everything else in this skill you do without being asked. The answers are requirements; record
them with the ledger.

## Find the state

Check the gates in order; the first that fails is your state. Do not skip ahead - a scoring loop
without an approved answer key measures nothing, and a render nobody approved cannot be scored
against.

| Gate | Test | If it fails |
|---|---|---|
| Inputs | one committed script fetches and verifies the inputs, and one loader returns pixels in a known frame with their scale | State 1 |
| Render | one render function exists and the owner has said they can judge results from it | State 2 |
| Answer key | labels the owner corrected in that render exist as data, with a held-out subset | State 3 |
| Grader | one command runs a version end to end and writes tiered scores, per-stage timings, the renders and the diff against the previous version | State 4, opening step |
| all pass | | State 4, iterate |

Resuming a session: read the state off the repo (the loader, the render function, the key file,
the run command), never off memory of where things stood.

## State 1 - no inputs you can reproduce

Done when a fresh session runs one command and holds the same bytes, and every script calls the
one loader.

- **Get the bytes onto disk first.** An image pasted into chat is not a file; search the session
  transcript for it before saying it did not arrive, and confirm the recovered file decodes to
  the expected dimensions.
- Fetch by committed script with a checksum. Store samples beside the answer key so the two
  travel together; large originals go outside git in a shared or cached location.
- **One loader, used everywhere, that normalises before anything reads a coordinate**: the frame
  (microscopy: channel order and per-channel offset; phone: EXIF orientation applied on decode,
  or every coordinate you report is sideways) and the scale, read from the input itself
  (microscopy: µm/px from the file's metadata, never a stated setting; phone: a reference object
  or the fixed working width, and say which).
- **Work on a working-resolution copy and cut detail from the original.** Fix the working size so
  every threshold means the same thing on every input, carry regions back to original
  coordinates, and crop fine detail (text, a node's outline) from full-resolution pixels. For
  very large images read regions (tiled or memory-mapped), develop on a representative crop and
  confirm on the full image; put a downscaled PNG in the chat, never the image itself.
- **Cache each expensive intermediate** that does not depend on what you tune (decoded channels,
  background, candidate crops, an engine's raw reading), keyed by input, stage and parameters;
  invalidate when the producing stage changes, and say in every summary line which stages ran
  cached.
- A library step that surprises you (chained operations that clobber each other, a channel count
  that changes on output) is materialised between steps and checked for shape, and goes in the
  ledger.

No owner question here: choose defaults and state them.

## State 2 - no approved render

Done when the owner says, of one sample, that they can judge the result from it, and the render
is one function every later version calls. Build it on one sample, before any algorithm work:
the owner knows what the right output looks like, and this render is the interface they judge
through.

- **Overlay on the input**, mask or thin semi-transparent outline (research-project §1 owns style
  and colour), every item numbered in reading order and colour-coded by status (found / at the
  frame edge / rejected, each reject tagged with the rule that removed it).
- **Draw the geometry you actually compute**, not a simplification: a fitted ellipse as an
  ellipse, a tilted line tilted, a perspective quadrilateral as the trapezoid it is. An
  axis-aligned box over a tilted object hides the alignment assumption from you and the owner
  until they point it out.
- **A per-item sheet**: each object as the next stage sees it (the crop after warp, inversion or
  flattening; the node crop with its channel profiles) with that stage's output beside it. A
  cut-off crop or a biased reader becomes visible here and nowhere else. Add a zoom of a dense
  region; the full overlay alone is too small to judge.
- **A machine-readable result** (`result.json`) with every intermediate decision and per-stage
  timings, so "why did #7 fail" is answered without a re-run.
- **One CLI**: `tool <image> [out-dir]` writes overlay, sheet and result and prints one summary
  line (`18/21 found · segment 1.2 s · classify 0.4 s · cached: none`).
- Check the render itself before showing it - label overlap, numbering matching the JSON, text
  anchoring - because a wrong overlay wastes a round.

Ask the owner one question with the render: "Can you tell from this which objects are right and
which are wrong - and what is missing to decide?" Iterate on the format until the answer is yes,
then freeze it.

**The frozen render is an API with the owner.** Its colours, outlines, numbering, panels and list
columns change only when the owner asks; propose a change with a before/after on the same sample
and wait, and until then every version renders the approved way, even when a new filter or
output needs a place in it. The one change that needs no asking: when the owner corrects a
geometric assumption, the next render draws the corrected geometry.

## Many objects in one image - decide on divide and conquer

When the task detects many objects per image, settle this before State 3, because it decides
what the answer key and the inner loop work on. If the objects are discrete and do not affect one
another visually, pursue divide and conquer: propose candidate sub-images (crops, each around one
object with a margin) with a cheap generic step, and develop, label and score the detector on
those. Crops are faster to label, cheaper to iterate on, and easy to review as contact sheets.

- Show the owner (or have a capable model pre-screen, then the owner confirm) a sheet of a few
  sub-images, and ask two questions: "Is each crop one independent object of the kind we want?"
  and "Do you see visual interaction between neighbours - touching, overlapping, shared signal,
  one object's glow or shadow on the next?" (microscopy: stain bleed, a bright neighbour's halo;
  phone: one spine's shadow on the next, a reflection).
- **No interaction:** work on sub-images from here on, with the crop step as its own scored
  stage, since an object never proposed is lost for good.
- **Interaction:** a tight crop throws away information. Try a wider crop that includes the
  neighbours as context while labelling only the centre object, and show the owner that sheet.
  If wider crops still lose what matters, work on the whole image.

Record the decision and its reason in the ledger.

## State 3 - no answer key

Done when a few inputs carry labels the owner verified in the State 2 render, stored as data
beside the samples, with a few inputs held out of tuning. Get it before tuning anything, or every
improvement is an opinion. Take the first branch that applies:

1. **The owner has annotations** - parse and register them (research-project §2 owns parsing,
   regeneration and self-checks).
2. **No annotations** - draft them with a capable model: give it the inputs and the owner's
   stated requirements, run it on the crops the pipeline sees where the whole image is too small
   for it, and **show the draft to the owner before using it**, in the State 2 render and as a
   table beside your own reading, saying where it is weak. Where model and you agree, trust;
   where you disagree, ask. Only the corrected set is ground truth. Leave this branch when the
   owner corrects more than they keep.
3. **No model drafts something the owner can fix quickly** - you label from full-resolution
   crops, every entry marked unconfirmed, and ask only about the uncertain ones.
4. **None of these** - the owner labels a few inputs by hand, with the render tool ready for
   them; State 4 waits until it exists.

**The key's shape** - one file, with an `_about` field explaining every other field:

- Per item: position or outline, the expected reading or class, and `confirmed` true or false.
  Unconfirmed is your reading, not yet checked; never promote it silently.
- `"?"` marks an unknowable item (illegible, cut off, out of focus, physically hidden) - kept,
  never graded, never spent an iteration on.
- `notes` says *why* an item is hard ("upside down", "on the tile seam", "two cells touching");
  these are the known-gap list and the classes for the next sample request.
- **Partial keys are fine.** Key the 35 items you know of 150, with a scope field (a region, a
  shelf, a tile) so the grader pairs only inside it and does not read the unkeyed rest as misses.
- **Record occlusion and grade only what is visible** (the shelf lip hides every author; the
  coverslip edge clips a row of nodes). A metric that penalises content not in the pixels teaches
  nothing.
- **Reuse answers across overlapping inputs.** When one sample shows objects other samples show
  under a different angle, distance or exposure, key it from them - a scale and angle test for
  free. Look for the overlap yourself.

**Asking about uncertain entries**: one lettered list (A-J, about ten at a time), each with the
item number and your best reading, and one image with the same letters on the crops. The owner
answers `A - check`, `E - <correction>`, `G - can't tell either`. List the confident entries in
one line so they can object without being asked item by item; anything unanswered stays
unconfirmed. Expect corrections no metric produces ("these two are not objects", "nothing
printed there", "hidden") and encode each as a key field, never a code special-case.

Until the owner has answered, every count you report is a proxy - say so beside the number.

## State 4 - the answer key exists: run the inner loop

Opening step, if the Grader gate failed: write the one command (`score [--verbose] [--only
<sample>] [--cache]`) that runs every sample and writes, per version into its own folder: the
tiered score, reject counts per reason, which rule removed each missed real object, per-stage
timings, the renders, and the objects gained and lost against the previous version.

- **Tiers, not one score**: `full` / `partial` / `missed` with thresholds that mean something
  downstream (an outline within the tolerance the measurement needs; a reading close enough to
  find the entry). Tiers tell the owner where to look; a mean IoU does not. Precision, recall and
  F1 are the totals under them.
- **Greedy pairing** of key items to detections: a distance for every pair, closest first, each
  side used once, constrained by the scope field. Robust to extras, misses and reordering.
- **Grade on what matters downstream**: strip what the consumer ignores before comparing
  (punctuation and word order; an outline's sub-pixel wobble), or that noise swamps the signal.
- **Grade every stage** with its own tiers (proposal / classification / measurement;
  segmentation / reading / matching): a gain in one stage can hurt the next.
- **Beat the noise.** Re-run the baseline in the same session before comparing; judge on totals
  over all samples, never one item or one sample; on a few dozen graded items a gain of one or
  two is noise - find a change that moves five, or get more samples. Mark every number cached,
  fresh or synthetic.
- **Naive first.** Before adding a stage, score the simplest whole-image approach; add the stage
  only when the naive run fails on the metric, and cite that run in the ledger.

Each iteration:

1. **Score**, reading `--verbose` (one line per item: tier, expected, got, outcome) and the
   gained/lost sheets rather than full renders - that keeps an iteration cheap in tokens.
2. **Diagnose the largest error class and locate its stage**: *generation* (never proposed whole
   - parts not separated, merged with a neighbour, cut off by the crop) or *filtering* (a good
   candidate rejected or misread). Check the earlier stage before tuning the later one: most
   "reader" or "classifier" failures are crop failures. A reject reason meaning "the candidate
   was malformed" measures the generator, not the filter; when it dominates, rebuild the
   generator - tuning the filter that catches it only hides the fault.
3. **Change one thing, naming the mechanism** ("the band line sits mid-object because it is
   fitted to edge density, not each object's own extent"), in a new version. For a generator
   rebuild, first write how you would explain finding the object to a child, in steps concrete
   enough to draw, and implement that; if it fails, write a completely different explanation
   rather than patch the old one.
4. **Build until working** on the sample render before scoring.
5. **Keep or drop on the score**, reviewing the gained and lost objects, and write the iteration
   note (research-project §5). Record the attempt in the ledger whether kept or dropped.

Cheap moves between iterations:

- **Rescue false negatives** - pick a few clear real objects that were lost, find the rule that
  killed each, adjust that rule, rescore. Repeat while it keeps paying.
- **Measure each filter alone** - how many it rejects on its own and how many it is the *only*
  reason for. Order the strictest first; a filter that is almost never the only reason is
  redundant - drop it, or show the owner the objects only it rejects.
- **Run a capable model on the same items as a reference point**, not only as a key source: its
  tiers beside yours say whether the gap is the pipeline or the pixels.

**Every change passes the assumption test before it is kept.** Every constant needs a sentence
saying what it is relative to and where it came from; if the sentence is "it worked on sample 1",
it is a bug that has not failed yet.

| Legitimate | Illegitimate |
|---|---|
| Sizes and cut-offs relative to what the image measures for itself: µm from metadata or multiples of the median object size; noise multiples, fractions of local intensity or an Otsu split, the dominant edge angle | Absolute pixel counts, distances or intensities that happen to work on the samples |
| Quantities that scale with resolution (halve a gradient threshold when the working width doubles) | Re-tuning the same constant by hand after every resolution change |
| Domain priors from how the object is made, cited in the code (a node's marker arrangement from the literature; text runs along a spine and is the minority of its pixels) | Priors true of your samples only (every cell in focus; every book upright and dark-on-light) |
| Multi-hypothesis when a measured statistic is ambiguous (near 50/50 polarity → process both ways, keep the better) | One hypothesis chosen by a bar set to pass the sample |
| A second, looser pass triggered by a measured anomaly (a segment wider than 1.8× the median is re-searched for a merge) | Lowering the global threshold until the sample passes |
| Downstream tolerance for what the pixels cannot resolve (two glyphs identical at ten pixels; two markers inside one point-spread) | Endless crop tweaking for detail that is not in the pixels |

A change that only scores better with an illegitimate constant is dropped (research-project §4);
when samples are few, prefer the change with a physical explanation over the better score.

**Every kept version passes the invariance stress test**, one transform per invariance the owner
stated. Never assume the object is aligned to the pixel grid. Run the version on transformed
copies of an input and map the detections back: rotations including non-right angles (15°, 30°,
45°) and flips for any image; shear, anisotropic scaling and perspective skew for anything a
camera or microscope can project; polarity and lighting where stated. Detections must match the
untransformed run within explicit bounds per transform, in a committed executable test (this
repo's `tests/test_invariance.py` is one). The test needs no key - it checks the algorithm against
itself, so a detector that finds nothing passes and it never replaces the score - and a synthetic
transform resamples twice, so it is pessimistic; say so. Recall that drops under a transform is an
orientation or shape assumption: find it and remove it, as with an illegitimate constant. Unit
tests of pure-pixel stages may use drawn synthetic inputs; the score and invariance harnesses run
on real images (research-project §3).

**Stuck** - no error class you can name, or every fix trades one error for another: research the
*object*, not the code - how it is made, printed or stained, its dimensions and arrangement, what
published methods and the engine's docs say - and turn that into legitimate assumptions before
trying another parameter.

**Stop iterating after two consecutive iterations without a gain beyond noise**, or when every
remaining miss is a `notes` class that needs the owner or a new direction, and go to the owner.

## The ledger - every direction tried, and why it won or lost

Keep one ledger file where the owner said docs go, appended every time an algorithmic direction,
a performance attempt, a library gotcha or an owner-pitched idea is tried or set aside. It is
what lets a later session, or a changed problem, reuse an idea instead of rediscovering it, so
each entry is specific enough to act on without the code:

- **The idea**, in one line, and its **source** (your diagnosis, the literature, or the owner).
- **The mechanism**: what it computes, with its parameters, in scale-free terms.
- **The result**: the tier deltas per sample, and what it fixed.
- **Where it failed**: the error class or image condition that beat it, with object numbers or a
  sheet path.
- **When to revisit**: the change in the problem, data or constraints that would make it worth
  trying again.

Before starting a new direction, search the ledger for it and for its failure conditions. An
owner-pitched idea gets an entry even when you did not try it, stating why. The dated scoring
table, per sample per version, lives in the same place; every entry cites its rows.

## Between stretches - make the cycle cheaper

Every iteration of both loops pays in time, tokens, CPU and RAM. Quality comes first; a
performance pass is its own step, after a stretch of quality work and never while the owner waits
on a result - unless a grader run has crept past what a feedback round can tolerate, in which
case say so and spend one cycle on it. The per-stage timings in every summary line are the early
warning.

- Profile the current version, fix the top hotspot, and prove the output identical by hashing
  both; a pass that changes a result is a quality change and is scored as one. Report the time
  before and after, and log the attempt in the ledger, including one that was reverted.
- Restore the token budget the same way: if you have been reading full renders, fix the run
  command's summary until the score and the gained/lost sheets are enough.
- **Deployment is not quality work**: memory limits, instance sizes, job APIs and device ports are
  their own tasks with their own measurements, and a cost comparison of alternatives (per item,
  dated list prices, what leaves the machine) is a table in the docs, not a round's report.

## Going to the owner

Go when one of these holds; otherwise keep running the inner loop alone:

- the render (State 2) or the answer key (State 3) needs approval, or a stage's overlay is ready
  - stop after each stage's overlay, not after the whole pipeline
- two iterations without a gain beyond noise
- a fix would add a criterion for what the object *is* - only the owner adds domain rules
- a filter's threshold is in doubt - show the objects only that filter rejects
- the objects look separable: approve sample sub-images and say whether neighbours interact
- a large sample would take long to key: ask whether to key it or keep it as a readability-only
  test, rather than guess
- a version is about to be called final or run on new inputs

**How to ask:** one checkpoint: one image with numbered overlays, one lettered list of the
uncertain items, one before/after table, one status line (`all: 23 full, 26 partial, 37 missed ·
sample6 weakest`), and "what I need from you" as a numbered list at the end. One concrete
question per render ("objects 4, 9 and 12 are rejected only by the elongation filter - are they
real?"); batch rather than interrupt per finding.

**How to report at each exit:** the numbers before and after, what changed, and each remaining
failure with its class and whether it needs the owner (unknowable, hidden, a new sample class) or
a new direction. That last part is what earns the next round of useful feedback instead of a
repeat of the last one.

**How to take the answer:** the owner tends to answer with a rule ("anything touching the edge is
not real") rather than with labels. Encode each rule as a check in the pipeline, a key field or an
invariance test, so the inner loop runs on it without the owner, then return to State 4. Only the
owner supplies object identity, physical facts of the scene (the trapezoid, the hidden author,
the stain that bleeds), key corrections, new sample classes and direction; the method - real
geometry, naive first, uncertain items only, show before using - is this skill's and should not
need saying twice.

## Where the two disciplines differ

| | Microscopy | Phone photo of everyday objects |
|---|---|---|
| Scale and frame | µm/px and channel order from the file's metadata; z and focus per tile; stitched-tile seams | EXIF orientation; no absolute scale without a reference object; perspective, so parallel edges converge |
| Typical invariances | rotation and flip; intensity scale across exposures; channel gain | rotation and perspective; distance; lighting and glare; polarity; upside-down objects |
| Typical failure classes | stain bleed between channels, out-of-focus regions, touching cells, dim signal against autofluorescence, edge clipping | a crop cutting an item, two items in one crop, glare, text below the pixels, illustrated or stylised surfaces |
| A ground-truth label | a position or outline per object with real / not real / unsure, registered to the loader's frame | a per-item reading or class with `confirmed`, `"?"` for unknowable, a scope field, occlusion flags |
