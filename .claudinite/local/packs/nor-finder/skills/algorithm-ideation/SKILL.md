---
name: algorithm-ideation
description: Finding a genuinely new algorithm when a study's current one is stuck - two iterations without a gain, a failure class every fix trades against another, or the owner asking for a new version. Names the wall, then runs the four routes to a new version (mutation, child explanation, transformed view, fresh lenses) and hands a near-tie to fusion.
metadata:
  body: workflow
  usage:
    expect: judgment
---

# Finding a new algorithm when the current one is stuck

[image-algorithm-development](../image-algorithm-development/SKILL.md) runs the loop that keeps or
drops a change. This skill is for the moment that loop stops paying, and its job is to stop the next
idea being the last idea with a different constant. Tuning a parameter
([tuning-parameters](../tuning-parameters/SKILL.md)), making it faster
([speeding-up-an-algorithm](../speeding-up-an-algorithm/SKILL.md)) and refitting on new labels
([refitting-on-new-ground-truth](../refitting-on-new-ground-truth/SKILL.md)) are not this skill.

Each study keeps its versions side by side, with a lab that runs and scores them all and a ledger of
every direction, tried or not. The study's warm-up names both, and below, "the lab" and "the ledger"
mean the study's own.

## When

- Two iterations of the current version without a gain beyond noise.
- A failure class that every fix trades against another (fixing one error class loses real objects).
- The owner asks for a new version. A direction the owner pitches skips step 2: estimate it beside
  the ledger's untried ideas (step 3) and build it (step 4).

## 1. Name the wall, with evidence

Score every registered version against the labels with the lab, then look at the render of the
worst input or region. Write the two or three largest failure classes, one line each, with the number that shows
each one: objects the labels have that no version finds, non-objects every version keeps, and the
study's own structural faults. Every direction from here on has to aim at one of them.

Search the ledger for each class first. A direction already tried there is re-run only when the
ledger's "Revisit if" condition now holds.

## 2. Run the routes - at least three, each aimed at a named class

The routes differ in where the idea comes from. Run them in parallel where you can: each one is a
subagent's work or a sweep in the background.

| Route | Where the idea comes from | Skill |
|---|---|---|
| Mutate | Every runnable trick in the repo's trick pool, one per mutant, spliced into the best version and scored for *any* good | [mutating-an-algorithm](../mutating-an-algorithm/SKILL.md) |
| Explain to a child | Fresh agents, each under a different constraint, explaining the task step by step without pointing | [explaining-to-a-child](../explaining-to-a-child/SKILL.md) |
| Transformed view | A vision-capable agent solving the task by eye on images a trick has transformed first | [solving-a-transformed-view](../solving-a-transformed-view/SKILL.md) |
| Fresh lenses | The lens table below, one line per lens | - |

Fresh lenses. Write each direction as one line: the mechanism, the failure class it attacks, and
what would kill it. Go through every lens, including the ones that seem not to fit.

| Lens | Question |
|---|---|
| Change the unit of decision | Does the current version decide per pixel, per skeleton branch, per curve or per graph? What becomes easy one level up or down? |
| Flip the direction | Bottom-up (threshold, then join) against top-down (propose a structure, then check it against the pixels); local against global; deleting against growing. |
| Use the invariants to generate, not only to filter | Use a rule from the study's own domain, taken from its literature notes, to *propose* candidates rather than only to reject them. |
| Change the evidence | The flattened picture against the 3D stack; one scale against several; intensity against orientation; one channel against two. |
| Borrow from a neighbouring field | Roads in satellite images, neuron tracing, river networks, crack detection, particle tracking. What does that field's standard method assume, and does that hold here? |
| Optimise the score directly | The score is an objective: search over edits (greedy, annealing, a graph cut) instead of hand-ordered rules. |

## 3. Narrow by evidence, not by taste

For every direction the routes produced, estimate three things: how many items of its target class
it could recover (check a few on the render), what it costs to build, and the cheapest test that
would kill it. Pick the best expected gain per unit of cost. Write *all* of them in the ledger's table of untried
ideas (create it where the ledger has none), one row each: the direction, its route or lens, the
class it targets, the items it could recover, its cost and its kill test. The next plateau then
starts from the list instead of from nothing.

## 4. Build it as a new version

A new direction is a new version registered in the lab, never an edit of an older version. Build
it until it runs on one input, then score it on every input against every registered version,
render the comparison, and record the verdict in the ledger's table of versions (create it where
the ledger has none). The verdict is the lab's keep rule:

- **It wins**: it becomes the base. Tune it ([tuning-parameters](../tuning-parameters/SKILL.md)),
  then run the mutation sweep with it as base ([mutating-an-algorithm](../mutating-an-algorithm/SKILL.md)).
- **It ties the best within noise while working differently** (a different unit of decision or
  different evidence): go to [fusing-algorithms](../fusing-algorithms/SKILL.md).
- **It ties by the same mechanism**: the incumbent stays, and the ledger line says so.
- **It loses**: keep it as a file and a ledger line saying where it lost and when to revisit it. It
  stays registered unless it is terrible ([fusing-algorithms](../fusing-algorithms/SKILL.md) §4
  defines terrible and owns the registry).
