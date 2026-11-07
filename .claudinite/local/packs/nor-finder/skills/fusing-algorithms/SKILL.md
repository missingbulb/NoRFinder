---
name: fusing-algorithms
description: Studying and fusing two or more of a study's algorithm versions that reach similar precision and recall by different mechanisms, and keeping the lab's registry of every non-terrible version alive. Use when a new version ties the best within noise by a different mechanism, when versions disagree on many items, when deciding whether a version leaves the registry, or when asked to combine or ensemble algorithms.
metadata:
  body: workflow
  usage:
    expect: judgment
---

# Fusing algorithms that work differently

Versions that score alike by different routes usually fail on different items. Step 2 measures
whether they do before anything is built. "The lab" and "the ledger" are the study's own, named in
its warm-up.

## 1. Qualify the pair

A pair qualifies when:

- they differ in mechanism, meaning the unit of decision, the evidence, or the direction (bottom-up
  against top-down). Two settings of one version do not qualify.
- each is within noise of the best (no evidence either way by the keep rule in image-algorithm-development State 4), **or**
  each holds items that only it finds.

On NoR:

```
cd studies/nor/detection && python3 nor_lab.py ablate tl rf
```

## 2. Measure the complementarity, with the oracle bounds first

```
cd studies/nor/detection && python3 mutate.py table tl rf fill
```

It prints each version's P and R, the **union's recall** and the **intersection's precision**,
and the graded items only one version keeps. Items are matched within the lab's match radius.

- No fusion recalls more than the union, and none is more precise than the intersection. When
  neither bound beats the best version, stop here and record that in the ledger.
- Look at the tiles of the items only one version keeps, grouped by version, and name the class
  each version is better at, one line each (A finds the dim ones, B rejects the ones touching a
  neighbour).

## 3. Fuse - cheapest pattern first, each one as a new version

1. **Vote**: OR, AND, or k-of-n over the versions' kept items, matched by position. Use OR when the
   union's precision stays within noise of the best version's, AND when the intersection's recall
   does, and k-of-n in between.
2. **Propose and verify**: the high-recall version proposes, and the other's decision on the same
   item (its filter, its score) verifies.
3. **Cascade**: one decides the items it is sure of, and the other decides the rest. "Sure" is a
   quantile of the measurement the version ranks by (NoR tl: `tl_score`). A version without one
   gets a score field in its candidates first.
4. **Transplant**: lift the one rule behind the class B is better at (step 2) into A as a switch,
   and ablate it there. This is often the best outcome, because the result is one version to
   maintain, not two.
5. **Stack**: a small model (logistic, or a shallow tree) over both versions' per-item features.
   Fit it on the tuning part of [tuning-parameters](../tuning-parameters/SKILL.md)' split, and
   report it once on the held-out part. On a few dozen items a stack overfits: NoR's ledger §5 (T1)
   lost a fitted gain on held-out folds with 72 real spots. Say so and stop at pattern 4.

A fusion is a version. Register it in the lab, then ablate it against the better parent:

```
cd studies/nor/detection && python3 nor_lab.py ablate <better parent> <fusion>
```

It is a new version of the study's algorithm: record its quality before the page offers it. When it lands within noise of the
best or better, run the mutation sweep with it as base
([mutating-an-algorithm](../mutating-an-algorithm/SKILL.md)).

## 4. Keep the registry alive

The **registry** is the set of versions the lab runs in every comparison (NoR: `nor_lab.finders()`,
which the mutation sweep reads). The page may offer fewer. Every version that is not terrible stays
in it. A version is terrible when the lab's keep rule finds it worse than every other registered
version **and** no item is found by it alone (`mutate.py table`'s "only" line is empty).

The registry defines "never found" for the mutation signal. It is the pool fusion draws from, and
it is where a later idea finds a mechanism that already handles its hard case. A version leaves only
at a refit ([refitting-on-new-ground-truth](../refitting-on-new-ground-truth/SKILL.md) step 1),
when it has become terrible against the newer ground truth, and its ledger line says when it left.
