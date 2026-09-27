---
name: image-algorithm-development
description: How to set up and run the development cycle for a new image-processing algorithm - inputs and caching, a human-verifiable output, ground truth, self-improvement loops and performance passes. Use when starting or iterating on any image detection or segmentation algorithm.
metadata:
  body: workflow
  usage:
    expect: judgment
---

# Developing an image-processing algorithm

The research-project pack's rules (ground truth, anti-overfitting, iteration notes, showing
results) apply throughout. This skill is the order of work that builds the cycle they run in.

The cycle is three nested loops:

- **The outer loop is the human-feedback loop.** The owner looks at the human-verifiable
  output (step 2) and gives judgment: what the object is, what is wrong, where to go next.
- **The inner loop is the self-improvement loop.** It needs no human: the algorithm is scored
  against ground truth (step 3), and each iteration keeps or drops a change on the score.
- **The innermost loop is build-until-working.** Inside one iteration you run the code, look at
  the output, and fix it until it does what the iteration intended, before the change is scored.

Set up steps 1-3 once per project, in order. Steps 4-6 are the loops that follow.

## 1. Inputs: fetch, store, load, cache

- Fetch inputs with a committed script (never a manual download), verify a checksum, and store
  them outside git in a shared or cached location, so a new session can get the same bytes.
- Write one loader that returns the channels as arrays with their physical scale (µm/px read
  from the file's metadata) and use it everywhere.
- For large images:
  - read only the region you need (tiled or memory-mapped reads)
  - develop on a representative crop, then confirm on the full image
  - never load the whole image into a chat context; render a downscaled or cropped PNG instead
- Cache every expensive intermediate that does not depend on what you are tuning (decoded
  channels, background masks, candidate lists), keyed by the input and the parameters that
  produced it, so a change to a late stage does not recompute the early ones.

## 2. The human-verifiable output format - built on one sample

Before improving the algorithm, build the output the owner will judge, on one sample input.
The owner knows what the right answer looks like, so this output is the interface of the
outer loop.

- Draw the result as a mask or outline over the original input, not on a blank canvas.
- Outlines hug the detected shape. They are thin and semi-transparent, and never cover
  the signal.
- Pick outline colours that do not appear in the data.
- Number each object in reading order, and give a side list or CSV with the same numbers and
  its measurements.
- Show rejects as well as passes, each tagged with the rule that removed it, so the owner can
  judge each filter.
- Add a zoom of a dense region and contact sheets of cropped objects; the full overlay alone is
  too small to judge.
- Iterate on the format with the owner until they say they can judge the result from it, then
  freeze it as a render function that every version uses.

## 3. Ground truth - the prerequisite for the inner loop

The inner loop runs only against ground truth the owner has verified in the step 2 format.

1. **If the owner has annotations,** use them (and the research-project rules on parsing and
   regenerating them).
2. **If not, draft them with a model.** Give a capable model the input images and the owner's
   stated requirements, and have it produce labels (objects and their outlines) on a few
   inputs. Render the draft in the step 2 format and have the owner correct it. Only the
   corrected set is ground truth; an uncorrected draft is not.
3. **If no model produces a draft the owner can fix quickly,** the owner labels a few inputs by
   hand. That work is a prerequisite: do not start the inner loop without it.

- Store the ground truth as data (for example `labels.json`: position, outline, real / not real /
  unsure) together with the render that the owner approved.
- Keep a few inputs out of tuning as a held-out check.
- Until ground truth exists, every count you report is a proxy; say so beside the number.

## 4. The inner loop: self-improvement against ground truth

Run each iteration as:

1. **Score** the current version: precision, recall and F1 against ground truth. Give counts
   per rejection reason, and which rule removed each real object that was missed.
2. **Diagnose** the largest error class. Separate errors in *candidate generation* (the object
   was never proposed correctly, for example parts not separated) from errors in *filtering*
   (a good candidate was rejected). A reject reason that means "the candidate was malformed"
   measures the generator; when it dominates, rebuild the generator rather than tuning filters.
3. **Change one thing,** in a new version with its own output folder. For a generator
   rebuild, write how you would explain finding the object to a child, in steps concrete
   enough to draw, and implement that. If it does not work, explain it in a completely
   different way rather than patching the old explanation.
4. **Build until working** (the innermost loop): run it, look at the step 2 render on the
   sample, and fix it until it does what you intended.
5. **Keep or drop** it on the score. Look at the objects that were gained and lost against
   the previous version, not at the whole output again.
6. **Rescue false negatives:** find a few clear real objects that were rejected. Find which
   rule removed each one, adjust that rule, and rescore. Repeat for a few cycles.
7. **Measure each filter on its own:** how many it rejects alone, and how many it is the only
   reason for. Put the strictest first, and flag any filter that is almost never the only
   reason as redundant.

Keep going without the owner while the score improves. After two iterations without a gain,
go back to the outer loop.

## 5. Legitimate and illegitimate assumptions

An assumption is **legitimate** when it comes from:
- the research literature on the object (its size, shape or structure, with the source)
- the real data, measured and stated (for example a distribution or a histogram dip)
- statistics the image derives for itself, such as a noise level, a local background,
  a median object size, or a fraction of a local peak

It is **illegitimate** when it is a constant tuned to the current images, such as a pixel count,
a pixel distance or an absolute intensity. Express sizes in units the image measures (µm from
its metadata, or multiples of a measured object size), and cut-offs as noise multiples or
fractions of local intensity.

**When stuck,** read published research on the object's characteristics (its typical
dimensions, shape and marker arrangement). Turn what you find into legitimate assumptions, with
the source cited in the code.

## 6. Keep the cycle short and cheap

Every iteration of both loops pays in time, tokens, CPU and RAM, so the cycle is kept cheap.
Do this work separately from quality work, and after it: never change a result in a
performance pass.

- Periodically, and at the end of a long stretch of algorithm work (never while the owner waits
  on a result), profile the current version, fix the top hotspot, and check the output is
  identical. Report the time before and after.
- One command runs a version end to end and writes the score, the step 2 renders, and the
  comparison with the previous version.
- Read the score and the gained/lost sheets rather than full images, to save tokens.
- Save the owner's time by grouping questions into one checkpoint, each with the picture that
  answers it.

## The outer loop: when to go to the owner

Stop and show the step 2 output, with one concrete question, when:

- the output format or the ground truth needs approval (steps 2-3)
- the inner loop has stalled for two iterations
- a new criterion about what the object is would be added (only the owner adds domain rules)
- a filter's threshold is in doubt: show the objects that only that filter rejects
- a version is about to be called final or run on new inputs

The owner's answers are usually rules, not labels. Encode each one as a check or a ground-truth
correction, so the inner loop can run on it without the owner.
