---
name: image-algorithm-development
description: The state-by-state procedure for developing an image detection or segmentation algorithm - which of the loader, the approved render, the ground truth and the scoring loop exists yet, what to build next, what to ask the owner and when to stop. Use when starting, resuming or iterating on any such algorithm.
metadata:
  body: workflow
  usage:
    expect: judgment
---

# Developing an image detection or segmentation algorithm

research-project's `RULES.md` holds the standing rules - ground truth is annotated and never
invented, every change is shown as a picture, no overfitting to the learning set, numbered
iteration notes. This skill is the procedure they run inside: which state the project is in,
what to do there, and when to leave it.

The work is three nested loops. The **outer loop** is the owner judging a render and answering
one question. The **inner loop** is you scoring a version against ground truth and keeping or
dropping it, with no owner. The **innermost loop** is build-until-working: run a change and fix
it until the render shows what you intended, before it is scored. The states below build the
loops from the outside in, because each loop needs the artifact of the one outside it.

## Find the state

Check the gates in order; the first that fails is your state. Do not skip ahead - a scoring
loop without approved ground truth measures nothing, and a render nobody approved cannot be
scored against.

| Gate | Test | If it fails |
|---|---|---|
| Inputs | one committed script fetches and verifies the inputs, and one loader returns channels with their physical scale | State 1 |
| Render | one render function exists and the owner has said they can judge results from it | State 2 |
| Ground truth | labels the owner corrected in that render exist as data, with a held-out subset | State 3 |
| Loop | one command runs a version end to end and writes the score, the renders and the diff against the previous version | State 4, opening step |
| all pass | | State 4, iterate |

Resuming a session: read the state off the repo (the loader, the render function, the labels
file, the run command), never off memory of where things stood.

## State 1 - no inputs you can reproduce

Done when a fresh session runs one command and holds the same bytes, and every script calls
the one loader.

- Fetch by committed script with a checksum; store outside git in a shared or cached location.
- One loader, used everywhere: channels as arrays plus the scale (µm/px) read from the file's
  own metadata, never from a stated setting.
- Large images: read regions (tiled or memory-mapped), develop on a representative crop and
  confirm on the full image, and put a downscaled or cropped PNG in the chat rather than the
  image itself.
- Cache each expensive intermediate that does not depend on what you tune (decoded channels,
  background, candidate lists), keyed by the input and the parameters that produced it, so a
  change to a late stage never recomputes the early ones.

No owner question here: choose defaults and state them.

## State 2 - no approved render

Done when the owner says, of one sample, that they can judge the result from it, and the
render is one function every later version calls.

Build it on one sample input, not the corpus, and before any algorithm work: the owner knows
what the right output looks like, and this render is the interface they judge through.

- Draw the result over the input as a mask or thin semi-transparent outline (research-project
  §1 owns the style and colour rules).
- Number the objects in reading order; give a side list or CSV keyed by the same numbers with
  each object's measurements.
- Show rejects as well as passes, each tagged with the rule that removed it, so a filter can be
  judged and not only the result.
- Add a zoom of a dense region and a contact sheet of object crops; the full overlay alone is
  too small to judge.

Ask the owner one question with the render: "Can you tell from this which objects are right
and which are wrong - and what is missing to decide?" Iterate on the format until the answer is
yes, then freeze it.

**The frozen render is an API with the owner.** Its colours, outlines, numbering, panels and
list columns change only when the owner asks. If you think a change would make review easier,
propose it with a before/after on the same sample and wait for approval; until then every
version renders the approved way, even when a new filter or output needs a place in it.

## Many objects in one image - decide on divide and conquer

When the task detects many objects per image, settle this before State 3, because it decides
what the ground truth and the inner loop work on. If the objects are discrete and do not
affect one another visually, pursue divide and conquer: propose candidate sub-images (crops,
each around one object with a margin) with a cheap generic step, and develop, label and score
the detector on those sub-images. Crops are faster to label, cheaper to iterate on, and easy
to review as contact sheets.

- Show the owner (or have a capable model pre-screen, then the owner confirm) a sheet of a few
  sub-images, and ask two questions: "Is each crop one independent object of the kind we want?"
  and "Do you see visual interaction between neighbouring objects - touching, overlapping,
  shared signal, one object's glow or shadow on the next?"
- **No interaction:** work on sub-images from here on, with the crop step as its own scored
  stage, since an object never proposed is lost for good.
- **Interaction:** a tight crop throws away information. Try a wider crop that includes the
  neighbours as context while labelling only the centre object, and show the owner that sheet.
  If wider crops still lose what matters, work on the whole image.

Record the decision and its reason in the ledger.

## State 3 - no ground truth

Done when a few inputs carry labels the owner verified in the State 2 render, stored as data
(a labels file: position, outline, real / not real / unsure) beside the approved render, with a
few inputs held out of tuning.

Take the first branch that applies:

1. **The owner has annotations** - parse and register them (research-project §2 owns parsing,
   regeneration and self-checks).
2. **No annotations** - draft them with a capable model: give it the inputs and the owner's
   stated requirements, have it produce objects and outlines on a few inputs, render the draft
   in the State 2 format and ask the owner to correct it. Only the corrected set is ground
   truth. Leave this branch when the owner corrects more than they keep.
3. **No model drafts something the owner can fix quickly** - the owner labels a few inputs by
   hand. Ask for exactly that, with the render tool ready for them, and do not start State 4
   until it exists.

Ask the owner with the draft or parsed labels in the render: "Per numbered object, which are
wrong, and how?" Until they have answered, every count you report is a proxy - say so beside
the number.

## State 4 - ground truth exists: run the inner loop

Opening step, if the Loop gate failed: write the one command that runs a version end to end and
writes the score (precision, recall, F1), reject counts per reason, which rule removed each
missed real object, the renders, and the objects gained and lost against the previous version.
Each version gets its own output folder.

Each iteration:

1. **Score**, reading the score and the gained/lost sheets rather than full renders - that is
   what keeps an iteration cheap in tokens.
2. **Diagnose the largest error class and locate it**: *generation* (the object was never
   proposed whole - parts not separated, merged with a neighbour) or *filtering* (a good
   candidate was rejected). A reject reason that means "the candidate was malformed" measures
   the generator, not the filter: when it dominates, rebuild the generator - tuning the filter
   that catches it only hides the fault.
3. **Change one thing**, in a new version. For a generator rebuild, first write how you would
   explain finding the object to a child, in steps concrete enough to draw, and implement
   that; if it fails, write a completely different explanation rather than patch the old one.
4. **Build until working** on the sample render before scoring.
5. **Keep or drop on the score**, reviewing the gained and lost objects, not the whole output,
   and write the iteration note (research-project §5). Record the attempt in the ledger (below)
   whether it was kept or dropped.

Two cheap moves between iterations:

- **Rescue false negatives** - pick a few clear real objects that were lost, find the rule that
  killed each, adjust that rule, rescore. Repeat while it keeps paying.
- **Measure each filter alone** - how many it rejects on its own and how many it is the *only*
  reason for. Order the strictest first; a filter that is almost never the only reason is
  redundant - drop it, or show the owner the objects only it rejects.

**Every change passes the assumption test before it is kept.** Legitimate: a size, shape or
arrangement from the research literature, source cited in the code; a distribution measured on
the real data and stated; a statistic the image derives for itself (noise level, local
background, median object size, fraction of a local peak). Illegitimate: a constant tuned to
the current images - a pixel count, a pixel distance, an absolute intensity. Express sizes in
µm from the metadata or in multiples of a measured object size, and cut-offs as noise multiples
or fractions of local intensity. A change that only scores better with an illegitimate constant
is dropped (research-project §4).

**Every kept version passes the invariance stress test.** Never assume the object is aligned
to the pixel grid. Run the version on transformed copies of an input and map the detections back
to the original frame: rotations (including non-right angles, e.g. 15°, 30°, 45°) and flips
for any image. For a camera or microscope image, where any projection of the object can occur,
also apply shear, anisotropic scaling and perspective skew. The detections should match the
untransformed run. This test needs no ground truth: it checks the algorithm against itself, so a
detector that finds nothing passes it, and it never replaces the score. A version whose recall
drops under rotation or skew is encoding an orientation or shape assumption - find it and remove
it, as with an illegitimate constant. Make the test a committed, executable test with explicit
bounds per transform (this repo's `tests/test_invariance.py` is one).

**Stuck** - no error class you can name, or every fix trades one error for another: read the
published research on the object (its dimensions, shape, marker arrangement) and turn what you
find into legitimate assumptions before trying another parameter.

**Stop iterating after two consecutive iterations without a gain** and go to the owner.

## The ledger - every direction tried, and why it won or lost

Keep one ledger file in the repo, appended every time an algorithmic direction, a performance
attempt or an owner-pitched idea is tried or set aside. It is what lets a later session, or a
changed problem, reuse an idea instead of rediscovering it, so each entry is specific enough to
act on without the code:

- **The idea**, in one line, and its **source** (your diagnosis, the literature, or the owner).
- **The mechanism**: what it computes, with its parameters, in scale-free terms.
- **The result**: the score change, and what it fixed.
- **Where it failed**: the error class or image condition that beat it, with object numbers or
  a sheet path.
- **When to revisit**: the change in the problem, data or constraints that would make it worth
  trying again.

Before starting a new direction, search the ledger for it and for its failure conditions. An
owner-pitched idea gets an entry even when you did not try it, stating why.

## Between stretches - make the cycle cheaper

Every iteration of both loops pays in time, tokens, CPU and RAM. Quality comes first; a
performance pass is its own step, after a stretch of quality work and never while the owner
waits on a result.

- Profile the current version, fix the top hotspot, and prove the output identical by hashing
  both; a pass that changes a result is a quality change and is scored as one. Report the time
  before and after, and log the attempt in the ledger, including one that was reverted.
- Restore the token budget the same way: if you have been reading full renders, fix the run
  command's summary until the score and the gained/lost sheets are enough.

## Going to the owner

Go when one of these holds; otherwise keep running the inner loop alone:

- the render (State 2) or the ground truth (State 3) needs approval
- two iterations without a gain
- a fix would add a criterion for what the object *is* - only the owner adds domain rules
- a filter's threshold is in doubt - show the objects only that filter rejects
- the objects look separable: approve sample sub-images and say whether neighbours interact
- a version is about to be called final or run on new inputs

**How to ask:** one checkpoint, one render per question, one concrete question per render
("objects 4, 9 and 12 are rejected only by the elongation filter - are they real?"). Batch
the questions rather than interrupt per finding.

**How to take the answer:** the owner tends to answer with a rule ("anything touching the
edge is not real") rather than with labels. Encode each rule as a check in the pipeline or as a
correction to the ground truth, so the inner loop runs on it without the owner, then return to
State 4.
