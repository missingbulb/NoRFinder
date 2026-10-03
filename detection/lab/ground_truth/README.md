# Ground truth submitted from the NoR Finder page

One file per submission, `issue-<n>.json`, written by the daily intake from the file attached to
GitHub issue #n, and one entry per file in `dataset.json`. Both are generated: never edit them by
hand. To correct a submission, mark the image again on the page and submit a new one; the newer
file wins at every spot both mark (docs/requirements.md R10).

A file is the page's `norfinder-ground-truth/2` export: the image (name, SHA-256, Google Drive id),
the candidates the person voted up (label 1) or down (label 0), and the NoRs they marked as missed
by the finder (`"kind": "missing"`, label 1, with the radius a candidate must lie within). The
images stay on Drive: `python3 detection/ground_truth.py fetch` downloads them.

How the finders score on all of it: `python3 detection/ground_truth.py score`.
