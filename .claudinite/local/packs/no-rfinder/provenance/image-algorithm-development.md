## 2026-09-27 · born · the owner asked for the NoR work's method as a general skill
- **Source:** the owner, in the project thread: "this skill is not for NoR finding - it's for
  working on a image processing algorithms. It should be helpful the next time we do some image
  processing."
- **Reason:** the NoR detector's development (versions v1-v4, filters A-J, the labelled lab tool)
  showed which steps need the owner and which can run against ground truth; the owner wanted that
  split kept for the next algorithm.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a workflow skill in the local pack, triggered by its description; placed here at
  the owner's request, and it points to research-project's rules rather than repeating them.
- **Retire when:** the research-project canon pack carries the same cycle.

## 2026-09-27 · trigger-changed · reframed from the owner's topic list into an agent's state-by-state procedure
- **Reason:** the owner found the first draft restated their notes rather than instructing an agent;
  the body is now gates, states and decision points, and the description names the states so the
  skill is picked when resuming as well as starting.
- **Actor:** @missingbulb (owner).
- **Mechanism:** the same workflow skill, still triggered by its description alone.

## 2026-09-27 · strengthened · added the directions ledger and the render-as-API rule
- **Source:** the owner: "keep track of the algorithmic directions we attempted, how they benefited
  us and where they failed" and "The definitions of how the human want to review the images are like
  API - don't change unless they say so".
- **Actor:** @missingbulb (owner).

## 2026-09-27 · strengthened · added the rotation and skew invariance stress test
- **Source:** the owner: "Don't assume what you're looking for is aligned to the image grid...
  stress test it by rotating the image. If the image came from a camera - any projection can happen
  to the object, attempt to find it after skewing the image."
- **Actor:** @missingbulb (owner).
