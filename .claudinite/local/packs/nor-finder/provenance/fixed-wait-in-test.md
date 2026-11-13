## 2026-11-05 · born · a test sleeping a fixed time guesses how long the page takes
- **Source:** the owner, on the page tests' 69 fixed sleeps (~36 s): "this seems like a bad smell,
  fragile, and a waste"; then "add a rules/check to make sure tests don't sleep or wait aimlessly".
- **Reason:** a fixed sleep is too short on a slow runner and wasted on a fast one; a condition
  wait, or the page's clock moved on, is neither.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
- **Mechanism:** a declared line check over the tests, blocking: each fixed wait is one call on one
  line; a wait only real time can serve says why on that line.
- **Rejected:** a prose rule (the check sees every instance), and an allowlist of files (the reason
  belongs at the wait).
- **Retire when:** never while tests drive a page.

## 2026-11-13 · scope-changed · every setTimeout in test code, a stand-in's delay included
- **Reason:** a stand-in answering late or a sleep inside page.evaluate slipped past the old
  await-Promise pattern; only a deadline bounding a hang is excused, by its own marker.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
- **Mechanism:** a regex, widened.
