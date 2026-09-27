## 2026-09-27 · born · the owner asked for the NoR work's method as a general image-algorithm skill (#212)
- **Source:** the owner, in the project thread: "this skill is not for NoR finding - it's for
  working on a image processing algorithms"; then, on review, that the draft restated their notes
  rather than instructing an agent, and four additions: a ledger of directions tried, the review
  render as a fixed API, rotation/skew invariance, and divide and conquer for discrete objects.
  Then the owner's own skill from a bookshelf-OCR project (spine segmentation, OCR, catalogue
  matching), handed over to "critically use it to improve the skill you built here; abstract what
  was too concrete; consider ideas; give per-discipline examples" - merged in as the opening
  question list, tiered grading with greedy pairing, the confirmed / unknowable / scoped answer
  key, noise-aware keep-or-drop, per-stage timings and deployment kept apart, with library and
  project specifics abstracted and examples paired as microscopy vs phone photo.
- **Reason:** the NoR detector's development (versions v1-v4, filters A-J, the labelled lab tool)
  showed which steps need the owner and which can run against ground truth; the owner wanted that
  split kept for the next algorithm.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a workflow skill in the local pack, framed as gates and states so it is picked when
  starting or resuming; triggered by its description, and it points to research-project's rules
  rather than repeating them.
- **Retire when:** the research-project canon pack carries the same cycle.
- **Landed:** #212.
