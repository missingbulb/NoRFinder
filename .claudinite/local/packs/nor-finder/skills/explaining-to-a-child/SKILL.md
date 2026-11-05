---
name: explaining-to-a-child
description: Getting genuinely new algorithm directions by having fresh subagents, each under a different constraint, explain to a five-year-old how to solve the visual task from the raw image, without pointing - then turning the best explanations into pseudocode and code. Use when algorithm-ideation picks this route, or before rebuilding a candidate generator.
metadata:
  body: workflow
  usage:
    expect: judgment
---

# Explaining the task to a child

Five agents asked the same question give one answer five times. So each explainer gets a
different **constraint**, and none of them sees the current algorithm.

## 1. Prepare what the explainers see

- **The task**, as the object's composition and arrangement only (NoR: the "Shape" and
  "Structure" bullets of `studies/nor/docs/requirements.md` R7). Never a threshold, a check letter
  or a number from the study's rules, and never the code, the ledger or a version's name. An
  explainer that knows the current approach explains that approach.
- **Tiles of the raw input**, over real objects and over the wall's failure class, unmarked, in the
  input's native colours. On NoR:

  ```
  cd studies/nor/detection && python3 mutate.py view raw --out .cache/views
  ```

  Its first tiles hold the hard cases: real items no version finds, then false ones every version
  keeps.

## 2. Run five explainers, in parallel, each with its own constraint

Give each subagent the brief below with one rule from this list. Pick the five that fit the study,
or invent ones in the same spirit:

- the child may only measure lengths and angles, with a ruler and a pencil
- the child sees the picture only through a hole the size of one object, and must move it
- the child may only say which colour is where and how strong it is, never what shape
- the child may paint over the picture or cut pieces out, as many times as needed
- the child may only decide by asking "is this like the thing next to it?"
- the child starts from the whole picture blurred and works inward
- the child's answer has to come from counting something

```
Claude wrote this brief for another agent: examine anything in it that seems inconsistent, and
don't follow it blindly.

You are explaining to a five-year-old how to find <the object, in composition and arrangement
words> in these pictures: <the tile PNG paths; view each with the Read tool>. Use only these
pictures and this text; open no other file in this repository. You cannot point, and you cannot
use technical words. The rule for the child: <constraint>. Write the numbered steps the child
follows, starting from the plain picture, in words concrete enough that they could draw what each
step produces. Then give, for each step, one line of pseudocode a programmer could implement with
ordinary image operations. End with the one way your method would get it wrong. Tiles <n, m> are
hard cases: say what your steps do there.
```

## 3. Score the explanations before coding any

Drop the explanations that restate the current version. For each of the rest, make
[algorithm-ideation](../algorithm-ideation/SKILL.md) step 3's estimate: the failure class from the
ideation wall it targets, how many of those items it could recover, its cost, and its kill test.
Then add whether its own stated failure mode is one the study already handles. Every explanation
goes in the ledger's table of untried ideas, the ones not coded included, with the constraint that
produced it.

## 4. Translate the best one or two into versions

Implement the pseudocode literally first, as a new version in the lab's registry (NoR:
`nor_lab.finders()`), kept out of the page's list until it wins. The literal version is the
measurement of the idea: improving it first would measure your improvements instead. Score it
against the registry:

```
cd studies/nor/detection && python3 nor_lab.py cmp tl rf <new> && python3 nor_lab.py ablate tl <new>
```

- It wins, or lands within noise of the best (no evidence either way by the keep rule in image-algorithm-development State 4):
  run the mutation sweep with it as base ([mutating-an-algorithm](../mutating-an-algorithm/SKILL.md)).
- It ties by a different unit of decision or different evidence: go to
  [fusing-algorithms](../fusing-algorithms/SKILL.md).

When a round gives nothing new, run five more constraints rather than re-asking the same five. A
round is worth something only if it differs from the last.
