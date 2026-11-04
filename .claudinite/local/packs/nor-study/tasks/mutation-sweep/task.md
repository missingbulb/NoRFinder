# Sweep the trick pool over the NoR finder

Follow the [mutating-an-algorithm](../../../nor-finder/skills/mutating-an-algorithm/SKILL.md) skill
on the NoR study. The base is the default finder that `studies/nor/detection/STATE.md` names.

1. Set up, then run the sweep with that finder's spec as the base:

   ```
   python3 -m pip install -r requirements.txt
   ```

   ```
   python3 studies/nor/detection/ground_truth.py fetch
   ```

   ```
   cd studies/nor/detection && python3 mutate.py sweep --base <the default finder's spec>
   ```

2. Read the signal as the skill's step 3 says. Then read `studies/nor/detection/lab/ledger.md` §6
   (mutation sweeps): a flagged mutant already recorded there is grown again only when its recorded
   condition now holds. Otherwise report it as unchanged, with that condition.
3. Grow the strongest one to three new flagged mutants as the skill's step 4 says. A grown rule
   lands as a switch that is off by default, or as a new finder in `nor_lab.finders()` kept off the
   page, each with its ablation numbers. Never change a finder's default, and never accept a
   quality-lock loss.
4. Record the sweep and every grown mutant in the ledger's §6, with the sweep's wall-clock.
5. Open a pull request with the ledger entry and any switch or finder, and never merge it. Its body
   leads with the sweep's table of flagged mutants, then the item ids behind the strongest, then what
   was grown and how it scored. Say beside the numbers that they are on the lab's labels
   (`lab/labels_claude_v1.json`, Claude's eye), a proxy wherever no submitted ground truth covers the
   image. When nothing was flagged, the pull request carries only the ledger's one-line sweep record.
