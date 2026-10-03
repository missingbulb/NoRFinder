# Improve the finders on the ground truth just added

The ground truth people submitted from the NoR Finder page was added to `detection/lab/ground_truth/`
on the pull request named under "Delivered by code-work", with the quality baseline re-recorded
against it. Work on that pull request's branch and push onto it; never open another, never merge.

Follow the [improve-on-ground-truth](../../skills/improve-on-ground-truth/SKILL.md) skill: re-score
every finder on every ground-truth image and report how each changed from the base branch, then
make the finders propose candidates at the newly marked missing NoRs, then improve overall quality.

- A change that loses a real NoR, passes a new not-NoR or stops proposing a candidate at a missing
  mark is not yours to accept: leave it out, or describe it in the pull request for the owner.
- When nothing you tried kept its gains, say so in the pull request with what you tried; the ground
  truth it adds stands on its own.
- Add your report to the pull request's body below what is already there, and log every attempt in
  `detection/lab/ledger.md`.
