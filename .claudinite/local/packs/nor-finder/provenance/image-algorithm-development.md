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

## 2026-09-28 · merged · the NoR work's keep/drop, lost-list and perf learnings folded in (#221)
- **Source:** the owner, on #221: "Is nor-detection-iteration needed with the existence of
  image-algorithm-development? Shouldn't your specific learnings be added to the existing skill?"
  The NoR-specific skill written in the project was dropped; its generic lessons land here and its
  NoR facts in docs/requirements.md R7.
- **Reason:** the 2026-09-27 round showed what the skill lacked: a stated keep/drop rule (paired
  bootstrap, P(better) 0.8/0.2), every change landed as a switch and ablated alone (the owner's
  rectangle rule lost on data), the lost-list method, hashing real outputs with min-of-runs timing
  (a float32 speed-up changed ties), and the render function as the only definition of the format (a
  stale note once changed it).
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** additions to the existing workflow skill's State 4, render and performance
  sections, and to its resume line: a committed state file, never a project side folder.
- **Landed:** #221.

## 2026-10-07 · strengthened · the performance pass measures peak memory beside time
- **Source:** the owner, in the project thread on the page's memory after Find candidates: "add this
  'peak RAM' measurement to the regularly running algorithms performance improvements skill".
- **Reason:** traffic light's 248 MB peak stayed with the browser tab after every run (WebAssembly
  memory never shrinks), and the time-only performance pass could not see it; freeing arrays halved
  it with identical output.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a bullet in the skill's performance section, and `detection/perf.py` recording the
  peak (tracemalloc) in every snapshot and check.

## 2026-10-11 · scope-changed · the NoR study moved under studies/nor/
- **Reason:** the repo now holds one page and several studies; the paths this element names moved
  with the NoR study.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** the same carrier, its paths repointed.

## 2026-11-04 · split · the performance pass left for speeding-up-an-algorithm; the section now maps the neighbouring skills
- **Source:** the owner, in this session: "When you reach a point where you're stuck and a given
  algorithm gives you suboptimal results - you need to try something new", naming five routes
  (mutate with a CV trick from a large pool, explain to a 5-year-old, a CV operation then a vision
  model, fuse algorithms that tie) and asking that tuning, performance and refitting each get a
  skill, predictably executed.
- **Reason:** performance is its own process with its own trigger; this skill keeps the loops and
  points at each neighbour at its moment.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5

## 2026-11-04 · reworded · review findings applied
- **Reason:** a review of the skill against Anthropic's skill best practices, the house style and
  the code found missing invocations, rules owned twice and hand-offs the family lacked; applied.
- **Actor:** @missingbulb (owner), who asked for the review.
- **Model:** claude-opus-5-5

## 2026-11-10 · reworded · noise measured by perturbing a deterministic version's input
- **Reason:** on the shelves finder a re-run was identical while the page's own JPEG decoding moved
  1zktX1 by 6 of 60 books and a one-level perturbation by 3; the re-run rule gave no floor.
- **Actor:** @missingbulb (owner), asking that the skills carry this run's lessons for the next
  "make it better".
- **Model:** claude-opus-5-5
