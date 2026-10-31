---
name: algorithm-ideation
description: Finding a genuinely new direction before building a study's next algorithm version - when the current one plateaus, or the owner asks for a new approach.
metadata:
  body: workflow
  usage:
    expect: judgment
---

# Finding a new direction for a study's algorithm

[image-algorithm-development](../image-algorithm-development/SKILL.md) runs the loop that keeps or
drops a change; this skill is the step before a new *version*, when patching the current one has
stopped paying. Its job is to stop the next idea being the last idea with a different constant.
Each study keeps its versions side by side, with a lab that runs and scores them all and a ledger
of every direction, tried or not; the study's warm-up names both, and below "the lab" and "the
ledger" are the study's own.

## When

- Two iterations of the current version without a gain beyond noise on the grade or the score.
- A failure class that every fix trades against another (fixing one error class loses real objects).
- The owner pitches a direction, or asks for a new version.

## 1. Name the wall, with evidence

Run the lab's comparison and its grade against the labels, and look at the render of the worst tile. Write the two or
three largest failure classes as one line each, with the number that shows them (objects the
labels have that no version finds; non-objects kept; the study's own structural faults). A new
direction has to aim at one of them; one that aims at nothing on the list is a hobby.

## 2. Widen: at least six directions from at least four lenses

Write each direction as one line: the mechanism, the failure class it attacks, and what would
kill it. Go through every lens, even the ones that seem not to fit; that is the point.

| Lens | Question |
|---|---|
| Explain it to a child | How would you find the object in this picture by hand, in steps concrete enough to draw? Implement that, not a patch of the current one. |
| Change the unit of decision | Does the current version decide per pixel, per skeleton branch, per curve or per graph? What becomes easy one level up or down? |
| Flip the direction | Bottom-up (threshold, then join) against top-down (propose a network, then check it against the pixels); local against global; deleting against growing. |
| Use the invariants to generate, not only to filter | A rule of the study's biology, from its literature notes, used to *propose* candidates (grow a branch where Murray and the taper say one must leave) rather than to reject them. |
| Change the evidence | The flattened picture against the 3D stack; one scale against several (a filter at each object width); intensity against orientation; one channel against two. |
| Borrow from a neighbouring field | Roads from satellite images, neuron tracing (minimal paths, tree growing), river networks, crack detection, particle tracking along a curve. What does that field's standard method assume, and does it hold here? |
| Optimise the score directly | The score is an objective: search over graph edits (greedy, annealing, a graph cut) instead of hand-ordered rules. |
| Combine | Two existing versions vote, or one proposes and another verifies. |

## 3. Narrow by evidence, not by taste

For each direction estimate how many items of the largest class it could recover (look at a few on
the render), what it costs to build, and the cheapest test that would kill it. Pick the one with
the best expected gain per cost; write all of them in the ledger's ideas table with that estimate,
the untried ones too, so the next plateau starts from the list instead of from nothing.

## 4. Build it as a new version

A new direction is a new version registered in the lab, never an edit of an older version: the
older one stays runnable for inspiration. Build until it runs on one stack, then run the lab's comparison and
grade against every older version, render the comparison, and record the verdict in the
ledger's versions table. A direction that loses is kept as a file and a ledger line saying where it
lost and when to revisit it.
