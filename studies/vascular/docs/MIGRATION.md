# Migrating vascularColoring into this study

Every capability of [missingbulb/vascularColoring](https://github.com/missingbulb/vascularColoring)
(at `54badaa`), and where it stands here. **Moved** is in `studies/vascular/` or its pack;
**exceeded** is already done, or done better, by NoRFinder; **open** waits on a decision in
[#620](https://github.com/missingbulb/NoRFinder/pull/620).

| Capability (vascularColoring) | Here | Status |
|---|---|---|
| Figure-panel pipeline: `measure_vessels.py`, `annotate_overlays.py` | `analysis/` | moved; its input panels are open (D5) |
| 3D extraction lab v1–v5, `score.py`, `render.py`, `fake_truth.py`, Fable labels, LEDGER | `analysis/extraction/` | moved |
| Vessel model drafter `vessel_model.py`; tracer spike `trace_vessel_graph.py`; `export_stack_view.py` + `stack_view/` | `analysis/` | moved (the last two as spikes) |
| Stack manifest and fetcher (`data/sources.json`, `fetch_data.py`) | `data/`, `analysis/stack_sources.py` | moved; renamed to stop shadowing NoR's `fetch_data`; sharing one fetcher is open (D6) |
| WORKING-GUIDE, STATUS, 3D-STACKS, results-first-pass | `docs/` | moved |
| Literature: 10 digests, METHODS-SYNTHESIS, BIOLOGY-INVARIANTS, figure READMEs, `crop_panels.py`, `_tools/`, Rust's macros | `docs/literature/` | moved |
| Literature binaries: PDFs (~36 MB), figures and panels (~88 MB) | linked at vascularColoring | open (D5) |
| Vessel-model/2 format and edits (`model.js`), review tube (`coverage.js`), the four v5 draft models | `web/` | moved, tested |
| 3D viewer: WebGL2 ray-caster, Brightest/Surface, colour by depth, slab, slice spacing, look-from, Flattened and Depth-profile views (`viewer.js`, `stack.js`) | `web/viewer3d.js` (shell) | moved: every shown channel in its row's colour and points; Flattened is the 2D view; the single-slice picture and Depth profile not yet |
| Stack reader in the browser (`tiff.js`: ImageJ/OME, LZW/Deflate/PackBits) | `py/vascular.py` (tifffile) | replaced: decoded in Python (D1) |
| Model over or beside the stack, editing in 3D, Detected/Missed review, draw a missed vessel, lasso damaged areas (`modelview.js`) | `web/model_view.js`, on the shell's `viewer3d` `three` | moved (D2) |
| Item cards for junctions and vessels (`items.js`) | `web/items.js`, the Item View | moved (D3) |
| Download corrected model | Submit Ground Truth | moved (D4); the intake task follows the first submission |
| Page shell: load from computer/Drive, drop, busy screen, notices, theme, resizable bars, foldable boxes, version check (`shell.js`, `drive.js`, `build.mjs`) | `web/` | exceeded |
| Drive default folder from `sources.json` | `study.json` `files.drive` | moved, as a shell feature for every study |
| GitHub Pages deploy, `site.config`, root redirect | Cloudflare release | exceeded; retiring the old site is open (D9) |
| Pack rules: locked-metric-definitions, ask-before-unknown | `vascular-study` | moved |
| Pack rules: never-self-validate, progress-visual-assertion, trustworthy-numbers, per-paper-rollup | research-project | exceeded |
| Skills: paper-intake, vessel-overlay-review | `vascular-study` | moved |
| Skill: image-algorithm-development | nor-finder's | exceeded (nor-finder's is a superset) |
| Skill: algorithm-ideation | nor-finder | moved, for every study |
| Eight Go checks (calibration, metric fields, overlay colour, render dirs, paper index) | `vascular-study` | four moved, scoped to the study; panel-scale-calibration waits for panels in git; render-dir and paper-index checks dropped |
| Python tests; model-edit and coverage Node tests | `tests/` | moved; the TIFF-reader test went with `tiff.js` |

## Decisions (owner, 2026-10-31)

- **D1, the 3D viewer:** decoded in the study's Python. `opened()` adds `meta.Z` and `meta.spacing`
  and returns C×Z 8-bit planes, channel-major. `web/viewer3d.js` ports the MicroViewer's ray-caster
  behind viewer2d's interface and bins for the GPU itself. The approved view becomes defaults: black
  point 0.63 becomes `black: 161` on the CD31 row; colour by depth, render mode, look and the 1 µm
  spacing go in a new `study.json` `view` block, and the page says the spacing was stated, not read
  from the file. Phases: contract (the Image Viewer and the fixture emit Z too), viewer3d with
  channel rows, view controls, then overlays (D2).
- **D4, ground truth:** stage GT, using the shell's Submit Ground Truth with label
  `vascular-ground-truth`. This needs the shell's submit popup to stop counting NoR's `labels`.
  An intake task follows once the first corrected model is submitted.
- **D5, literature binaries:** none come into git. The READMEs keep linking to vascularColoring at
  `54badaa`.
- **D7, the pack:** port 5 Go checks with their roots under `studies/vascular/` (the three
  calibration checks, locked-metric-fields, overlay-color-contrast, panel-scale-calibration).
  Drop render-outputs-gitignored, rendered-overlays-untracked and paper-folder-indexed. Retire the
  4 rules research-project already carries. `algorithm-ideation` goes to nor-finder.

Taken on Fable's recommendation unless the owner says otherwise:

- **D2:** the 3D viewer offers a low-level overlay API: `canvas`, `project`/`unproject`, `onDraw`,
  `setMask`, `frame`. Vessel geometry, edits, review and colours stay study-side. Scene-graph
  primitives come later, if a second user wants them.
- **D3:** item cards stay in each study. Only the list and selection frame is lifted into the
  shell, and only after the vascular cards render.
- **D6:** `py/` holds what ships and `analysis/` holds research. Whether to lift one fetcher for
  both studies is still undecided.
- **D8:** ship the v5 drafts first. Extraction in the browser comes only after a measured run.

- **Listing:** the study is listed now (owner, 2026-10-31), with the 3D viewer alone; it stays PreGT until
  the model view brings Submit Ground Truth.
- **D9:** decided once the model view lands here. Until then the old site stays the place to correct
  vessel models. After that: redirect its page to rauntruth.com/vascular, stop its scheduled
  Claudinite runs, and archive the repo.

Conflicts with existing requirements to resolve on the way:

- The MicroViewer's right bar has to move into the left slots (1.11).
- Requirement 1.3 promises a lasso that viewer2d does not own.
- The study-words test (1.1) must learn this study's words.
