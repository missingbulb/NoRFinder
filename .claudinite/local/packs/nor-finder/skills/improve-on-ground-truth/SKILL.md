---
name: improve-on-ground-truth
description: Improving the NoR finders when new ground truth joins detection/lab/ground_truth/, or when asked to improve them on the ground truth.
metadata:
  body: workflow
  usage:
    expect: triggered
---

# Improving the finders on new ground truth

The method is the [image-algorithm-development](../image-algorithm-development/SKILL.md) skill's
inner loop (score, keep or drop by data, log every attempt); the rules are research-project's and
`docs/requirements.md` R7, R9 and R10. This skill is the order of work when people have just
submitted ground truth. Read `detection/STATE.md` and `detection/lab/ledger.md` first.

The submitted files are the best reference there is: a person marked each label, where the lab's own
labels are Claude's eye. Where the two disagree the submission wins, which `ground_truth.corpus()`
already applies, so never re-weigh them by hand.

## 1. See what moved

```
python3 detection/ground_truth.py fetch
python3 detection/ground_truth.py score
```

`score` runs every finder the page offers on every ground-truth image and compares each with the
committed baseline (`detection/lab/quality_baseline.json`). On a branch where new ground truth was
just added, the baseline was re-recorded against it, so compare with the base branch's copy too
(`git show origin/main:detection/lab/quality_baseline.json`): that difference is how each finder's
standing changed under the better reference, and it opens your report.

## 2. Missing candidates first

A missing mark (`"kind": "missing"` in a submission) is a NoR the finder never proposed. It is the
cheapest quality to win and the clearest signal, so start there:

1. For every mark no candidate lies on (`nor_lab.missing_found` lists the ones some candidate does),
   render the region with the standard render and look at it before theorising.
2. Diagnose which detection step lost it: no red seed, no green pair found, a size or shape gate
   before the checks. Measure the fact a fix would rest on; do not guess.
3. Change the candidate stage (detection settings or code, never a filter) so it proposes a
   candidate there, as a switch, and ablate it alone (`nor_lab.py ablate`) on every image. A change
   that proposes the missed NoR but floods the other images with candidates the filters then pass is
   a loss, whatever it recovers.

## 3. Then overall quality

Work the remaining misses and false passes the usual way (lost list, diff sheets, one switch per
idea, ablate), on every ground-truth image rather than the reference slide alone: a rule that helps
one image only is overfitting.

## 4. Land it

- `python3 -m pytest tests` must pass. The quality lock fails on any loss; a loss is the owner's to
  accept, never yours, so do not run `--accept` to clear one. Say in the PR which spots it would
  lose and why the change is still worth it, and leave the decision to them.
- A gain is recorded by the local test run; commit the baseline it rewrote.
- Log every attempt, kept or dropped, in `detection/lab/ledger.md`, and update `detection/STATE.md`.
- The PR body leads with the score table (per finder, per image: before and after), then the
  missing marks recovered and still missed, then what was tried and dropped.
- Never change the review render's style, and keep a speed-up's output bit-identical (STATE.md).
