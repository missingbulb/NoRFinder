# Vascular Measurements — read this first

Detect and quantify cerebral blood vessels in CD31 confocal images: **categorize** (caliber),
**count** (branch segments) and **measure** (centerline length). Two inputs, two pipelines:

- **Figure panels** (2D, RGB crops of published figures, `docs/literature/*/figures/panels/VESSEL_*.png`):
  `analysis/measure_vessels.py` and `analysis/annotate_overlays.py`.
- **The owner's z-stacks** (3D, four Marianas 20× CD31 stacks on Google Drive, `data/README.md`):
  `analysis/extraction/` keeps every extraction version side by side (v5 the default), and its
  output is the vessel model (`vessel-model/2`) the owner corrects into ground truth. This is the
  pipeline; `analysis/trace_vessel_graph.py` and `analysis/export_stack_view.py` (with
  `analysis/stack_view/`) are the earlier spikes.

Migrated from [missingbulb/vascularColoring](https://github.com/missingbulb/vascularColoring)
on 2026-10-31 ([`MIGRATION.md`](MIGRATION.md) lists every capability and where it stands). Still there, not yet here: the 3D MicroViewer page (its ray-caster, TIFF reader,
model editing view and item cards), which comes over as the shell's 3D viewer plus this study's
panels; the figure and PDF files the literature's READMEs show (they link to that repo for now);
the pack's Go checks.

## Read next

- [`WORKING-GUIDE.md`](WORKING-GUIDE.md) — the owner's rules for images, overlays, metrics and calibration.
- [`STATUS.md`](STATUS.md) — where things stand and the agreed next step.
- [`3D-STACKS.md`](3D-STACKS.md) — the 3D work, the vessel model and the owner's decisions on it.
- [`../analysis/extraction/README.md`](../analysis/extraction/README.md) and its `LEDGER.md` — the extraction versions and every attempt.
- [`literature/README.md`](literature/README.md) — one digest per paper (read the digest, never the PDF),
  [`literature/METHODS-SYNTHESIS.md`](literature/METHODS-SYNTHESIS.md) and
  [`literature/BIOLOGY-INVARIANTS.md`](literature/BIOLOGY-INVARIANTS.md).

The study's working rules and its skills (`paper-intake`, `vessel-overlay-review`) are the
`vascular-study` local pack's; research-project's rules govern as for every study here.

## Run

From `studies/vascular/`:

```
python3 analysis/stack_sources.py                 # the owner's stacks into data/raw/, checked by SHA-256
python3 analysis/extraction/lab.py cmp            # every extraction version on every stack
python3 analysis/extraction/lab.py run v5 STACK.tif OUT.vessels.json
python3 analysis/measure_vessels.py               # the figure-panel pipeline (needs the panels)
python3 -m pytest tests
```

## The page

`py/vascular.py` is what the browser runs: for now a stack is shown flattened in the 2D viewer
(requirement `4.1`). The draft vessel models the 3D viewer will open are `web/models/`, and the
model's format and edits are `web/model.js` (`web/coverage.js` the review's tube), both pinned by
`tests/test_model_js.py` and, against the Python fit, `tests/test_vessel_model_curve.py`.
