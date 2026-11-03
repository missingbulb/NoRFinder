---
name: writing-version-history
description: Telling a change in the page's version history, web/version_history.md - folding what shipped, then working the change into the Next release story of at most three short paragraphs. Loaded for any edit of that file.
metadata:
  body: workflow
  usage:
    expect: triggered
  force-load-on-file-edits-paths:
    - "web/version_history.md"
---

# Telling a change in the version history

The history is what a user reads when they click the version: each release as a short story of
what they can now do, not a ledger of pull requests. Next release is that story for the release
being built, and every change rewrites it rather than appending to it.

1. **Fold what already shipped**, so Next release holds only what has not:

   ```
   python3 dev/tools/build/version_history.py fold
   ```

2. **Read Next release whole** and find where the change belongs in its story: a paragraph about
   the same feature or the same part of the page. Rewrite that paragraph so the change is part of
   it, and add the pull request to the numbers it ends with, `(#690, #697)`.

3. **Start a paragraph only for a change no paragraph is about.** At most three paragraphs, each at
   most 60 words not counting the numbers; the history test fails past either.

4. **Make room by weight, not by order.** When the story is full, condense the paragraphs, or leave
   out what pales beside the rest: a fix or a polish next to a new study or a new tool. A change
   left out is not listed at all, its number included. Leave out the change you are telling too
   when it is the slightest.

5. **Write in the user's words**: what they see and can do, naming buttons as the page labels them,
   never the code, a file or a pull request's title.

6. **Leave the released sections alone.** A release's paragraphs are what it said when it shipped;
   the fold is the only thing that moves text there.
