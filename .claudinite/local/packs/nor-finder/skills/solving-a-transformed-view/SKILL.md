---
name: solving-a-transformed-view
description: Running a computer-vision trick on a study's images, then having a vision-capable subagent solve the detection task by eye on the transformed views, scoring its marks against ground truth and mining how it decided into a new algorithm. Use when algorithm-ideation picks this route, or when a trick's map looks informative but no rule over it has worked.
metadata:
  body: workflow
  usage:
    expect: judgment
---

# Solving the task on a transformed view

A vision agent that marks objects better on a transformed view than on the raw one proves the trick
exposes information, and its account of how it decided is a rule nobody has written. The raw view
is the control.

## 1. Choose the views

Pick three to five tricks that can run here (`python3 studies/nor/detection/mutate.py list` marks
them `ok`), choosing by their `try_when` in `dev/tools/trick_pool/pool.yaml` against the wall's
failure class. Add the trick behind any mutant with signal from the last sweep (the id between `:`
and `@` in its spec), and always include `raw`. Prefer tricks from different families: a
background remover, a ridge or blob map, and a texture or symmetry map see different things.

## 2. Render the tiles

```
cd studies/nor/detection && python3 mutate.py view raw white-tophat frangi-vesselness --out .cache/views
```

It renders the same six tiles in every view. They sit over the real items no registered version
finds first, then the false ones every version keeps, then plain successes if room is left. Each
has a grid labelled in tile pixels. It writes `.cache/views/<view>/tile_<n>.png` and
`.cache/views/tiles.json`, which maps marks back to image coordinates.

## 3. Have a fresh agent solve each view

Give one subagent per view that view's tiles only. Never put the raw view beside a transformed one,
never give it the labels, and never give it the current algorithm. Use this brief:

```
Claude wrote this brief for another agent: examine anything in it that seems inconsistent, and
don't follow it blindly.

These tiles (<the tile PNG paths>; view each with the Read tool) show <the object, in words
describing its composition and arrangement only - no thresholds, check letters or numbers from
the study's rules>, after the image was processed by <trick name: its `visual` line from the
pool>. Read nothing else in the repository.

Find every object in every tile. First write JSON to .cache/views/<view>/marks.json:
{"marks": [{"tile": n, "x": gx, "y": gy, "sure": 0..1}]}. x and y are the numbers printed on the
grid lines (0-159 along each edge of a tile), never the PNG's own pixels. Use sure >= 0.5 for a
mark you would count. Then, in at most 8 numbered steps, say how you decided what was an object
and what was not, concretely enough that someone could write a program from your steps.
```

## 4. Score the marks, then mine the winner

```
cd studies/nor/detection && python3 mutate.py marks .cache/views/<view>/marks.json --tiles .cache/views/tiles.json
```

It prints the agent's tp and fp on the labelled items inside the tiles, and for each registry
version (every version the lab keeps runnable) how many real items the agent found that the version
misses. Marks under sure 0.5 are not scored. Unlabelled spots count for nothing, so a low fp proves
little. Compare the views on those numbers:

- **A view whose agent finds more real items than the raw view's agent** carries information the
  algorithm ignores. Its decision steps are the material: write them as pseudocode, and build that
  as a new version through [explaining-to-a-child](../explaining-to-a-child/SKILL.md) step 4
  (implement it literally first).
- **A view whose agent rejects false items the registry keeps** has a verification rule. When the
  rule is "the map is low over the candidate", run it as
  `python3 mutate.py one 'verify:<trick>@<chan>:reject'`
  ([mutating-an-algorithm](../mutating-an-algorithm/SKILL.md)). A rule of any other shape lands as a
  switch in the base and is ablated.
- **No view beats the raw one**: the trick does not help an eye either.

Record the run in the ledger as one table (view, agent tp/fp, real items found that the base
misses), with the best agent's decision steps beside it, whatever the outcome. Even the best agent's
marks score the information in a view; they never label anything.
