## 2026-11-13 · born · page code sets no raw timer outside web/pacing.js
- **Reason:** the owner asked for no set-time timers in production: visual effects become CSS
  motions, background cadences one module that pauses in a hidden tab.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
- **Mechanism:** a regex over page code, with a `timed here:` marker for a timer only a raw one can
  be (a worker, a debounce of local compute); a module wrapper alone, without the check, would let a
  new raw timer in unseen.
- **Rejected:** a production clock hook for tests - Playwright's clock already fakes every page
  timer, and tests bend their own surface.
