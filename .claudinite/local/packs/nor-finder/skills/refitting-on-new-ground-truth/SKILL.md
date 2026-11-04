---
name: refitting-on-new-ground-truth
description: The order of work when new ground truth joins a study - re-score the lab's registry, see what moved, retire what became terrible, recover the newly marked misses at generation, re-tune on the larger set, and land it without losing what the base found. Use when ground truth is added to any study, or when asked to improve its algorithms on new labels. A study with its own skill for this (NoR - improve-on-ground-truth) is entered through that skill, which carries the commands for each step.
metadata:
  body: workflow
  usage:
    expect: judgment
---

# Refitting on new ground truth

New ground truth changes what every version's score means, so everything is re-measured before
anything is changed. "The lab", "the ledger" and "the registry" (every version the lab keeps
runnable; [fusing-algorithms](../fusing-algorithms/SKILL.md) §4) are the study's own.

## 1. See what moved

1. Take the held-out split from the ledger, or fix one now as
   [tuning-parameters](../tuning-parameters/SKILL.md) step 2 says, before reading any score.
2. Re-score **every version in the registry** on the tuning part of every ground-truth input, not
   only the default. The ranking can change under a better reference. Compare against the scores
   recorded on the base branch; that difference opens the report.
3. A version that is now terrible by fusing-algorithms §4 leaves the registry, and its ledger line
   says when it left.

## 2. Misses at generation first

An object the ground truth marks and no version ever proposed is the cheapest win and the clearest
signal:

1. Render its region with the study's standard render and look before theorising.
2. Find the step of generation that lost it (no seed, a size gate before the checks, a merge with a
   neighbour). Measure the fact a fix would rest on.
3. Change generation, never a filter, as a switch, and ablate it on **every** tuning input. A change
   that recovers the miss but floods the other inputs with candidates is a loss.

When no change to generation recovers a class of misses, that class is a wall. Run a mutation sweep
([mutating-an-algorithm](../mutating-an-algorithm/SKILL.md)) and read its `rescued_never` for
those items before giving up on them.

## 3. Then re-tune, on the larger set

With more graded items, a parameter that could not carry a fit before may now carry one.
[tuning-parameters](../tuning-parameters/SKILL.md) decides that, and owns the keep rule. A rule that
helps one input only is overfitting.

## 4. Land it

- No item the base branch's recorded scores found may be lost. Check it with the study's quality
  lock where it has one, and otherwise with the lab's score against the base branch's record. A loss
  is the owner's to accept, never yours: say in the PR which items it would lose, and why the change
  is still worth it.
- Report the held-out part once, here.
- Commit the scores recorded against the new ground truth, and anything generated from them. Log
  every attempt in the ledger, as
  [image-algorithm-development](../image-algorithm-development/SKILL.md)'s ledger section says.
- The PR body leads with the score table (per version, per input, before and after), then the
  misses recovered and those still missed.
