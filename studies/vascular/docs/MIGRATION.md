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
| 3D viewer: WebGL2 ray-caster, Brightest/Surface, colour by depth, slab, slice spacing, look-from, Flattened and Depth-profile views (`viewer.js`, `stack.js`) | — | open (D1): becomes the shell's `viewer3d.js` |
| Stack reader in the browser (`tiff.js`: ImageJ/OME, LZW/Deflate/PackBits) | — | open (D1) |
| Model over or beside the stack, editing in 3D, Detected/Missed review, draw a missed vessel, lasso damaged areas (`modelview.js`) | — | open (D2) |
| Item cards for junctions and vessels (`items.js`) | — | open (D3) |
| Download corrected model | — | open (D4): the shell's ground-truth submission |
| Page shell: load from computer/Drive, drop, busy screen, notices, theme, resizable bars, foldable boxes, version check (`shell.js`, `drive.js`, `build.mjs`) | `web/` | exceeded |
| Drive default folder from `sources.json` | `study.json` `files.drive` | moved, as a shell feature for every study |
| GitHub Pages deploy, `site.config`, root redirect | Cloudflare release | exceeded; retiring the old site is open (D9) |
| Pack rules: locked-metric-definitions, ask-before-unknown | `vascular-study` | moved |
| Pack rules: never-self-validate, progress-visual-assertion, trustworthy-numbers, per-paper-rollup | — | open (D7): research-project already covers them |
| Skills: paper-intake, vessel-overlay-review | `vascular-study` | moved |
| Skill: image-algorithm-development | nor-finder's | exceeded (nor-finder's is a superset) |
| Skill: algorithm-ideation | — | open (D7) |
| Eight Go checks (calibration, metric fields, overlay colour, render dirs, paper index) | — | open (D7) |
| Python tests; model-edit and coverage Node tests | `tests/` | moved; the TIFF-reader test moves with `tiff.js` (D1) |
