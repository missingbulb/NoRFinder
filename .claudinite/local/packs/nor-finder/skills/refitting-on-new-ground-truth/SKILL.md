---
name: refitting-on-new-ground-truth
description: The order of work when new ground truth joins a study - re-score every registered version, see what moved, recover the newly marked misses at the candidate stage, re-tune on the larger set, and land it under the quality lock. Use when ground truth is added to any study, or when asked to improve its algorithms on new labels.
metadata:
  body: workflow
  usage:
    expect: triggered
---

# Refitting on new ground truth

New ground truth changes what every version's score means, so it is re-measured before anything is
changed. A study may carry its own skill for this, with its commands (NoR's
`improve-on-ground-truth`). That skill is this order of work with the paths filled in. A study
without one follows this skill and its own warm-up.

## 1. See what moved

Re-score **every registered version** on every ground-truth input, not only the default. The
registry's ranking can change under a better reference, and a version that was behind may now lead.
Compare against the scores recorded on the base branch. That difference opens the report.

## 2. Misses at the candidate stage first

An object the ground truth marks and no version ever proposed is the cheapest win and the clearest
signal:

1. Render its region with the study's standard render and look before theorising.
2. Find the step that lost it (no seed, a size gate before the checks, a merge with a neighbour).
   Measure the fact a fix would rest on.
3. Change the candidate stage, never a filter, as a switch, and ablate it on **every** input. A
   change that recovers the miss but floods the other inputs with candidates is a loss.

When no change to the candidate stage recovers a class of misses, that class is a wall: run a
mutation sweep with those items in the ground truth
([mutating-an-algorithm](../mutating-an-algorithm/SKILL.md)) before giving up on them.

## 3. Then re-tune, on the larger set

With more graded items, a parameter that could not be tuned before may now be tunable.
[tuning-parameters](../tuning-parameters/SKILL.md) owns the held-out split and the keep rule. A
rule that helps one input only is overfitting.

## 4. Land it

- The study's quality lock must pass. A loss is the owner's to accept, never yours: say in the PR
  which items it would lose and why the change is still worth it.
- Commit the re-recorded baseline and any metrics generated from it.
- Log every attempt, kept or dropped, in the ledger, and update the study's state file.
- The PR body leads with the score table (per version, per input, before and after), then the
  misses recovered and still missed, then what was tried and dropped.
