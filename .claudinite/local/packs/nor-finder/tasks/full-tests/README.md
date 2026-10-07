# full-tests — what the worker does

Dispatches `.github/workflows/tests-full.yml` on the default branch, finds the run it started,
waits for it, and parks the item at a failure with the run's link when the tests are red. The
workflow also runs on every push to main; this task is the nightly run, since the scheduler is the
repo's only cron.
