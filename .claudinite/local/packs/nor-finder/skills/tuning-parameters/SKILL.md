---
name: tuning-parameters
description: Tuning an existing algorithm version's parameters against ground truth without overfitting - held-out ground truth, one-at-a-time sweeps, flat-optimum preference, the lab's keep rule and the quality lock. Use after a new version first runs, after a refit on new ground truth, or when asked to tune or calibrate a version.
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
current images. "The lab" and "the ledger" are the study's own, named in its warm-up.

When the doubt is about *which* items a filter rejects (are they real?), that is the owner's
question, not a tuning one. Show the owner the objects only that filter rejects, and sweep only
once their answer is in the ground truth.

## 1. Decide whether the ground truth can carry a fit at all

A fit counts only if its gain survives held-out ground truth, in every fold. NoR's ledger §5 (T1)
is the calibration: ten filter values fitted on 72 real spots gained 0.06-0.10 F1 in sample, and
the gain vanished on held-out folds. Before sweeping, run the cheapest version of that test, a
two-fold split over the parameters you mean to tune. If the gain does not survive it, stop. Report
each parameter's sensitivity curve instead and leave the defaults.

## 2. Hold ground truth out

Reuse the answer key's held-out subset (image-algorithm-development, State 3). Make one only where
the key has none, and then split by **image** when there are several, and otherwise by **spatial
block** (a quadrant), never by item: neighbouring items share background and stain, so an
item-level split leaks. Fix the split with a seed, and write it in the ledger. Tune on the tuning
part only, and report the held-out part once, at the end. A held-out score you looked at during
tuning is no longer held out.

## 3. Sweep one parameter at a time, then the top pairs

- Sweep each parameter over a range in its own scale-free units, around the current value, with
  everything else fixed. Plot F1 (and P, R) against it. On NoR, one image and one label file per
  run:

  ```
  cd studies/nor/detection && NOR_TIF=<image.tif> python3 nor_lab.py ablate tl 'tl:min_snr=3' 'tl:min_snr=4' --labels <labels.json>
  ```

  A study without a lab command that scores a parameter override gets one before its first sweep.
- Prefer a **flat optimum** to a sharp peak. Take the middle of the plateau within noise of the best,
  not the argmax: a knife-edge best value is one image's coincidence.
- Then sweep the two or three parameters whose curves moved most, pairwise, on a coarse grid.

## 4. Keep or drop

Compare the tuned values with the current ones by the lab's keep rule, on the **held-out** part.
A kept value must also pass the study's quality lock. A value that loses a real item the lock
holds is the owner's call, never a tuning step. Land the change as a switch, the old values one
setting away.

## 5. Record

In the ledger, record:

- every parameter swept, its range, and its curve (as a path to the regenerable plot)
- the value chosen, and why (the plateau)
- the held-out verdict
- the values that were not kept. They are what stops the next session from sweeping them again.
