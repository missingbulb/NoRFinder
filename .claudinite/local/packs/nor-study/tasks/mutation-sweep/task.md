# Sweep the trick pool over the NoR finder

Follow the [mutating-an-algorithm](../../../nor-finder/skills/mutating-an-algorithm/SKILL.md) skill
on the NoR study, with the default finder (`studies/nor/detection/STATE.md` names it) as the base.

1. Set up as the warm-up says (`studies/nor/detection/STATE.md`, Setup), then run the sweep:

   ```
   cd studies/nor/detection && python3 mutate.py sweep
   ```

2. Read the signal and the sheets as the skill's step 3 says, and grow the strongest one to three
   mutants with signal as its step 4 says. A grown rule lands as a switch that is off by default,
   with its ablation numbers. Never change a finder's defaults, and never accept a quality-lock loss.
3. Record the sweep and every mutant with signal in `studies/nor/detection/lab/ledger.md`. Search
   the ledger first: a signal already recorded from an earlier sweep is re-reported only when it
   has grown or changed.
4. Open a pull request with the ledger entry and any switch, and never merge it. Its body leads with
   the sweep's table of mutants with signal, then the tiles of the strongest, then what was grown and
   how it scored. When no mutant had signal, the pull request carries only the ledger's one-line
   sweep record.
