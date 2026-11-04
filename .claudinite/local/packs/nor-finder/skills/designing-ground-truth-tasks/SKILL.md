---
name: designing-ground-truth-tasks
description: How a study's page lets a person make ground truth - the left bar's tasks, one item at a time, area by area, what is done cut out of the image. Use when building or changing any study's ground-truth controls (its GT or PostGT stage), or reviewing them.
metadata:
  body: guidelines
  usage:
    expect: judgment
---

# Designing a study's ground-truth tasks

While a study is in its GT or PostGT stage, the page exists to make ground truth, not to look at
results. The person is working through a to-do list; the page should give them the pace of one
item, one verdict, the next item, and show the progress on the image itself. The NoR study is the
reference build: `req/nor/truth/tasks`, `req/nor/truth/order` and `req/nor/truth/marks` in
`dev/requirements/requirements.md`, `studies/nor/web/nor.js`, and its test
`studies/nor/tests/test_truth_tasks_page.py`.

## What the page is while ground truth is made

- **Statistics are for viewing, not for making ground truth.** Hide the study's summary,
  histograms and CSVs in a GT stage; they stay in PreGT and Published. A ground-truth tasks box
  takes the summary's place in the left bar.
- **The main area is the image, always.** No item view and no switch to one: mark the study's
  `#items-view` with `data-viewing` and the shell drops it and its switch in a GT stage
  (`req/shell/views/second`). No card hovers over the image; picking an item on the image makes
  it the current task's item.
- **The display markings give way to the tasks' own.** Colour codes, numbers, reasons and
  measuring lines are noise here. An item waiting for review is a faint thin outline; the current
  one has a ring in a colour the data does not carry. The Show menu above the image stays, its rows
  switching the tasks' markings under the tasks' names (Finalists, Rejected, Cut out what is
  done, Frame the area), so viewing and tagging speak one vocabulary.
- **What belongs to the statistics leaves with them.** A summary mask, or anything else drawn for
  the summary, is neither drawn nor warned about while the summary is hidden.

## The tasks

- **Tasks in the order the work is done, Submit last.** Review what the algorithm accepted,
  then what it rejected, then look for what it missed, then submit. The submit button is the
  last task, not a toolbar button.
- **One row per task, saying only what is not already said.** "13/47 Finalists": the count once,
  done over total, no "Review the …" (the whole box is the review), no second count anywhere.
  No radio buttons or circles: a done task gets a check, the others nothing.
- **A progress bar split into one part per task**, each as wide as its task is long and filled as
  far as it is done, so a finished batch reads at a glance. No total written beside it.
- **The open task's tools go on its own row**: a cogwheel opening the item's options as a popup,
  a small Back link and a small Skip link. Back returns to the item the person was on before, as
  far as they like, so a verdict, a skip or a measurement can be changed; it slides the other way.

## One item at a time

- **Only the current item, never a list of cards.** Show it under its task's row; every other
  task stays a single row.
- **The item's image gets the box's whole width**, the verdict buttons big and side by side under
  it. No number, state, separator or go-to control on it: its place is the ring on the image.
  Every task's item is shown and corrected alike, the ones the algorithm rejected too, since a
  rejection the person overturns needs its measurements set before it is approved. A correction
  shows only its undo ("Reset measurements"), never a label saying it was made.
- **A verdict moves on by itself**: to the walk's next item not done, and once none is left to
  Submit. A verdict or a Skip slides the next item in over the last
  (none under reduced motion). Pan the image to the item only when it is out of the middle of the
  view.

## Progress the person can see

- **The tasks are one walk, area by area**, never one pass per task: cut the image into a grid
  (NoR: 10 × 10, a fraction of the image, never a pixel size), take the rows of areas top to
  bottom, each row the way back from the last so the next area borders the one just done, and in
  each area do every task's items there (NoR: its finalists, its rejected, what was added there,
  each top to bottom), then its check for missed items, before the next area. Separate passes
  leave every region unfinished until the last one reaches it. The task rows are counters; the
  current item's row is the open one, and clicking a row goes to its next item along the walk.
- **Frame the area the walk is in** on the image, zooming in when it is small there as the walk
  enters it. The grid itself is never drawn.
- **Cut what is done out of the image.** A decided item's own rectangle (approved or rejected
  alike) is removed as it is decided, and once an area is done, every item decided and it checked,
  the whole area goes, showing a picture behind the image instead: a reward that grows with the
  work, black while the study names none. The study names it in `study.json`'s
  `groundTruth.reveal` as a link the browser fetches from where the picture lives (NoR: a golden
  retriever), never a file the site serves; its host is a service the page reaches, so the privacy
  page names it.
- **The area's check is its last step**: let the person add what the algorithm missed there,
  each added item a step of its own, and a "No missed … here" button checks the area. The
  missed-items task is done when every area is checked and every added item decided.

## Testing it

- **Drive the tasks in a GT stage, the viewing parts in PreGT.** A page driver serves the
  study's `study.json` with the stage it needs; the item views, the summary and the Show menu are
  only reachable outside a GT stage, and a driver that needs them asks for one.
