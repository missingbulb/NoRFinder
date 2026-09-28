## 2026-09-25 · declined · cross-repo duplication of the Drive-fetch-with-checksum mechanic
- **Source:** PR #182's conversation log (`src/fetch_data.py`'s gdown re-listing fix, hand-ported
  the same session into missingbulb/VascularColoring's `analysis/fetch_data.py`).
- **Reason:** a call-site gotcha tied to `src/fetch_data.py` (extracting-lessons.md's drop rule),
  not a pack-shaped rule.
- **Actor:** claudinite-growth/growth-extract (issue #185).
- **Model:** claude-sonnet-5.
