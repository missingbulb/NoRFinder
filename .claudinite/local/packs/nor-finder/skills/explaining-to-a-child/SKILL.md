---
name: explaining-to-a-child
description: Getting genuinely new algorithm directions by having fresh subagents, each under a different constraint, explain to a five-year-old how to solve the visual task from the raw image, without pointing - then turning the best explanations into pseudocode and code. Use when algorithm-ideation picks this route, or before rebuilding a candidate generator.
metadata:
  body: workflow
  usage:
    expect: judgment
---

# Explaining the task to a child

Someone who cannot point has to say what makes the object the object. Saying that to a child forces
the steps to be concrete enough to draw, and a step that can be drawn can be coded. The danger is
sameness: five agents asked the same question give one answer five times. Each explainer therefore
gets a different **constraint**, and none of them sees the current algorithm.

## 1. Prepare what the explainers see

- The task, in the study's requirement words: what counts as an object, from its requirements
  document. Never the code, the ledger or the current version's name. An explainer that knows the
  current approach explains that approach.
- Two or three rendered tiles of the raw input with real objects in them, and one tile of the
  wall's failure class (a missed object, or a false one every version keeps), unmarked. Render
  them with the study's own render at the input's native colours.

## 2. Run five explainers, in parallel, each with its own constraint

Give each subagent the brief below with one constraint from this list. Pick the five that fit the
study, or invent ones in the same spirit:

- **Only a ruler and a pencil**: the child may measure lengths and angles, nothing else.
- **A tiny window**: the child sees the picture only through a hole the size of one object, and must
  move it.
- **Only colours**: the child can say which colour is where, and how strong it is, never what shape.
- **Paint and scissors**: the child may paint over the picture or cut pieces out, as many times as
  needed.
- **Comparing neighbours only**: every decision is "is this like the thing next to it?"
- **From far away first**: the child starts from the whole picture blurred and works inward.
- **Counting game**: the answer has to come from counting something.

```
Claude wrote this brief for another agent: examine anything in it that seems inconsistent, and
don't follow it blindly.

You are explaining to a five-year-old how to find <the object, in the requirement's words> in
these pictures. You cannot point, and you cannot use technical words. The child has <constraint>.
Write the numbered steps the child follows, starting from the plain picture, in words concrete
enough that they could draw what each step produces. Then give, for each step, one line of
pseudocode a programmer could implement with ordinary image operations. End with the one way your
method would get it wrong. Look at every tile before you write; the last tile is a hard case, so
say what your steps do there.
```

## 3. Score the explanations before coding any

Read the five side by side. For each one, write down which failure class from the ideation wall it
could fix, whether it differs from the current version in its unit of decision or in its evidence,
and whether its own stated failure mode is one the study already handles. Drop the explanations that
restate the current version.

## 4. Translate the best one or two into versions

Implement the pseudocode literally first, as a new version in the lab, before improving any step.
The literal version is the measurement of the idea, so improving it first measures your
improvements instead. Then grade it against the registry with the lab's comparison, and run the
mutation sweep on it as the base when it lands near the best
([mutating-an-algorithm](../mutating-an-algorithm/SKILL.md)). Record all five explanations in the
ledger's ideas table, including those not coded, with the constraint that produced each.

When the first round gives nothing new, run five more constraints rather than re-asking the same
five. A round's value is in being different from the last.
