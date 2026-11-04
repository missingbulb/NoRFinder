---
name: writing-version-history
description: Telling a change in the page's version history - the one Version-history line a pull request's commit message carries, at most 20 words a user reads. Use when a change alters what a user of the page sees, or when the version-history check fails a pull request.
metadata:
  body: workflow
  usage:
    expect: triggered
---

# Telling a change in the version history

The history is what a user reads when they click the version. Each pull request tells its own
change, so no two pull requests ever write to the same place.

1. **Put one line in a commit message of the pull request**, on a line of its own:

   ```
   Version-history: In NoR Finder, clicking an empty spot on the image deselects the candidate.
   ```

   The last such line across the pull request's commits is the one that counts, so a later commit
   rewords it. A change nobody using the page would notice says `Version-history: none`.

2. **At most 20 words, in the user's words**: what they see and can do, naming buttons as the page
   labels them, never the code, a file or the pull request's title.

3. **Edit no file for it.** The squash merge carries the line onto main, and the site build places
   it under the release that carried the pull request. `web/version_history.md` keeps the releases
   told before, and is left alone.

The `version-history` job in the Tests workflow fails a pull request that changes `web/` or a
study's `web/` without the line, or whose line runs past 20 words.
