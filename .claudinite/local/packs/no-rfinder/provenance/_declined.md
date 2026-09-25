## 2026-09-25 · declined · cross-repo duplication of the Drive-fetch-with-checksum mechanic
- **Source:** PR #182's conversation log (`src/fetch_data.py`'s gdown re-listing fix, hand-ported
  the same session into missingbulb/VascularColoring's `analysis/fetch_data.py`).
- **Reason:** the gap is real — no shared pack owns fetch-raw-data-from-Drive-with-checksum, so it
  is copied by hand across the owner's repos — but the lesson is tied to one call site
  (`src/fetch_data.py`), and extracting-lessons.md drops a call-site gotcha rather than landing it
  as a pack rule; a note at the site is `improve-comments`' task, not this one's.
- **Actor:** claudinite-growth/growth-extract (issue #185).
- **Model:** claude-sonnet-5.
