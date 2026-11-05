---
name: improve-on-ground-truth
description: Improving the NoR finders when new ground truth is curated in the study's Drive folder (its dataset SHA moved), or when asked to improve them on the ground truth.
paths:
  - "studies/nor/**"
metadata:
  body: workflow
  usage:
    expect: triggered
---

# Improving the finders on new ground truth

The order of work is the repo's
[refitting-on-new-ground-truth](../../../nor-finder/skills/refitting-on-new-ground-truth/SKILL.md)
skill. Each step below is its step of the same number, filled in with NoR's commands. The rules are
research-project's and `studies/nor/docs/requirements.md` R7, R9 and R10. Read
`studies/nor/detection/STATE.md` and `studies/nor/detection/lab/ledger.md` first.

The curated files are the best reference there is: a person marked each label, where the lab's own
labels are Claude's eye. Where the two disagree the curated file wins, which `ground_truth.corpus()`
already applies, so never re-weigh them by hand.

## 1. See what moved

```
python3 studies/nor/detection/ground_truth.py fetch
```

```
python3 studies/nor/detection/ground_truth.py score tl rf fill walk blobs tl_post
```

`score` compares each finder with the committed baseline
(`studies/nor/detection/lab/quality_baseline.json`). The baseline carries only the finders the page
offers, so `tl_post` is scored without one. On a branch where new ground truth was just added, the
baseline was re-recorded against it, so compare with the base branch's copy too:

```
git show origin/main:studies/nor/detection/lab/quality_baseline.json
```

Each finder's precision and recall, at each filter preset, are in
`studies/nor/web/finder_metrics.json`; diff it the same way. A finder retired from the registry
leaves `nor_lab.finders()`, and if the page offers it, `interactive.FINDERS` too, with the lock
re-accepted by the owner.

## 2. Missing candidates first

A missing mark (`"kind": "missing"` in a submission) is a NoR no finder proposed.
`nor_lab.missing_found` lists the marks some candidate already lies on. For each of the others,
render the region with the standard render (`render_std.py`), find the detection step that lost it
(no red seed, no green pair, a size or shape gate before the checks), and ablate the change on
every image:

```
cd studies/nor/detection && python3 nor_lab.py ablate tl 'tl:<setting>=<value>'
```

## 3. Then re-tune

Ledger §5 found the filter values are not finder-specific, and that fitting them per finder did not
survive held-out labels. Re-tune one shared set, and only once the ground truth can carry a fit.

## 4. Land it

```
python3 -m pytest web-tests studies dev/tools/trick_pool
```

The quality lock is `studies/nor/tests/test_quality.py`. Never run its `--accept` to clear a loss:
that is the owner's. A gain is recorded by the local test run. Commit the baseline it rewrote and
`studies/nor/web/finder_metrics.json` (R11) with it, and update `STATE.md`. Never change the review
render's style, and keep a speed-up's output bit-identical.
