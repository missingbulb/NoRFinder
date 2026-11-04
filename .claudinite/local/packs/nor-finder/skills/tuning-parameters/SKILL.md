---
name: tuning-parameters
description: Tuning an existing algorithm version's parameters against ground truth without overfitting - held-out split, one-at-a-time sweeps, flat-optimum preference, bootstrap keep rule. Use after a new version first runs, after a refit on new ground truth, when a filter's threshold is in doubt, or when asked to tune, calibrate or set presets.
metadata:
  body: workflow
  usage:
    expect: judgment
---

# Tuning a version's parameters

Tuning moves numbers inside one mechanism. It cannot fix a wrong mechanism. When two rounds of
tuning give nothing beyond noise, the wall is the mechanism, so go to
[algorithm-ideation](../algorithm-ideation/SKILL.md). Every parameter must already pass
[image-algorithm-development](../image-algorithm-development/SKILL.md)'s assumption test (relative
to something the image measures) before it is tuned. Tuning a pixel constant only fits it to the
current images.

## 1. Hold some ground truth out, before the first sweep

Split by **image** when there are several, and otherwise by **spatial block** (a quadrant), never by
item. Neighbouring items share background and stain, so an item-level split leaks. Fix the split
with a seed and write it in the ledger. Tune on the tuning part only, and report the held-out part
once, at the end. A held-out score that you looked at during tuning is no longer held out.

With fewer graded items than about three per parameter you tune, stop. Report each parameter's
sensitivity curve instead, and leave the defaults: the fit would not survive new labels.

## 2. Sweep one parameter at a time, then the top pairs

- Sweep each parameter over a range in its own scale-free units, around the current value, with
  everything else fixed. Plot F1 (and P, R) against it.
- Prefer a **flat optimum** to a sharp peak. Take the middle of the plateau within noise of the best,
  not the argmax: a knife-edge best value is one image's coincidence.
- Then sweep the two or three parameters whose curves moved most, pairwise, on a coarse grid.

## 3. Keep or drop by the lab's rule

Compare the tuned values with the current ones by the lab's paired bootstrap on the **held-out**
part. Keep at P(better) ≥ 0.8, drop at ≤ 0.2, and in between keep the current values. Land the
change as a switch or a preset, so the old values stay one setting away.

## 4. Record

In the ledger: every parameter swept, its range, its curve (as a path to the regenerable plot), the
value chosen and why (the plateau), and the held-out verdict. The values that were not kept go in
too. They are what stops the next session from sweeping them again.
