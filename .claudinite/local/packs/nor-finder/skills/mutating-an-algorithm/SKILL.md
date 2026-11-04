---
name: mutating-an-algorithm
description: Splicing computer-vision tricks from the repo's trick pool into a study's best algorithm, scoring each mutant for any sign of good against ground truth, and growing a signal into a new version. Use when algorithm-ideation picks the mutation route, when a scheduled mutation sweep reports, or when adding a trick to the pool.
metadata:
  body: workflow
  usage:
    expect: judgment
---

# Mutating an algorithm with the trick pool

A mutant is the best version with one trick spliced in. It is not expected to win. It is looking
for **signal**: evidence that the trick did some good that nothing registered does. Signal is the
seed, and the work after it is growing the seed into a version that wins.

## The pool

`dev/tools/trick_pool/` holds two halves, and a test keeps them in step:

- `pool.yaml` is the catalog, a few hundred methods. Each entry says what the method does to the
  picture (`visual`), how it works (`how`), where it is canonically used, which hook it fits
  (`pre`, `map`, `candidates`, `verify`, `post`, `stats`), what its sizes are relative to, how to
  install and invoke it, its docs, its cost, and `try_when`: the symptom that should make you reach
  for it.
- `tricks.py` is the runnable half. Each runnable entry is one function,
  `TRICKS[id](img, unit, **params)`, where every size is a multiple of `unit`, the object scale the
  study measures for itself. `available()` names the module each missing trick needs.

Read the catalog by `try_when` and `hook`, not front to back:

```
python3 -c "import yaml; [print(e['id'], '|', e['hook'], '|', e['try_when']) for e in yaml.safe_load(open('dev/tools/trick_pool/pool.yaml'))]"
```

## 1. Know what "never" and "always" mean here

The signal is measured against the **registry**: every version the study's lab keeps runnable.
Before a sweep, check that every non-terrible version is in the registry
([algorithm-ideation](../algorithm-ideation/SKILL.md) step 4 says which ones stay). A version left
out makes its finds look new.

## 2. Run the sweep

A study supplies an adapter that runs its base with a mutation and hands per-item hit vectors to
`mutation_signal.signal`. The NoR adapter is the example:

```
cd studies/nor/detection && python3 mutate.py sweep --base tl
```

`python3 mutate.py one 'pre:white-tophat@red'` runs a single mutant. `list` shows what can run in
this container. A study without an adapter gets one before its first sweep. The adapter runs the
null mutants (step 3) and takes the three hooks NoR's does: `pre` (transform a channel), `verify:...:reject` (fail the passes lowest on
the trick's map), and `verify:...:rescue` (un-fail the filtered candidates highest on it). Each
threshold is a quantile of the passes' own values, so no constant is tuned to the image.

## 3. Read the signal

`mutation_signal.signal` reports, per mutant:

- `rescued_never`: real items no registered version finds and this mutant does.
- `rejected_always`: false items every registered version keeps and this mutant drops.
- `stats`: how a measured quantity's distribution moved towards the ground truth's (Wasserstein-1
  and the std ratio). It is `None` until the ground truth carries the measurement, and you say so
  rather than read the absence as zero.
- The cost: `lost_real` and `added_false` against the base, and `P(better)` on F1.

**Signal has to beat chance.** When many real items are never found, a mutant that changes
anything flips one or two of them by luck. So a sweep first runs null mutants in every slot: a
random map for a verifier, and for a pre-transform a random blur under a smooth random illumination field, as strong as a real trick but with no idea behind it. It then counts a mutant as signal only
when it rescues or rejects more items than the best null in its slot. Null mutants also show how
wide `P(better)` swings by chance (on NoR's labels a noise mutant reached 0.82), so a mutant's
`P(better)` is read beside its slot's nulls, never alone.

A mutant with signal and a heavy cost is still signal. Look at its sheet (the tiles of the items
behind the signal) before believing it. One rescued item can be a label that is wrong, or a
coincidence of a noisy map. Count it as signal only when the tile shows the trick plausibly saw
something there.

## 4. Grow a signal into a version

Take the mutants with signal, strongest first, and for each one:

1. **Tweak it**: vary the trick's own parameters (in `unit` multiples), the channel, the hook, and
   the quantile, in one small sweep. Keep the variant that keeps the signal at the lowest cost.
2. **Combine signals**: two mutants that rescue *different* items get spliced in together.
3. **Explain it**: write in pseudocode why the trick helped on exactly those items (what it saw that
   the base's own evidence did not). Then write the rule that would act on that alone, without the
   rest of the trick. That rule is the candidate for a new version or a switch in the base, and it
   goes through the inner loop like any other change.
4. **Record every mutant with signal in the ledger**, and record the sweep itself as one line: the
   date, the base, how many ran, and which had signal. Mutants with no signal are recorded only as
   that count. The sweep's `sweep.json` (in its `--out`, by default the gitignored `.cache/mutate/`) is the full record, regenerated rather than
   committed.

## Growing the pool

- **Adding a trick**: add the catalog entry (every field, with `docs` checked against the real
  page), then, when it is cheap to run, the function in `tricks.py` with the `runnable` id in the
  entry. The pool's test fails when a `runnable` id has no function, or a function has no entry.
- **A trick needing a package that is not in `requirements.txt`**: install it ad hoc in the
  session. Each function imports its own packages, so a missing one only marks that trick
  unavailable. A trick that earns a place in a finder brings its package into `requirements.txt` in
  that finder's change, and not before.
- **A `heavy` trick** (torch, model weights, a GPU) stays catalog-only. Run it by hand as a gated
  route (research-project §10), never in the scheduled sweep.
