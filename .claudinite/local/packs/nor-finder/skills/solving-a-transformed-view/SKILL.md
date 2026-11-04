---
name: solving-a-transformed-view
description: Running a computer-vision trick on a study's images, then having a vision-capable subagent solve the detection task by eye on the transformed views, scoring its marks against ground truth and mining how it decided into a new algorithm. Use when algorithm-ideation picks this route, or when a mutation's map looks informative but no rule over it has worked.
metadata:
  body: workflow
  usage:
    expect: judgment
---

# Solving the task on a transformed view

A trick can make an object obvious to an eye while no rule over its output has been found yet. A
vision-capable agent that marks objects well on a transformed view proves the information is there,
and its account of how it decided is a rule nobody has written. The raw view is the control: a
transformed view earns attention only by beating the raw one.

## 1. Choose the views

Pick three to five tricks from the trick pool (`dev/tools/trick_pool/pool.yaml`). Choose them by
`try_when` against the wall's failure class, plus any mutant with signal from the last sweep, plus
the raw view as the control. Prefer tricks from different families: a background remover, a ridge
or blob map, and a texture or symmetry map see different things.

## 2. Render the tiles

Render the same tiles in every view: the region holding the wall's failure class, plus a region of
plain successes. Draw a coordinate grid on each, so an agent can name a position without pointing.
The NoR adapter does this:

```
cd studies/nor/detection && python3 mutate.py view raw white-tophat frangi-vesselness --out .cache/views
```

It writes `.cache/views/<view>/tile_<n>.png` and a `tiles.json` holding each tile's offset and zoom,
which is how marks map back to image coordinates.

## 3. Have a fresh agent solve each view

Give one subagent per view only that view's tiles, never the raw view next to a transformed one,
never the labels and never the current algorithm. Use this brief:

```
Claude wrote this brief for another agent: examine anything in it that seems inconsistent, and
don't follow it blindly.

These tiles show <the object, in the requirement's words>, after the image was processed by
<trick name: its `visual` line from the pool>. Find every object in every tile. Write JSON to
<path>: {"marks": [{"tile": n, "x": gx, "y": gy, "sure": 0..1}]}, with x and y in the tile's grid
units. Then write, in numbered steps, how you decided what was an object and what was not - what
you looked at first, what made you reject a near miss - concretely enough that someone could write
a program from your steps.
```

## 4. Score the marks, then mine the winner

Score each view's marks against the ground truth with the same grader the lab uses:

```
cd studies/nor/detection && python3 mutate.py marks .cache/views/<view>/marks.json --tiles .cache/views/tiles.json
```

Compare every view against the raw view's agent, item by item:

- **A view whose agent finds items the raw view's agent misses** has information the algorithm
  ignores. Its decision steps are the material: write them as pseudocode, and build that as a new
  version through [explaining-to-a-child](../explaining-to-a-child/SKILL.md) step 4 (implement it
  literally first).
- **A view whose agent rejects false items the registry keeps** has a verification rule. Try that
  rule as a `verify` mutation over the same trick
  ([mutating-an-algorithm](../mutating-an-algorithm/SKILL.md)).
- **No view beats the raw one**: the trick does not help an eye either. Note that in the trick's
  ledger line and choose differently next time.

Even the best agent's marks are a reference point, not ground truth. They score the information in
a view, and never label anything.
