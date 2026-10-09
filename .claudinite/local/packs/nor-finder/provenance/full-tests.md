## 2026-10-07 · born · the owner split CI into a fast set and a full set run nightly
- **Source:** the owner, in the project thread on the CI analysis: "Split the CI to "fast" and
  "full" - all the performance, memory, chrome load tests should be in the "full", which should run
  nightly and before releases".
- **Reason:** the per-PR run spent most of its time installing and driving Node, Pyodide and
  Chromium; those tests seldom fail and need not gate every PR.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a scheduled task, because the vendored scheduler is the repo's only permitted cron;
  the workflow keeps the `uses:` steps and its push-to-main trigger, and a red night parks the item.

## 2026-10-09 · policy-changed · the worker moved onto cn's task SDK with the repo's move off the Node engine
- **Reason:** the Node tasks pack's GitHub helpers it imported are gone under cn.
- **Actor:** @missingbulb (owner), re-adoption onto cn.
- **Model:** Claude.
- **Mechanism:** the dispatch is the SDK's `github.dispatchWorkflow`, granted in the pack's
  `githubActions`; finding and polling the run stay REST reads under the job token, as the SDK names
  no action for them; a red run fails through the SDK's `fail`.
