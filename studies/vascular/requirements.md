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
  own that turns with the stack's, or magenta over the stack. On the model: drag a point to move it, its handle shown
  only while ground truth is tagged, never on the main view out of tagging (owner, 2026-11-08),
  right-click a segment or a point to delete it, add or remove a bend (a point on any vessel, low-confidence ones
  too: its two lines become one), split a segment where it was clicked into two tips set a little apart (owner,
  2026-11-08) or split a junction into vessels that cross, right-drag from one piece to another to connect them, drag a vessel's tip onto another
  vessel or point to attach it there, for a connection the algorithm missed (owner, 2026-11-07), and click a faded
  low-confidence vessel to approve or decline it. The toolbar's Everything, Detected and Missed keep the
  whole stack, only the signal within reach of the model's vessels, or only what lies away from them, within a
  reach that is a share of each vessel's own width (`req/vascular/model/view`). Damaged sample is marked in Data
  Management, as an imperfection of the stack (`req/shell/data/edit`), never in the model (owner, 2026-11-07); a model
  file whose `excluded_regions` mark damage still shows it hatched and leaves it out of the counts. Every edit can be undone,
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
  a junction found right in `checked_junctions`; each area done in `reviewed_regions`, the area's box
  with its `step`, `area`. Test: `studies/vascular/tests/test_vessel_tasks_page.py`.
  </details>

- `req/vascular/model/run` Processing picks an extraction algorithm, says how it works and how well, and Execute draws the vessel model in the browser.
  <details>

  Set by the owner on 2026-11-04, as NoR's Processing box. The box lists the extraction lab's
  versions (`studies/vascular/analysis/extraction/`), the lab's default first; How the algorithm
  works shows the chosen version's own description; Execute, at the box's end, runs it in the
  page's Python on the stack open, as the lab runs it (scored, with the spacing between slices the
  page shows), and the model it draws opens over the stack. The study ships no drawn models: a
  stack opens with none until Execute, and no model file is loaded in its place: an image, then the
  algorithm, as NoR's (owner, 2026-11-07). Once a model is open, Undo, Redo and Discard edits are under
  Execute; what the model holds is in Summary (owner, 2026-11-07: the left bar
  is the shell's, `req/shell/left-bar/shells`). Draw a missed vessel is a ground-truth action, offered only by a
  right-click on the image in an area of the tasks (`req/vascular/truth/tasks`; owner, 2026-11-07). Changed by the owner on 2026-11-04: the box behaves as NoR's
  (`req/nor/find/settings`). Each algorithm in the list carries its own icon and its name, and its
  precision and recall against the provisional labels (`analysis/extraction/labels/`, a model's
  verdicts, not the owner's); How the <name> algorithm works gives its steps as a nested list
  (written as a Markdown outline), then "<Name> algorithm shows precision of X and recall of Y on
  N curves a model judged", in bold, the numbers the list shows, and that the judge is not the
  owner. The list and the note are the shell's (`req/shell/processing/algorithms`, owner, 2026-11-13), drawn from
  the study's data: `web/algorithms.json`, each version's name, icon and steps as its module states them, and
  `web/algorithm_metrics.json`, its numbers, made by `lab.py grade --json`. The list leaves out a version another one
  beats beyond noise on those labels (`lab.RETIRED`, each with its reason); the lab still runs it. Both ship with the
  page part, so the study's Python is ready, and a stack opens, without loading the versions or scipy; they load at
  the first Execute (owner, 2026-11-07). Test:
  `studies/vascular/tests/test_vascular_processing_box.py`, `studies/vascular/tests/test_extract_bridge.py` (the real Python in Pyodide) and
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
  is at the toolbar's left (`req/shell/image/toolbar`): Vessel widths and Everything, Detected and Missed, with the reach
  beyond the vessel wall while Detected or Missed is on (`req/vascular/model/correct`). Changed by the owner on 2026-11-07, as NoR's
  (`req/nor/show-menu`): all of them, the four views included, are in one Show menu at the toolbar's left. While an area of the
  Ground Truth Tasks is open, a Back to image button takes the Show menu's place (`req/vascular/truth/tasks`). Changed by the owner on 2026-11-07, the low-confidence
  vessels always show, faded, with no option to hide them; hiding vessels to help ground truth belongs in the Ground Truth Tasks. Test: `studies/vascular/tests/test_model_page.py`.
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

- `req/vascular/truth/marks` While tagging, an area done is cut out of the stack, blacked out through every slice.
  <details>

  Changed by the owner on 2026-11-07: an area done is blacked
  out of the 3D stack in the whole-image view, so what is left to review stands out and the work shows as it is done.
  Inside an area nothing is cut out, since the work there needs the signal it judges. It is a progress mark for
  tagging, not for viewing (owner, 2026-11-07): the Show menu's Cut out what is done switches it, and out of tagging
  (`req/shell/ground-truth/tagging`) nothing is cut out and the row is off. The current area is framed
  on the whole image, and the current junction is drawn white over a dark rim, which reads over any signal. Test:
  `studies/vascular/tests/test_vessel_tasks_page.py`.
  </details>

- `req/vascular/truth/order` The areas come one after another, all of an area's work before the next.
  <details>

  As NoR's (`req/nor/truth/order`): the stack's field is cut into areas, never drawn on the stack, the rows of areas top to
  bottom, each row the way back from the last; all of an area's work, its lines, its missed vessels and its junctions,
  before the next area. Changed by the owner on 2026-11-07: how many areas is the person's to choose in the tasks
  box (from one area for the whole field to 10 × 10, 4 × 4 at first), since a bigger area is sometimes the better one to judge
  whole; an area done stays done in every area it covers whatever is chosen after. Test:
  `studies/vascular/tests/test_vessel_tasks_page.py`.
  </details>

- `req/vascular/truth/tasks` Ground Truth Tasks, in the shell's box under Processing: a row per area of the stack, then Submit.
  <details>

  Set by the owner on 2026-11-07, replacing the three steps per area (Lines, Missed vessels, Junctions) set earlier
  that day, which replaced the vessel-by-vessel tasks of 2026-11-04. The tasks are the stack's areas
  (`req/vascular/truth/order`). Once a model is open the box's first row chooses how many areas, then come Start GT
  tagging, a bar split into a part per area, as wide as the area has junctions and filled as far as they are judged,
  a row per area in the walk's order, "Area 1" to "Area 16", a check once it is done, and Submit Ground Truth last.
  Execute leaves the stack in view as it was; the walk opens on its first area not done only once Start GT tagging is
  pressed (`req/shell/ground-truth/tagging`), and Stop tagging gives the whole stack back, as the Show menu sets it.

  While tagging, and only then, the areas float as a small map at the main view's top left, the shell's minimap's
  size (`req/shell/image/minimap`), on the whole stack and in an area alike: each area done, partly judged or not
  started, the current one marked; clicking one opens it. Under the areas the map shows the stack, never in 3D but
  every slice flattened, each pixel its brightest, in the colours the image box paints it, so the person sees where to
  go next; an area's mark is a tint the stack shows through (owner, 2026-11-10).

  The open area's row holds its cogwheel and Skip, and under it the area's work, all in one pass: the main view shows
  the area alone, opening from straight above, the model's lines over the stack with a handle on every point and a
  glyph on every junction, turning and panning in 3D as anywhere. Dragging a handle from straight above moves its point
  across the picture, never in depth; turned, across the screen at its depth; a tip dropped on another vessel attaches
  there, a junction made. The right-click menu deletes, adds a bend, connects or splits a junction into vessels that
  cross, as anywhere (`req/vascular/model/correct`); right-clicked on the image where no line is, it offers Draw a
  missed vessel, its first point there; while it is drawn, the line's end snaps onto the point or vessel under the
  pointer, lit as a dragged tip's target is, never onto the vessel being drawn, and the click joins it there (owner,
  2026-11-08). A low-confidence line, faint, is kept by clicking it. Each junction in the
  area in turn, ringed on the view and pictured in the box, is a real junction or vessels that only cross at
  different depths (split then); clicking a junction on the view makes it the current one. "Area is right", on once
  every junction there has a verdict, does the area: every confident vessel whose middle lies in it is accepted,
  every low-confidence one not kept is declined, and the walk moves to the next area not done. There is no button to
  draw a missed vessel, none saying no vessel was missed, and none ending the junctions apart (owner, 2026-11-07).

  Holding Ctrl shows the model alone, and letting it go the lines over the stack again (owner, 2026-11-07). While an
  area is open a Model label sits right above the 3D view's Panning label, alike: filled blue while the model shows alone,
  a faded grey "ctrl" right beside it; clicking it keeps the model alone on or off, as Panning's click does (owner,
  2026-11-08). At the toolbar's left, in the Show menu's place, a big Back to image button leaves the area
  for the whole stack, where the Show menu is again; in the same place, Back to task returns to the area. Each area
  done is kept in the model's `reviewed_regions` as the area's box, with its `step`, `area`; in a file from the three
  steps, an area counts done where its `lines`, `missed` and `junctions` boxes all cover it. Test:
  `studies/vascular/tests/test_vessel_tasks_page.py`.
  </details>
