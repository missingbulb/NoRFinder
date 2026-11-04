## 2026-11-03 · born · fold, then work the change into Next release's story (#701)
- **Source:** the owner: "when an agent writes to that file - they need to see if the addition they
  made can be made to fit a larger narrative … sometimes features will just have to be omitted …
  I think what I described here is an auto-loaded skill when touching this file."
- **Reason:** the shared bump does not fold the history at release, so whoever edits the file folds
  first.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5.5
- **Mechanism:** a workflow skill force-loaded on edits of web/version_history.md; the paragraph and
  word limits are held by the history test, the fitting and omitting is judgment.
- **Retire when:** the public-website bump folds Next release under the version it cuts; step 1 then
  goes.
- **Landed:** #701

## 2026-11-04 · trigger-changed · from editing the history file to telling a page change in a commit line
- **Reason:** no pull request edits web/version_history.md any more; the fold and the story-fitting
  steps went with it.
- **Mechanism:** a workflow skill named by the page-version-history rule and by the check's failure;
  no force-load, since a path trigger on every `web/` edit would load it on most changes.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5.5
