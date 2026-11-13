# The NoR Finder page's requirements

What a person using the NoR Finder page sees and can do beyond the shell, which
[the shell's requirements](../../dev/requirements/requirements.md) state with the conventions this spec
follows too: tags, their order, **Tentative** and **Undecided**. Its research requirements, which no user sees, are [docs/requirements.md](docs/requirements.md).

## `req/nor` The NoR Finder page: detect once, filter live, in the browser

Set by the owner on 2026-09-28: the shell running the NoR study with no backend. Its engine is
[`studies/nor/detection/interactive.py`](detection/interactive.py), tested by
[`studies/nor/tests/test_interactive.py`](tests/test_interactive.py).

- `req/nor/candidates/add-missed` Right-clicking the image adds a NoR the finder missed.
  <details>

  Right-clicking the image offers "Add a NoR Here": a NoR the finder proposed nothing for. It is not
  drawn as a mask; it gets measuring lines (level, centred where clicked, as long and wide as the
  image's median finalist) that the user corrects on its card, which is selected at once. It lists
  among the finalists, marked by an icon rather than text, and among the rejected once thumbed
  down; its card can also remove it (as can right-clicking it). On the image it shows its lines
  and, until the user gives a verdict, a dashed yellow circle glowing between 0.8 and 0.3 opacity.
  Like any candidate it enters the ground truth only once the user approves it. Added NoRs are
  remembered in the browser per file name, whatever the finder.
  </details>

- `req/nor/candidates/decide` One selected candidate, decided on its card with a thumbs up or down.
  <details>

  Clicking a candidate selects it (a thin white ring) and clicking it again deselects it, as does
  clicking the image where there is no candidate (set by the owner on 2026-11-04). Changed by
  the owner on 2026-10-31: its card alone, with no title, hovers over the image's top right corner
  while a candidate is selected, and only then; buttons to the previous and next candidate by number
  hover over the bottom of its crop. Decisions are
  made on cards, not by clicking the image, with a thumbs up (a real NoR, with the lengths shown)
  and a thumbs down (not one) at the card's top, each saying what it does in its tooltip; pressing
  the chosen one again undoes it and lets the filters decide. Pressing either also selects that
  candidate. Cards the user voted up or down have their own border colours. In the item views the
  selected candidate's card is outlined, clicking a card selects it, and switching to the item
  views opens the tab that lists the selected candidate and scrolls its card into sight; the
  previous and next buttons step through that tab's cards. Set by the owner on 2026-10-31: double
  clicking a candidate on the image selects it and opens the item views at its card, and double
  clicking a card selects it and shows it on the image, as its go-to button does. Changed by the
  owner on 2026-11-03: while the study makes ground truth no card hovers over the image; the
  selected candidate is the current task's, its card in the Ground Truth Tasks box
  (`req/nor/truth/tasks`), and clicking or double clicking a candidate on the image makes it the
  current one there. Test: `studies/nor/tests/test_item_view_page.py`.
  </details>

- `req/nor/candidates/numbering` Each candidate keeps one number for as long as a detection lasts.
  <details>

  Numbered top to bottom, finalists and rejected alike. Filters never renumber candidates. Added
  NoRs are numbered after the finder's candidates, in the order added (set by the owner on
  2026-10-07). The image, the cards, the Candidates CSV and the ground-truth file all name a
  candidate by that number (`studies/nor/tests/test_ground_truth_page.py`).
  </details>

- `req/nor/candidates/remembered` Decisions, lengths and added NoRs are remembered per file name.
  <details>

  Decisions and adjusted or approved lengths are saved in the browser per file name and finder,
  tied to each candidate's position; added NoRs per file name.
  </details>

- `req/nor/cards/adjusters` A card's adjusters correct its lengths and width by dragging.
  <details>

  The adjusters are the ends of the green-to-green length, the red length and the width, each
  draggable anywhere. The four length and red ends stay on one straight axis, in order. A red end
  only slides along the axis, changing the red length. A green end drags anywhere: the axis turns,
  through it, about the other green end, and the other ends keep their distances from that end. A
  width end sets where along the axis the width is measured and, mirrored, how wide it is. On
  release the crop turns level with the new axis. The new measurements show on the image, the card,
  the summary and the downloads.
  </details>

- `req/nor/cards/lazy` The item views draw only the cards near the view, so a long list opens at once.
  <details>

  Set by the owner on 2026-10-31. Every card takes its place in the list at once as an empty
  outline; only those in view and the two rows past it either way are drawn in full, together in
  one go per frame rather than card by card, and the rest are drawn as scrolling brings them near.
  Test: `studies/nor/tests/test_item_view_page.py`.
  </details>

- `req/nor/cards/views` The item views show the finalists and the rejected as cards, each with its own Options.
  <details>

  Changed by the owner on 2026-11-03: the item views are only for looking at what was found
  (`data-viewing`, `req/shell/views/second`); while the study makes ground truth they are not
  shown, and each card is shown one at a time as its task (`req/nor/truth/tasks`). Each candidate cropped on a card: its number, state and decision buttons on top, the crop below
  (with a faint go-to button in its corner that shows it on the image), then "Lengths adjusted"
  with a reset (on a task's card, only a Reset measurements button: the task says the rest; set by
  the owner on 2026-11-04), and the rest. A rejected card names every filter that rejects it by itself, or says
  the user rejected it. Each view has its own Options menu (remembered per view) that sets the order
  of its cards (by number, the default; verified first; verified last; and on the rejected, the most
  rejecting filters first; ties by number; set by the owner on 2026-10-07), the crop's context
  padding, turns each crop so the NoR lies level (finalists only; the rejected are never turned),
  and shows or hides the NoR borders, the measurement bars, the lengths on the crop, the lengths on
  the card and the measurement adjusters. The finalists open with a 4 px padding and everything on
  but the lengths on the card; the rejected open with a 10 px padding and only the NoR borders on.
  The selected card over the image uses the options of the view that lists it. Changed by the owner
  on 2026-11-04: a task's card, finalist and rejected alike, uses one set of options, the finalists'
  (the crop turned level, the measurement bars and the adjusters), so a rejected candidate can have
  its lengths corrected before it is approved; its cogwheel holds them, with no sort.
  </details>

- `req/nor/downloads` Download Candidates and Download Summary give CSVs; Submit Ground Truth gives the ground truth.
  <details>

  Moved by the owner on 2026-10-07. At the bottom of the Summary box, side by side across its width,
  Download Candidates gives the candidates as CSV (every candidate, its status, its reasons, the
  user's decision and its measurements) and Download Summary the summary as CSV. Submit Ground
  Truth, the last of the Ground Truth Tasks (`req/nor/truth/tasks`, moved there by the owner on
  2026-11-03, and shown only in a GT or PostGT study, `req/shell/study/stage`), gives the ground truth
  (`norfinder-ground-truth/2`): a JSON file naming the image (its SHA-256, and where it was loaded
  from: its Google Drive id and link, or "local") that lists only what the user marked: every
  candidate voted up (label 1, with its lengths and length lines, marked adjusted or approved) or
  down (label 0), and every added NoR the user approved (kind `missing`, label 1, with its radius,
  `origin: "added by user"`, its measurements and lines). A candidate nobody voted on is ambiguous
  and left out. The lab's `nor_lab.py --labels` reads it: the labels score detection and the
  checked lengths score measurement (`studies/nor/tests/test_ground_truth.py`).
  </details>

- `req/nor/filters/live` Filters are live dials: each can be switched off, and every marking follows it at once.
  <details>

  Every check in `nor3.CHECKS`, the nucleus rule (N) and one-pixel-per-NoR (O) is a control that
  can be switched off. Each shows a letter, a one- or two-word title and a line saying what it
  means (the page's own names, from `detection/finder_help.py`; the lab's review sheets keep
  theirs), and two counts: how many candidates it rejects, whatever the other filters do, and how
  many only it rejects among the filters switched on (what switching it off would let through), as
  plain text reading "X (Y)" after the cards' thumbs-down icon, whose tooltip explains that X is the
  second and Y the first. Each of its parameters is a dial, and every marking on the image follows
  it at once. A dial moved off our value is marked, with our value as a tick on its slider that puts
  it back. Finder and filter settings use this one control, so tweaking looks and works the same in
  both. A check added to `CHECKS` becomes a control with no page change.
  </details>

- `req/nor/filters/persist` Filter settings persist across images, visits and days; the Balanced preset returns to the finder's own values.

- `req/nor/find/blue-mask` The blue mask is only a filter: no finder blanks nuclei before finding.

- `req/nor/find/finders` All finders are offered; Traffic light is the default.

- `req/nor/find/one-slow-step` One image, one slow step: the finder runs only on Find Candidates.
  <details>

  Loading an image only reads it. The finder runs when the user presses Find Candidates, and that
  button shines while the finder or its settings differ from the last run. Everything else
  (filters, forced markings, the list, the summary) redraws from the stored candidates without
  finding again.
  </details>

- `req/nor/find/settings` Detection settings are dials too, and the page says re-finding takes time.
  <details>

  They re-run the finder. Each finder names its main settings (its function's `MAIN`), shown first;
  every setting is under a collapsed Advanced box. Each finder shows how it works under "How the
  <finder> algorithm works", its steps as a nested list (written as a Markdown outline), and every
  setting and filter value has a ? that says what it does (`detection/finder_help.py`; the test fails
  when one is missing). Changed by the owner on 2026-11-03: the note ends with "<Finder> algorithm shows
  precision of X and recall of Y with its default filters, on N images", in bold, the numbers the finder
  list shows, then "(without filters: …)", the finder's own, not bold (the list and the note are the shell's
  since 2026-11-13, `req/shell/processing/algorithms`, from `web/algorithms.GENERATED.json`, which
  `detection/algorithm_menu.py` writes from `web/finders.GENERATED.json` and `web/finder_metrics.json`);
  each finder in the list carries its own icon, the study's choice; the settings start folded.
  Test: `studies/nor/tests/test_processing_box.py`.
  </details>

- `req/nor/lab-parity` The page runs the lab's code, and at our settings passes what the lab passes.
  <details>

  The Python it runs is the study's `detection/` as it is, so the finder stays
  malleable. At our settings, the page passes what the lab passes with the blue mask applied after
  finding.
  </details>

- `req/nor/layout` The left bar holds Load Image, Processing and Summary, or Ground Truth Tasks while the study makes ground truth.
  <details>

  Changed by the owner on 2026-10-30, 2026-10-31 and 2026-11-02. Below the Image box
  (`req/shell/left-bar/folding`) the left bar holds Processing, the candidates finder (its "how the
  algorithm works" and its settings fold away, and start folded; its "restore defaults" sits with the settings, not in the title row), open
  from the image's opening until Find Candidates and, folded once Find Candidates has run with the finder and
  settings now chosen, titled "<finder> executed"; and Summary, which opens once the candidates are
  found, keeping its name whatever is done. Changed by the owner on 2026-11-04: finding the candidates
  and filtering them are the algorithm's two parts, so the filters and their presets sit in
  Processing, with no box of their own: a Filters fold after Settings, which, like it, starts folded. Test:
  `studies/nor/tests/test_processing_box.py`. The main area has a toolbar over two views: the image and the
  items, a card for each candidate, with the shell's switch between them at its left (`req/shell/views/second`).
  Changed by the owner on 2026-11-03: while the study makes ground truth, Ground Truth Tasks
  (`req/nor/truth/tasks`) takes Summary's place, and the main area is the image alone, with no
  switch and no item view: the image's markings are the tasks' (`req/nor/truth/marks`), switched by
  the Show menu's task-named rows (`req/nor/show-menu`).
  Changed by the owner on 2026-10-31: there is no right bar (`req/shell/left-bar/width`).
  Changed by the owner on 2026-11-04: the item view is shelved (`req/shell/views/second`), so in
  every role the main area is the image alone, with the Show menu above it (`req/nor/show-menu`).
  </details>

- `req/nor/metrics` On the released site each finder and each filter preset shows its precision and recall.
  <details>

  The finder list, the finder's note and the filter presets read the study's measured
  quality (`studies/nor/docs/requirements.md` R11), so that file ships with the page part
  (`studies/nor/web/`), like everything else the page fetches. Test:
  `web-tests/test_published_site.py`, which checks that every file a study's page module fetches is
  published.
  </details>

- `req/nor/show-menu` The Show menu switches each kind of marking on and off (remembered).
  <details>

  Changed by the owner on 2026-11-04: a menu above the image in every role, its rows named as the
  ground-truth tasks name them. Outside ground truth: Finalists and Rejected, each with its own line
  width and colour, the candidate numbers, the rejection reasons and the measuring lines. While the
  study makes ground truth, the tasks' own markings (`req/nor/truth/marks`): Finalists and Rejected
  (each waiting one's faint outline), Added NoRs, Cut out what is done, and Frame the area, all on
  at first. Test: `studies/nor/tests/test_truth_tasks_page.py`.
  </details>

- `req/nor/submit/progress` The submit button's icon says how finished the work is; its popup lists what is left.
  <details>

  Changed by the owner on 2026-10-06, twice on 2026-10-07 and on 2026-11-03. A small icon beside the Submit Ground
  Truth button's text says how finished the work is: a green check when every task before it is
  done (every finalist and every rejected candidate has the user's verdict, and every area is
  checked for missed NoRs), an orange warning when some candidates have a verdict but a task is not done, and a red
  error when no candidate has one yet or a candidate the user added still waits for a verdict; the
  warning and the error pulse gently. Any animation scrolled out of view is paused, since Chrome
  would keep drawing it. The button itself stays plain. Its popup (`req/shell/ground-truth/submit`) carries a checklist of
  short instructions (approve or reject the NoRs you added, vote on at least one candidate, vote on
  every finalist, vote on every rejected candidate, check every area for missed NoRs, only
  images from Google Drive can be exported), each done one crossed out with a
  green check; the added-NoRs line shows only when the user added some. The issue names the image (name,
  SHA-256, Drive link, finder, what was marked). With nothing marked the popup says how to mark and
  exports nothing (`studies/nor/tests/test_ground_truth_page.py`). What happens to a submission is
  the study's R10.
  </details>

- `req/nor/summary/density` The summary gives the finalists' density, in NoRs per mm² when the file has a scale.
  <details>

  Like all of Summary, shown only while the study does not make ground truth (`req/nor/layout`).

  Set by the owner on 2026-10-06. The summary and the Summary CSV give the finalists' density over
  the area counted (the mask, else the whole image) in NoRs per mm², from the scale in the file, or
  per million square pixels when the file has none (`studies/nor/tests/test_ground_truth_page.py`).
  </details>

- `req/nor/summary/histograms` The summary shows one histogram per measurement of the finalists.
  <details>

  Changed by the owner on 2026-10-07: a count axis, the mean drawn as a line with one SD either side
  shaded, and the mean, SD and n written above it, with no separate table.
  </details>

- `req/nor/summary/mask` A lassoed summary mask limits the summary and the CSVs to the candidates inside it.
  <details>

  Set by the owner on 2026-10-06. Add mask, on its own row below the Summary box's title (moved
  there by the owner on 2026-10-31), switches to the image
  view, zooms out to show the whole image and lets the user lasso an area by dragging (Esc
  cancels). The summary then counts only the candidates whose centre is inside the mask, and the
  Candidates and Summary CSVs hold only those; the ground truth ignores the mask. Lassoing again
  adds an area by exclusive or, so a lasso inside another cuts a hole. The mask's borders show as a
  pulsing dashed line, and its inside is tinted a very transparent white only when areas overlap or
  nest. Clear mask, shown while a mask is on, removes it. The mask is remembered in the browser per
  file name (`studies/nor/tests/test_ground_truth_page.py`). Set by the owner on 2026-11-04: the mask
  shows only while the summary does, so while the study makes ground truth it is neither drawn nor
  listed in the submit popup, and comes back with the summary (`studies/nor/tests/test_truth_tasks_page.py`).
  </details>

- `req/nor/truth/marks` While the study makes ground truth, what is reviewed is cut out of the image, revealing a picture behind it.
  <details>

  Set by the owner on 2026-11-03. The markings that look at what was found (pink and blue, numbers,
  rejection letters, measuring lines) give way to the tasks' own. A candidate waiting for the
  user's verdict is only a faint thin white outline, finalist and rejected alike, and the current
  one has a yellow ring. Once the user decides a candidate, up or down, its area (the rectangle
  around its pixels, two pixels wider each way) is removed from the image. The area being worked on
  (`req/nor/truth/order`) is framed in yellow. Changed by the owner on 2026-11-04: once an area is
  done, every candidate in it decided and it checked for missed NoRs, the whole area is removed.
  The Show menu switches each of these markings (`req/nor/show-menu`). The ring, the frame and what is removed
  show only while tagging (`req/shell/ground-truth/tagging`; owner, 2026-11-07), the image otherwise whole.
  Where the image is removed, a picture shows instead, one picture behind the whole image, so the
  review uncovers more and more of it: the study's `groundTruth.reveal`, a link to a picture on
  the web that the browser fetches from there (NoR: a golden retriever; changed by the owner on
  2026-11-04, not a file the site serves), and black while the study names none or it cannot load. Test: `studies/nor/tests/test_truth_tasks_page.py`.
  </details>

- `req/nor/truth/order` The candidates come area by area, so the review fills the image one area after another.
  <details>

  Set by the owner on 2026-11-03. The image is cut into 10 by 10 areas taken row by row, each row
  the way back from the last (so the next area always borders the one just done). Changed by the
  owner on 2026-11-04: the tasks are one walk through the areas, so after a number of verdicts a
  whole region of the image is done rather than candidates scattered over it. In each area its
  finalists, then its rejected, then the NoRs the user added there, each top to bottom, and last
  the area's check for missed NoRs; then the next area. The grid is not drawn; the area being worked
  on is framed (`req/nor/truth/marks`). Test: `studies/nor/tests/test_truth_tasks_page.py`.
  </details>

- `req/nor/truth/tasks` Ground Truth Tasks lists the tasks, one row each; the open one shows one item at a time.
  <details>

  Set by the owner on 2026-11-03. In Summary's place while the study makes ground truth, counting
  once the candidates are found; the walk opens only once Start GT tagging is pressed, and Stop tagging
  closes it, the image left as it is viewed (`req/shell/ground-truth/tagging`). A bar split into one part per task, each as wide as the task is
  long and filled as far as it is done, heads one row per task, each counting only once and never
  repeating that it is a review: "13/47 Finalists", "0/68 Rejected", "0/100 Areas" (the areas
  checked for NoRs the finder missed), and Submit Ground Truth (`req/nor/downloads`); a done task
  is marked done with a check (no marks on the others). The rows count; the work is one walk
  (`req/nor/truth/order`), and the row of the current item's task is the open one. Clicking a task
  goes to its next item not done along the walk. The open task's row carries a
  cogwheel that opens the cards' options as a popup (`req/nor/cards/views`), a small Back link and
  a small Skip link; under it, its candidate's card (`req/nor/candidates/decide`),
  no number, state, separator or go-to button: the crop across the box's whole width, with big
  thumbs up and down side by side under it. A verdict or a skip slides the next card in over the last one (no motion when the user asks
  for reduced motion): the walk's next item not done, and once none is left Submit. Back, set by the
  owner on 2026-11-04, returns to the item the user was on before, as often as they like, to change
  a verdict, a skip or the measurements; it slides the other way. Entering an area frames it on the
  image, zoomed in to fill much of the view when it is small there; inside an area the image pans to
  the candidate when it is out of the middle of the view. An area's check says to right-click where
  the finder missed a NoR there; an added NoR's card waits for its verdict, and "No missed NoRs
  here" marks the area checked. The Areas task is done once every area is checked and every added
  NoR decided. The added NoRs
  and the checked areas are kept per file name. Test: `studies/nor/tests/test_truth_tasks_page.py`.
  </details>
