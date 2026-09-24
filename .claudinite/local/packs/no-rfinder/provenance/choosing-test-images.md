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
