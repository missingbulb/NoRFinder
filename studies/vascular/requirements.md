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
  low-confidence vessel to approve or decline it. The toolbar's Everything, Detected and Missed keep the
  whole stack, only the signal within reach of the model's vessels, or only what lies away from them, within a
  reach that is a share of each vessel's own width (`req/vascular/model/view`); Mark a damaged area, under
  what the model holds in Summary or under the tasks while ground truth is made, lassos an area to leave out. Every edit can be undone,
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
  a junction found right in `checked_junctions`; each step done over an area in `reviewed_regions`,
  the area's box with its `step`. Test: `studies/vascular/tests/test_vessel_tasks_page.py`.
  </details>

- `req/vascular/model/run` Processing picks an extraction algorithm, says how it works and how well, and Execute draws the vessel model in the browser.
  <details>

  Set by the owner on 2026-11-04, as NoR's Processing box. The box lists the extraction lab's
  versions (`studies/vascular/analysis/extraction/`), the lab's default first; How the algorithm
  works shows the chosen version's own description; Execute, at the box's end, runs it in the
  page's Python on the stack open, as the lab runs it (scored, with the spacing between slices the
  page shows), and the model it draws opens over the stack. The study ships no drawn models: a
  stack opens with none until Execute. A vessel model file (one saved earlier, say) can still be
  loaded from a small link beside Execute. Once a model is open, Undo, Redo and Discard edits are under
  Execute; what the model holds is in Summary, with Mark a damaged area under it (owner, 2026-11-07: the left bar
  is the shell's, `req/shell/left-bar/shells`). Draw a missed vessel is a ground-truth action, offered only in the
  Missed vessels step (`req/vascular/truth/tasks`; owner, 2026-11-07). Changed by the owner on 2026-11-04: the box behaves as NoR's
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

- `req/vascular/model/view` The toolbar's left shows the image, the model, the model over the image, or both side by side, and how the model is drawn.
  <details>

  Set by the owner on 2026-11-04. The toolbar chooses what the main view shows: Image (the stack
  alone), Model (the model alone), Overlay (the model over the stack, in magenta) and Side by side
  (the stack and the model each in a half, turning together). While CD31 is coloured by depth
  (`req/shell/viewer-3d`) the model is painted by depth in CD31's palette, as the stack is; over the stack the model stays magenta,
  a colour the depth scale never gives, so it never vanishes into the signal it marks. Vessel widths draws each
  vessel as wide as the model says. Changed by the owner on 2026-11-07, everything that sets how the model shows
  is at the toolbar's left (`req/shell/image/toolbar`): Vessel widths, Low-confidence (the faded vessels the
  algorithm was unsure of, offered while the model has any) and Everything, Detected and Missed, with the reach
  beyond the vessel wall while Detected or Missed is on (`req/vascular/model/correct`). Changed by the owner on 2026-11-07, as NoR's
  (`req/nor/show-menu`): all of them, the four views included, are in one Show menu at the toolbar's left. While an area of the
  Ground Truth Tasks is open, a Back to image button takes the Show menu's place (`req/vascular/truth/tasks`). Test: `studies/vascular/tests/test_model_page.py`.
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

- `req/vascular/truth/marks` An area done in every step is cut out of the stack, blacked out through every slice.
  <details>

  Changed by the owner on 2026-11-07: an area whose Lines, Missed vessels and Junctions are all done is blacked
  out of the 3D stack in the whole-image view, so what is left to review stands out and the work shows as it is done.
  Inside an area nothing is cut out, since every step there needs the signal it judges. The current area is framed
  on the whole image, and the current junction is drawn white over a dark rim, which reads over any signal. Test:
  `studies/vascular/tests/test_vessel_tasks_page.py`.
  </details>

- `req/vascular/truth/order` The areas come one after another, every step of an area before the next.
  <details>

  As NoR's (`req/nor/truth/order`): the stack's field is cut into areas, never drawn, the rows of areas top to
  bottom, each row the way back from the last; in each area its Lines, then its Missed vessels, then its Junctions,
  before the next area. Changed by the owner on 2026-11-07: how many areas is the person's to choose in the tasks
  box (from one area for the whole field to 10 × 10), since a bigger area is sometimes the better one to judge
  whole; a step done over an area stays done in every area it covers whatever is chosen after. Test:
  `studies/vascular/tests/test_vessel_tasks_page.py`.
  </details>

- `req/vascular/truth/tasks` Ground Truth Tasks, in the shell's box under Processing: Lines, Missed vessels, Junctions, each counted in areas, then Submit.
  <details>

  Set by the owner on 2026-11-07, replacing the vessel-by-vessel tasks of 2026-11-04. The tasks are the stack's
  areas (`req/vascular/truth/order`), and each area is worked through in three steps, one row each in the left bar
  under Processing once a model is open: "3/16 Lines", "2/16 Missed vessels", "1/16 Junctions", a check once done,
  a bar split into a part per task, and Submit Ground Truth last. The open step's row holds the area's place, a
  map of the areas to pick one from, the choice of how many areas, and the step's own controls, with Skip on its row.
  While a step is open the main view shows that area alone.

  - **Lines**, from straight above: the stack flattened, the model's lines over it with a handle on every point,
    and the view does not turn or pan. Dragging a handle moves its point across the picture, never in depth; the
    right-click menu deletes, adds a bend or connects as anywhere. A low-confidence line, faint, is kept by clicking
    it. "Lines are right" approves the area: every confident vessel whose middle lies in it is accepted, every
    low-confidence one not kept is declined.
  - **Missed vessels**, from straight above as Lines: Draw a missed vessel adds one there
    (`req/vascular/model/correct`), and "No missed vessels here" checks the area.
  - **Junctions**, in 3D: the area turns freely, with no handles. Each junction in the area in turn, ringed on the
    view and pictured in the box, is a real junction or vessels that only cross at different depths (split then);
    clicking a junction on the view makes it the current one. Clicking a vessel drops it as a detection artifact, one
    that only turning the area shows to make no sense. "Area done" ends the step once every junction there has a
    verdict.

  Holding Ctrl shows the model alone, and letting it go shows the stack again (over it, the lines while Lines or
  Missed vessels is open), so what is there and what was found are a key apart. At the toolbar's left, in the
  Show menu's place, a big Back to image button leaves the area for the whole stack, where the Show menu is again;
  in the same place, Back to task returns to the area and its step. Each step done is kept in the model's
  `reviewed_regions` as the area's box, with its `step` (`lines`, `missed` or `junctions`). Test:
  `studies/vascular/tests/test_vessel_tasks_page.py`.
  </details>
