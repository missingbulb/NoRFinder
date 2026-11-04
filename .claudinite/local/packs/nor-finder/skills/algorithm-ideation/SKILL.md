---
name: algorithm-ideation
description: Finding a genuinely new algorithm when a study's current one is stuck - two iterations without a gain, a failure class every fix trades against another, or the owner asking for a new approach. Names the wall, then runs the four routes to a new version (mutation, child explanation, transformed view, fresh lenses) and hands a near-tie to fusion.
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
- The owner pitches a direction, or asks for a new version.
- The study's scheduled mutation sweep reported signal (its task says which).

## 1. Name the wall, with evidence

Run the lab's comparison and its grade against the labels, then look at the render of the worst
tile. Write the two or three largest failure classes, one line each, with the number that shows
each one: objects the labels have that no version finds, non-objects every version keeps, and the
study's own structural faults. Every direction from here on has to aim at one of them. One that aims
at nothing on the list is a hobby.

Search the ledger for each class first. A direction already tried there is re-run only when the
ledger's "when to revisit" condition now holds.

## 2. Run the routes - at least three, each aimed at a named class

The routes differ in where the idea comes from. Run them in parallel where you can: each one is a
subagent's work or a sweep in the background.

| Route | Where the idea comes from | Skill |
|---|---|---|
| Mutate | One trick from the repo's trick pool, spliced into the best version, scored for *any* good | [mutating-an-algorithm](../mutating-an-algorithm/SKILL.md) |
| Explain to a child | Fresh agents, each under a different constraint, explaining the task step by step without pointing | [explaining-to-a-child](../explaining-to-a-child/SKILL.md) |
| Transformed view | A vision-capable agent solving the task by eye on images a trick has transformed first | [solving-a-transformed-view](../solving-a-transformed-view/SKILL.md) |
| Fresh lenses | The lens table below, one line per lens | - |

Fresh lenses. Write each direction as one line: the mechanism, the failure class it attacks, and
what would kill it. Go through every lens, including the ones that seem not to fit. That is the
point of the exercise.

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
would kill it. Pick the best expected gain per unit of cost. Write *all* of them in the ledger's
ideas table with that estimate, untried ones included, so that the next plateau starts from the
list instead of from nothing.

## 4. Build it as a new version

A new direction is a new version registered in the lab, never an edit of an older version. Build
it until it runs on one input. Then run the lab's comparison and grade against every older version,
render the comparison, and record the verdict in the ledger's versions table.

- **It wins**: it becomes the base for the next round of the inner loop.
- **It ties the best within noise while working differently** (a different unit of decision or
  different evidence): go to [fusing-algorithms](../fusing-algorithms/SKILL.md).
- **It loses**: keep it as a file and a ledger line saying where it lost and when to revisit it.
  Unless it is *terrible* - beaten by the study's naive baseline, with no item that only it finds -
  it stays registered in the lab. The registry is what the mutation signal measures "never found
  before" against, and what fusion draws from.
