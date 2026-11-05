# The Vascular Measurements page's requirements

What a person using the Vascular Measurements page sees and can do beyond the shell, which
[the shell's requirements](../../dev/requirements/requirements.md) state with the conventions this spec
follows too: tags, their order, **Tentative** and **Undecided**.

## `req/vascular` The Vascular Measurements page: cerebral vessels in CD31 z-stacks

Migrated from [missingbulb/vascularColoring](https://github.com/missingbulb/vascularColoring) on
2026-10-31, at rauntruth.com/vascular. Its research requirements, the
owner's decisions on the stacks and the vessel model, are
[`studies/vascular/docs/3D-STACKS.md`](docs/3D-STACKS.md) and
[`studies/vascular/docs/WORKING-GUIDE.md`](docs/WORKING-GUIDE.md).

- `req/vascular/drive-folder` Load from Google Drive opens on the owner's stacks folder.
  <details>

  `files.drive` in the study's `study.json`, under `req/shell/drive/dialog`'s rule.
  </details>

- `req/vascular/model/cards` Items shows each junction and vessel of the model as a card, outside a ground-truth stage.
  <details>

  A card for each junction (three or more live branches) and each vessel (junction or tip to the
  next): the stack around it flattened over the slices shown, the rest of the model thin in magenta
  and the item in white, with its numbers (a vessel's length along its curve, its width and depth
  span; a junction's depth, width and how many junctions lie within 20 µm). Filters show the ones
  worth a look and the declined vessels; sorting brings the shortest, widest, most branched or most
  crowded first. A card approves, declines or deletes a vessel, splits a junction, or shows its
  item in 3D. The item view only shows what was found (`data-viewing`, `req/shell/views/second`):
  while the study makes ground truth its tasks are in the left bar instead
  (`req/vascular/truth/tasks`). Test: `studies/vascular/tests/test_model_page.py`.
  </details>

- `req/vascular/model/correct` A stack's vessel model, to correct by hand over the stack or beside it.
  <details>

  Moved from the 3D MicroViewer (`studies/vascular/docs/3D-STACKS.md`, the owner's decisions of
  2026-10-03 to 10-29). The model Execute draws (`req/vascular/model/run`), or any `vessel-model/2`
  file loaded, shows as the toolbar says (`req/vascular/model/view`): white tubes in a view of its
  own that turns with the stack's, or magenta over the stack. On the model: drag a point to move it,
  right-click a segment or a point to delete it, add or remove a bend or split a junction into
  vessels that cross, right-drag from one piece to another to connect them, and click a faded
  low-confidence vessel to approve or decline it. Review keeps only the signal within reach of the
  model's vessels (Detected) or away from them (Missed), within a reach that is a share of each
  vessel's own width; Mark a damaged area lassos an area to leave out. Every edit can be undone,
  and the edits stay in the browser, tied to the model as drawn, until it is submitted. Test:
  `studies/vascular/tests/test_model_page.py`.
  </details>

- `req/vascular/model/ground-truth` The corrected model is the study's ground truth.
  <details>

  Submit Ground Truth (`req/shell/ground-truth/submit`), the last of the Ground Truth Tasks
  (`req/vascular/truth/tasks`), exports the corrected `vessel-model/2` file, `status` corrected and
  its corrections counted, labelled `vascular-ground-truth`; it is off until the model carries a
  correction, and its checklist says what of each task is still open. Each verdict is in the file:
  a vessel's `state` (`accepted` or `rejected`) beside `proposed`, the state the extractor gave it;
  a junction found right in `checked_junctions`; each area checked for missed vessels in
  `reviewed_regions`. Test: `studies/vascular/tests/test_vessel_tasks_page.py`.
  </details>

- `req/vascular/model/run` Processing picks an extraction algorithm, says how it works and how well, and Execute draws the vessel model in the browser.
  <details>

  Set by the owner on 2026-11-04, as NoR's Processing box. The box lists the extraction lab's
  versions (`studies/vascular/analysis/extraction/`), the lab's default first; How the algorithm
  works shows the chosen version's own description; Execute, at the box's end, runs it in the
  page's Python on the stack open, as the lab runs it (scored, with the spacing between slices the
  page shows), and the model it draws opens over the stack. The study ships no drawn models: a
  stack opens with none until Execute. A vessel model file (one saved earlier, say) can still be
  loaded from a small link beside Execute. Show low-confidence vessels stays in the box, under
  Execute, once a model is open. Changed by the owner on 2026-11-04: the box behaves as NoR's
  (`req/nor/find/settings`). Each algorithm in the list carries its own icon and its name, and its
  precision and recall against the provisional labels (`analysis/extraction/labels/`, a model's
  verdicts, not the owner's); How the <name> algorithm works gives its steps as a nested list
  (written as a Markdown outline), then "<Name> algorithm shows precision of X and recall of Y on
  N curves a model judged", in bold, the numbers the list shows, and that the judge is not the
  owner. The numbers ship with the page part (`studies/vascular/web/algorithm_metrics.json`, made
  by `lab.py grade --json`). The list leaves out a version another one beats beyond noise on those
  labels (`lab.RETIRED`, each with its reason); the lab still runs it. Test:
  `studies/vascular/tests/test_extract_bridge.py` (the real Python in Pyodide) and
  `studies/vascular/tests/test_vessel_tasks_page.py` (the page).
  </details>

- `req/vascular/model/view` Above the stack: show the image, the model, the model over the image, or both side by side; colour by depth; vessel widths.
  <details>

  Set by the owner on 2026-11-04. The toolbar chooses what the main view shows: Image (the stack
  alone), Model (the model alone), Overlay (the model over the stack, in magenta) and Side by side
  (the stack and the model each in a half, turning together). Colour by depth paints the stack and
  the model alike by depth; over the stack the model stays magenta, a colour the depth scale never
  gives, so it never vanishes into the signal it marks. Vessel widths draws each vessel as wide as
  the model says. Test: `studies/vascular/tests/test_model_page.py`.
  </details>

- `req/vascular/stack-view` A z-stack opens in 3D in the owner's approved view; 2D shows it flattened.
  <details>

  Any multi-page TIFF (an ImageJ hyperstack or plain pages in depth) opens in the 3D viewer
  (`req/shell/viewer-3d`), every channel scaled by one window over the whole stack, so signal that fades with depth
  still looks faded; 2D shows its brightest-over-depth picture. CD31 is always the first channel: a
  one-channel stack is CD31, and a two-channel one, DAPI then CD31 as the owner's originals are, is
  shown CD31 first. It opens in the view the owner approved on 2026-09-29: CD31 alone, coloured by
  depth, black point 0.63 of the window (161), slices 1 µm apart as the owner stated on 2026-10-29.
  Test: `studies/vascular/tests/test_stack_page.py`.
  </details>

- `req/vascular/truth/marks` What is decided is cut out of the stack, blacked out through every slice it reaches.
  <details>

  Set by the owner on 2026-11-04, as NoR's (`req/nor/truth/marks`): an approved or declined
  vessel's tube, a junction found right and each area checked for missed vessels are blacked out of
  the 3D stack, so what is left to review stands out and the work shows as it is done. The current
  item is drawn white over a dark rim, which reads over any signal. Test:
  `studies/vascular/tests/test_vessel_tasks_page.py`.
  </details>

- `req/vascular/truth/order` The items come area by area, so the review fills the stack one area after another.
  <details>

  As NoR's (`req/nor/truth/order`): the stack's field cut into 10 × 10 areas, never drawn, the rows
  of areas top to bottom, each row the way back from the last; each task's items in that order (a
  vessel by its middle, a junction by its place), top to bottom inside an area, and the Areas task
  in the same order. Test: `studies/vascular/tests/test_vessel_tasks_page.py`.
  </details>

- `req/vascular/truth/tasks` Ground Truth Tasks, in the left bar under Processing: vessels, low-confidence vessels, junctions, areas, then Submit.
  <details>

  Set by the owner on 2026-11-04, as NoR's (`req/nor/truth/tasks`), in the left bar under the
  Processing box once a model is open: Vessels (those the extractor drew with confidence),
  Low-confidence (the faint ones it was unsure of), each approved or declined; Junctions, each a
  real junction or vessels that only cross (split then); Areas, the stack's areas checked one by one
  for vessels the extractor missed; and Submit Ground Truth last. One row per task, "3/41 Vessels",
  a check once done, and a bar split into a part per task. The open task shows one item at a time:
  its picture across the box, the verdict buttons big under it, a cogwheel for its options and a
  Skip link on its row; a verdict moves on by itself to the task's next item with none, then to the
  first task not done. The current item is marked on the main view, which turns to it only when it
  is out of the middle of the view. The Areas task frames one area at a time on the stack, seen
  from above; Draw a missed vessel adds one there, and "No missed vessels here" checks the area and
  moves on. Test: `studies/vascular/tests/test_vessel_tasks_page.py`.
  </details>
