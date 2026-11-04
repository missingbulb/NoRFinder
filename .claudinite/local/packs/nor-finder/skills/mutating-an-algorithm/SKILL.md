---
name: mutating-an-algorithm
description: Splicing computer-vision tricks from the repo's trick pool into a study's best algorithm, scoring each mutant for any sign of good against ground truth above a chance bar, and growing a signal into a new version. Use when running a study's mutation sweep (by hand or from its scheduled task), when algorithm-ideation picks the mutation route, or when adding a trick to the pool.
metadata:
  body: workflow
  usage:
    expect: judgment
---

# Mutating an algorithm with the trick pool

A mutant is the best version with one trick spliced in. It is not expected to win. It is looking
for **signal**: evidence that the trick did some good that nothing registered does, by more than
chance. Signal is the seed, and the work after it is growing the seed into a version that wins.

## The pool

`dev/tools/trick_pool/` holds two halves, and its test keeps them in step:

- `pool.yaml` is the catalog. Each entry says what the method does to the picture (`visual`) and
  how it works. It also gives where the method is used, its catalog `hook` (`pre`, `map`,
  `candidates`, `verify`, `post`, `stats`), what its sizes are relative to, and how to install and
  invoke it, with its docs and its cost. Last comes `try_when`: the symptom that should make you
  reach for it.
- `tricks.py` is the runnable half. Each runnable entry is one function,
  `TRICKS[id](img, unit, **params)`. Every size is a multiple of `unit`, the object scale the study
  measures for itself. The parameter names are the function's keyword arguments.

Search the catalog by symptom or hook, from the repo root:

```
python3 -c "import sys, yaml; [print(e['id'], '|', e['hook'], '|', e['try_when'].strip()) for e in yaml.safe_load(open('dev/tools/trick_pool/pool.yaml')) if sys.argv[1] in (e['try_when'] + e['hook'])]" background
```

## 1. Check the registry

The signal is measured against the **registry**, which
[fusing-algorithms](../fusing-algorithms/SKILL.md) §4 owns. The sweep's first line names the
versions it read. A non-terrible version missing from it makes its finds look new.

## 2. Run the sweep

A study supplies an adapter that runs its base with a mutation and hands per-item hit vectors to
`mutation_signal.signal`. The NoR adapter is the example:

```
cd studies/nor/detection && python3 mutate.py sweep --base tl
```

It writes `.cache/mutate/sweep.json` (gitignored). For each flagged mutant it also writes a sheet,
`.cache/mutate/<spec with : and @ as _>.png`. `python3 mutate.py list` shows which tricks run in
this container. A study without an adapter gets one before its first sweep.

The adapter places each trick in three **slots**:

- `pre:<trick>@<chan>` transforms a channel before the base runs.
- `verify:<trick>@<chan>:reject` fails the passes lowest on the trick's output.
- `verify:<trick>@<chan>:rescue` un-fails the filtered candidates highest on it.

A `verify` slot takes any runnable trick's output as its map, whatever the trick's catalog hook.
Its threshold is a quantile of the passes' own values, so no constant is tuned to the image.

## 3. Read the signal

Per mutant, `mutation_signal.signal` reports:

- `rescued_never`: real items no registered version finds, and this mutant does.
- `rejected_always`: false items every registered version keeps, and this mutant drops.
- the cost: `lost_real` and `added_false` against the base, and `P(better)` on F1.

**Signal has to beat chance.** When many real items are never found, a mutant that changes anything
flips one or two of them by luck. So the sweep first runs null mutants in every slot:

- for a verifier, a random map
- for a pre-transform, a random blur under a smooth random illumination field, as strong as a real
  trick but with no idea behind it

A mutant is flagged only when it rescues or rejects more items than the best null in its slot. The
nulls also show how far `P(better)` swings by chance (on NoR's labels a noise mutant reached 0.82).
So read a mutant's `P(better)` beside its slot's nulls, never alone.

`stats` gives the Wasserstein-1 distance and the std ratio of a measured quantity against the
ground truth's. It is reported but never flags a mutant: scan `sweep.json` for `w1_mutant` below
`w1_base`, and promote such a mutant by hand. It is `None` until the ground truth carries the
measurement. Say so, rather than reading the absence as zero.

Look at a flagged mutant's sheet before believing it. One rescued item can be a wrong label, or a
noisy map's coincidence. Count it only when the tile shows the trick plausibly saw something there.
Several unrelated mutants rejecting the *same* item are one piece of evidence, not several.

## 4. Grow a signal into a version

Take the flagged mutants, strongest first, and for each one:

1. **Tweak it** in one small run of `one`. Vary the trick's parameters (in `unit` multiples), the
   channel, the slot and the quantile:

   ```
   cd studies/nor/detection && python3 mutate.py one 'verify:unsharp-mask(r_u=1.5)@red:reject=0.2'
   ```

   `one` reads the chance bar from the last sweep in its `--out`, and says so when there is none.
   Keep the variant that keeps the signal at the lowest cost. A signal that does not move with the
   trick's parameters may not come from the trick: try a near-identity version in the same slot.
2. **Combine signals**: splice in together two mutants that rescue *different* items.
3. **Explain it**: write in pseudocode why the trick helped on exactly those items, meaning what it
   saw that the base's own evidence did not. Then write the rule that would act on that alone. That
   rule is the candidate for a switch in the base or for a new version.
4. **Hand it on**:
   - The rule goes through
     [image-algorithm-development](../image-algorithm-development/SKILL.md)'s inner loop.
   - A new version that ties the best by a different mechanism goes to
     [fusing-algorithms](../fusing-algorithms/SKILL.md).
   - A map that plainly helps but resists every rule goes to
     [solving-a-transformed-view](../solving-a-transformed-view/SKILL.md), with that trick as a view.

Record the sweep in the ledger as one line: the date, the base, how many mutants ran, the chance
bar, how many were flagged, and the wall-clock. Record every grown mutant with its numbers, and list
the flagged ones not grown with a one-line reading each.

## Growing the pool

- **Adding a trick**: add its catalog entry with the fields `test_pool.py` asserts, with `docs`
  checked against the real page. Where it is cheap to run, add the function in `tricks.py` and put
  its id in the entry's `runnable`. The test fails when a `runnable` id has no function, or a
  function has no entry:

  ```
  python3 -m pytest dev/tools/trick_pool -q
  ```

- **A trick needing a package not in `requirements.txt`**: install the package ad hoc in the
  session. Each function imports its own packages, so a missing one only marks that trick
  unavailable. The scheduled sweep runs on `requirements.txt` alone, so it skips the trick. A trick
  that earns a place in a finder brings its package into `requirements.txt` with that finder's
  change.
- **A `heavy` trick** (torch, model weights, a GPU) stays catalog-only. Run it by hand as a gated
  route (research-project §10).
