---
name: fusing-algorithms
description: Studying and fusing two or more of a study's algorithm versions that reach similar precision and recall by different mechanisms, and keeping every non-terrible version registered for later learning. Use when a new version ties the best within noise, when versions disagree on many items, or when asked to combine or ensemble algorithms.
metadata:
  body: workflow
  usage:
    expect: judgment
---

# Fusing algorithms that work differently

Two versions that score alike by different routes usually fail on different items. That difference
is the opportunity: a fusion can keep what each one gets right. Before building anything, though,
measure whether the difference is real. Two versions that miss the same items have nothing to give
each other.

## 1. Qualify the pair

A pair qualifies when:

- they differ in mechanism, meaning the unit of decision, the evidence, or the direction (bottom-up
  against top-down). Two settings of one version do not qualify.
- each is within noise of the best (the lab's paired bootstrap P(better) between 0.2 and 0.8), **or**
  each holds items that only it finds.

## 2. Measure the complementarity, with the oracle bounds first

Build the per-item table over the graded items: which versions keep each one. From it, read:

- **The union's recall and the intersection's precision**: the oracle bounds. A fusion cannot beat
  the union's recall, or the intersection's precision. When neither bound beats the best version,
  stop here and record that in the ledger.
- **The disagreements**: the items exactly one version keeps. Look at their tiles, sorted by which
  version kept them, and name the class each version is better at, one line each (A finds the dim
  ones, B rejects the ones touching a neighbour).

## 3. Fuse - cheapest pattern first, each one as a new version

1. **Vote**: OR, AND, or k-of-n over the versions' kept items, matched by position. Use OR when the
   precision bound holds up, and AND when the recall bound does.
2. **Propose and verify**: the high-recall version proposes, and the other's decision on the same
   item (its filter, its score) verifies.
3. **Cascade**: one decides the items it is sure of, and the other decides the rest. "Sure" means a
   quantile of its own score, never a tuned constant.
4. **Transplant**: lift the one rule behind the class B is better at (step 2) into A as a switch,
   and ablate it there. This is often the best outcome, because the result is one version, not two
   to maintain.
5. **Stack**: a small model (logistic, or a shallow tree) over both versions' per-item features.
   Fit it on a held-out split only ([tuning-parameters](../tuning-parameters/SKILL.md) owns the
   split), and only when there are enough graded items to hold one out. On a few dozen items a
   stack overfits; say so and stop at pattern 4.

Score every fusion against the registry with the lab's comparison. Keep it by the same rule as any
version, then run the mutation sweep with it as base
([mutating-an-algorithm](../mutating-an-algorithm/SKILL.md)).

## 4. Keep the registry alive

Every version that is not terrible stays registered in the lab, runnable, and scored in every
comparison. Terrible means beaten by the study's naive baseline with no item only it finds. The
registry defines "never found" for the mutation signal, is the pool fusion draws from, and is where
a later idea finds a mechanism that already handles its hard case. A version leaves the registry
only when it becomes terrible against a newer ground truth, and its ledger line says when it left.
