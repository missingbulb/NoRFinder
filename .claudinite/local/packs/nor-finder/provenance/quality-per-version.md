## 2026-11-07 · born · an algorithm's quality is recorded per version, not re-checked by tests
- **Source:** the owner: "algorithms should only change on a dedicated effort to make that change,
  which isn't a regular PR … once these values of precision and recall are locked down for a
  specific version of the algorithms, we don't really need to make sure that the algorithms are
  still okay."
- **Actor:** @missingbulb (owner).
- **Mechanism:** prose in the repo's pack, naming the canon rule it overrides here; the owner
  declined a guard pinning output per version.
- **Rejected:** an output hash pinned per version on a drawn image (owner: no guard).
- **Retire when:** algorithm changes happen in regular pull requests.
