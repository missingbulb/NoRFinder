## 2026-09-15 · born · the owner overrode a synthetic test field for real images (#92)
- **Source:** issue #10 (2026-09-04), the conversation that built the transform-invariance harness:
  the agent proposed a synthetic Caspr-Nav-Caspr field, and the owner answered "use images from the
  uplaoded articles or samples, and if you cant - create fake data".
- **Reason:** real samples exercise failure modes a synthetic field can't reproduce - saturation,
  JPEG compression, cross-paper contrast conventions - and the default had been recorded nowhere.
- **Actor:** the growth-extract task run, merged by @missingbulb (owner).
- **Mechanism:** a RULES.md rule in this repo's local pack; prose, because it is a judgment default
  with no static signature to check against (the run's prose-to-checks pass).
- **Retire when:** the corpus stops growing from external sources and every harness build already
  has a same-regime real sample on hand as a matter of course.
- **Landed:** Refs #89 · #92.

## 2026-09-27 · retired · superseded by the canon's own rule (#201)
- **Source:** growth-dedup run against the mounted canon.
- **Reason:** `.claudinite/shared/packs/research-project/RULES.md` now carries the identical rule
  verbatim, plus the "why" clause this local copy lacked ("A synthetic image is built from the same
  assumptions the algorithm makes, so it tends to confirm the algorithm rather than test it.") —
  the local copy only restated the canon in this repo's own names.
- **Actor:** the growth-dedup task run.
- **Model:** Sonnet 5, per the session's model identity.
- **Landed:** Refs #201.
