# The page's requirements

What a person using the page sees and can do, in one place: the shell (`web/`) whichever study it
runs, the repo's checks, then each study's own page. Each line is a requirement; its detail and its
test fold under it. A study's research requirements, which no user sees, stay in the study's docs
([NoR Finder](../../studies/nor/docs/requirements.md)).

## `1` The shell, whichever study it runs

- `1.1` The shell knows no study.
  <details>

  Nothing in `web/` names a study, its channels, its algorithms or its flow. Everything
  study-specific reaches the page through the study's `study.json`, its Python entry module and its
  `mount(shell)`. Test: `tests/test_study_contract.py` reads `web/` for the NoR study's own words,
  and the shell's page tests run on the fixture study, which shares none of them.
  </details>

- `1.2` A study is a folder, and the page runs the one `?study=` names.
  <details>

  A study is `studies/<id>/` with a `study.json` that names everything the shell needs, and every
  file it names exists. The page runs the study `?study=<id>` names, the NoR study when none is
  named, so every link to the page from before studies existed opens what it opened then. Adding a
  study changes nothing in `web/`, in the deploy's settings or in CI. Test:
  `tests/test_study_contract.py`.
  </details>

- `1.3` The viewer is the study's choice.
  <details>

  The image a study works on is shown by a viewer the study names (`viewer` in `study.json`),
  behind one interface: show the opened image, draw the study's layers over it, report a pick and a
  lasso in image coordinates, zoom and pan. A 3D viewer is a second implementation of that
  interface, not a change to the shell or to the studies that keep the 2D one.
  </details>

- `1.4` Python is reached through one generic call.
  <details>

  The shell's Python runtime opens a file with the study's `Session(path)` and forwards every other
  request as `call(action, args)`, returning JSON and optional bytes. It never names an action.
  Test: `tests/test_study_runs.py` runs the fixture study through the bridge in Pyodide and through
  the real worker in the page; the NoR study's memory test checks that repeated calls leave nothing
  behind.
  </details>

- `1.5` What a user saved stays theirs: a stored key never changes its name.
  <details>

  A browser key an existing study saves under keeps its name across the split and every later
  change to the shell, so a person's settings, decisions and measurements survive a release.
  </details>

- `1.6` The user sees, and can clear, what this device keeps.
  <details>

  With no sign-in, the user is whoever opened the page on this device. An avatar at the right of
  the header opens a menu whose **Manage storage** dialog lists everything the site keeps on this
  device, each with its size, in six groups, each folded when the dialog opens: the code kept for
  the next visit (Python and its packages, by file); image thumbnails, by the image's full name (by
  its Drive id for one saved before names were kept); image files saved from Google Drive, by name;
  settings, the shell's and the study's; the study's selections per image, by image name; and
  anything else stored under the site that neither the shell nor the study names. Each entry, and
  each group, can be deleted. The shell names its own keys; the study names its keys through its
  `stored` hook, so the shell still names no study (`1.1`). Test: `tests/test_storage_page.py`.
  </details>

- `1.7` Images from Drive open again without a download.
  <details>

  The Google Drive dialog's bottom row holds two remembered checkboxes, **Show thumbnails** and
  **Auto-save images** (both on at first), and beside them a link that opens Manage storage, its
  text the bytes the thumbnails and saved images take on this device. While Auto-save images is on,
  an image downloaded from Drive is kept on this device; an image kept there opens from it, with no
  download, whatever the checkbox says. Test: `tests/test_storage_page.py`.
  </details>

- `1.8` The shell decides what is published.
  <details>

  The published site is the shell's page and, from each study, only what its standard layout says
  the page loads: `study.json`, the study's page part under `web/` (never its Python), and the
  modules directly in the folders its Python is imported from (`python.paths`), which is all the
  page's importer can reach. A study's docs, data, tests and lab notes stay in the repo, and nothing
  in a study says how, where or whether it is published. The build (`web/build.py`) assembles the
  set under `site/`, the tree the release uploads. Test: `tests/test_published_site.py`.
  </details>

- `1.9` Visits are counted without cookies.
  <details>

  The released site loads Cloudflare Web Analytics, which sets no cookies and stores nothing on the
  device. Its token is a repository variable the release writes into the uploaded copy, so a local
  preview or a fork counts nothing. Test: `tests/test_published_site.py`.
  </details>

- `1.10` A header with the logo, the title and a dark/light switch (remembered).

- `1.11` Side bars drag wider or narrower (remembered; a double click restores one).
  <details>

  Folding or unfolding a box never changes a bar's width.
  </details>

- `1.12` No image is ever drawn out of its proportions.
  <details>

  A crop or picture narrower than its box shrinks as a whole (`studies/nor/tests/test_page_layout.py`).
  </details>

- `1.13` A status bar shows the image name, the study's counts, the memory the tab holds and the version.
  <details>

  The memory the tab holds ("Memory Usage", Python's, its files, the page's and an estimate for the
  compiled code and the browser, which a page cannot read; amber past a quarter of the computer's
  total where the browser says it, which the hover names), and the site's version (stamped by each
  release). For the NoR study the counts are the candidates and the finalists.
  </details>

- `1.14` Clicking the version opens a Version history; a bubble points at it after an update.
  <details>

  Clicking the version in the status bar (it has no tooltip) opens a Version history popup: each
  release, newest first, with its date and terse lines on what changed for the user. The lines live
  in [`web/version_history.md`](../../web/version_history.md): a pull request that changes what
  users see adds one under "Next release", and the site build files it under the release that first
  carried that pull request. The browser remembers the version last seen; when the page has been
  updated since and the history names a change in between, a bubble points at the version saying
  "Click here to see what was updated since v…", until the user opens the history or closes the
  bubble with its ×. The history then marks the releases that are new
  (`tests/test_version_history.py`, `tests/test_version_history_page.py`).
  </details>

- `1.15` Load opens an image from this computer or Google Drive, and shines until one is open.
  <details>

  The left bar holds the image: Load, with a dropdown for where from (this computer or Google
  Drive), filled and glowing until an image is open and a plain button with a blue border after.
  </details>

- `1.16` The image's name unfolds what the file says about the image, and nothing it does not say.
  <details>

  Folded at first: the field in µm and px, the pixel size, the bit depth, the ImageJ series, the
  microscope and date when the file names them (the lab's ImageJ exports never do, and the box says
  so), and the software that saved it (`studies/nor/tests/test_file_info.py`).
  </details>

- `1.17` A thumbnail of the part in view, a checkbox per colour layer, and drag, zoom and step by mouse.
  <details>

  Below the image's name a thumbnail shows the part in view, and moves the view when clicked; a
  checkbox per colour layer, in that layer's colour when on, blue off at first. Dragging moves the
  image; scrolling up and down zooms around the pointer in small steps; scrolling sideways steps to
  the study's previous or next item (for NoR, the candidate). The main area's toolbar holds the zoom
  at its right.
  </details>

- `1.18` Google Drive: paste a shared link, no sign-in; browse folders; open on Open, double click or Enter.
  <details>

  The user pastes the link of an image or a folder shared as "Anyone with the link", with no
  sign-in. An image loads at once; a folder lists its images and subfolders to pick from, each image
  with its size, the date it was added to Drive and a small colour thumbnail; the dialog keeps one
  size while the user moves between folders. A click only selects a row; Open (or a double click,
  or Enter) opens it: an image loads, a folder lists its contents. Thumbnails are never read from
  Drive, which answers a burst of reads by refusing the browser for a while, the next image
  included. A study may ship ready-made thumbnails (its `driveThumbs`), each fetched once its row is
  in view; an image opened from Drive saves its own in the browser (the latest 100), shown from then
  on without a download; a PNG shows Drive's own. All are in the colours the page gives the
  channels. A checkbox at the bottom, "Show thumbnails" (on at first, remembered in the browser),
  turns the downloads off; beside it, and in the status bar while they load, how many have arrived
  and their size. It needs the site's Google API key, kept in the repository variable
  `GOOGLE_API_KEY` and written into `web/config.js` at deploy; without one the option is off
  (`tests/test_site_config.py`). The dialog opens on the last link pasted, or else on the lab's
  folder (the repository variable `DRIVE_DEFAULT_FOLDER`), and lists a folder link at once. Nothing
  else read from Drive is kept, apart from the image files Auto-save images keeps (`1.6`, `1.7`;
  `studies/nor/tests/test_drive_dialog.py`).
  </details>

- `1.19` No waiting to start: Python loads in the background from the moment the page opens.
  <details>

  The user picks an image meanwhile, which opens as soon as Python is ready. Its packages download
  while Python itself starts, and the status bar names each stage (downloading, with the megabytes
  so far; installing; loading the study, in the study's own words; ready). Until an image is loaded,
  Load shines, and the study's boxes are folded (their titles open them).
  </details>

- `1.20` Visible waiting: a spinner and the elapsed time, and a sweeping light while the study works.
  <details>

  While an image waits for Python, the page shows a spinner and the elapsed time; while a study's
  action runs (for NoR, a finder), a photocopier's light sweeps back and forth over the image, with
  what it is doing and the elapsed time below.
  </details>

- `1.21` Kind to slow computers: a slow button is held until its action is done; low memory is warned of.
  <details>

  A button whose action can take a while (Load, the study's slow actions — for NoR Find
  Candidates, the view switch, the item tabs, the CSV downloads, the ground truth export, restoring
  the filter defaults) is disabled the moment it is pressed, with a small spinner after its label,
  and comes back only when its action is done, including the worker's answer. A failed request
  frees its button. Browsers do not say how much memory is free, so when the browser reports 4 GB
  or less in all (Chrome and Edge report it), a popup on opening asks the user to close other tabs
  and apps, with tips (tab groups, the shortcut that reopens closed tabs, Memory Saver) and "Don't
  show this again". The page running out of memory shows it whatever was chosen, saying so
  (`studies/nor/tests/test_slow_machine_page.py`).
  </details>

- `1.22` An image shows while it downloads.
  <details>

  An uncompressed TIFF like the lab's paints onto the page from its bytes as they arrive from
  Google Drive, one channel after another in its own colour, with the megabytes so far and the
  elapsed time below; a file from the computer shows at once. Python's own drawing replaces it once
  the image is read. Any other image shows the byte count.
  </details>

- `1.23` An open page knows when it is out of date.
  <details>

  Every 5 minutes it compares its version with the published one; when a newer one is out, the
  version box in the status bar lights up and refreshes the page when clicked.
  </details>

- `1.24` Only our code is fetched fresh; third-party code is cached for 30 days.
  <details>

  Third-party code (Pyodide, its packages, vendored wheels) is cached in the browser for 30 days.
  </details>

- `1.25` Memory does not grow with use.
  <details>

  Opening image after image, running the study's actions again and moving its controls leaves the
  page, its worker and the Python inside holding no more than the last time it did the same thing
  (`studies/nor/tests/test_memory.py`).
  </details>

- `1.26` Ground truth goes to GitHub as a file and a labelled issue; an image from the computer cannot.
  <details>

  The study's submit button opens a popup with the study's checklist of what is left to do, an
  Export file button that downloads the file, and beside it an Open new GitHub issue button: a new
  issue on the repo, labelled with the study's `groundTruth.label` and naming the image, whose body
  says to attach the file. The next step is the blue button: Export file, then Open new GitHub
  issue, then Close; for a local image Close follows the export. An image from the computer cannot
  be submitted: right after it loads, the page says so in one line (at most 15 words), and in the
  popup the issue button is off and says why (`studies/nor/tests/test_ground_truth_page.py`).
  </details>

## `2` The repo's checks

- `2.1` CI runs in two sets, and a test that would skip there fails instead.
  <details>

  The fast set runs on each PR (`.github/workflows/tests.yml`, `-m "not full"`) and needs neither
  Node nor a browser; every test that drives Node, Pyodide or Chromium, or measures speed or memory,
  is marked `full` and runs only in the full set, nightly (the nor-finder pack's `full-tests` task)
  and on every push to main, so it has run on anything a release can ship: a green full run on main
  wakes the site release (`.github/workflows/tests-full.yml`, `tests/test_ci_split.py`).
  </details>

## `3` The NoR Finder page: detect once, filter live, in the browser

Set by the owner on 2026-09-28: the shell running the NoR study with no backend. Its engine is
[`studies/nor/detection/interactive.py`](../../studies/nor/detection/interactive.py), tested by
[`studies/nor/tests/test_interactive.py`](../../studies/nor/tests/test_interactive.py).

- `3.1` One image, one slow step: the finder runs only on Find Candidates.
  <details>

  Loading an image only reads it. The finder runs when the user presses Find Candidates, and that
  button shines while the finder or its settings differ from the last run. Everything else
  (filters, forced markings, the list, the summary) redraws from the stored candidates without
  finding again.
  </details>

- `3.2` The left bar holds the finder and the filters; the right bar the selected candidate, the summary and the downloads.
  <details>

  Below the image box the left bar holds the candidates finder (its "how it works" and its settings
  fold away) and the filters. The main area has a toolbar over two views: the image and the
  individual items, with the button that switches between them at its left.
  </details>

- `3.3` The Show menu switches each kind of marking on and off (remembered).
  <details>

  Accepted and rejected markings, each with its own line width and colour, and the candidate
  numbers, the rejection letters and the measuring lines.
  </details>

- `3.4` One selected candidate, decided on its card with a thumbs up or down.
  <details>

  Clicking a candidate selects it (a thin white ring) and clicking it again deselects it. Its card
  sits in the right bar with buttons to the previous and next candidate by number. Decisions are
  made on cards, not by clicking the image, with a thumbs up (a real NoR, with the lengths shown)
  and a thumbs down (not one) at the card's top, each saying what it does in its tooltip; pressing
  the chosen one again undoes it and lets the filters decide. Pressing either also selects that
  candidate. Cards the user voted up or down have their own border colours. In the item views the
  selected candidate's card is outlined, clicking a card selects it, and switching to the item
  views opens the tab that lists the selected candidate and scrolls its card into sight; the
  previous and next buttons step through that tab's cards.
  </details>

- `3.5` Filters are live dials: each can be switched off, and every marking follows it at once.
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

- `3.6` Detection settings are dials too, and the page says re-finding takes time.
  <details>

  They re-run the finder. Each finder names its main settings (its function's `MAIN`), shown first;
  every setting is under a collapsed Advanced box. Each finder shows a few sentences on how it
  works, and every setting and filter value has a ? that says what it does
  (`detection/finder_help.py`; the test fails when one is missing).
  </details>

- `3.7` All finders are offered; Traffic light is the default.

- `3.8` The blue mask is only a filter: no finder blanks nuclei before finding.

- `3.9` Right-clicking the image adds a NoR the finder missed.
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

- `3.10` The item views show the finalists and the rejected as cards, each with its own Options.
  <details>

  Each candidate cropped on a card: its number, state and decision buttons on top, the crop below
  (with a faint go-to button in its corner that shows it on the image), then "Lengths adjusted"
  with a reset, and the rest. A rejected card names every filter that rejects it by itself, or says
  the user rejected it. Each view has its own Options menu (remembered per view) that sets the order
  of its cards (by number, the default; verified first; verified last; and on the rejected, the most
  rejecting filters first; ties by number; set by the owner on 2026-10-07), the crop's context
  padding, turns each crop so the NoR lies level (finalists only; the rejected are never turned),
  and shows or hides the NoR borders, the measurement bars, the lengths on the crop, the lengths on
  the card and the measurement adjusters. The finalists open with a 4 px padding and everything on
  but the lengths on the card; the rejected open with a 10 px padding and only the NoR borders on.
  The selected card in the right bar uses the options of the view that lists it.
  </details>

- `3.11` A card's adjusters correct its lengths and width by dragging.
  <details>

  The adjusters are the ends of the green-to-green length, the red length and the width, each
  draggable anywhere. The four length and red ends stay on one straight axis, in order. A red end
  only slides along the axis, changing the red length. A green end drags anywhere: the axis turns,
  through it, about the other green end, and the other ends keep their distances from that end. A
  width end sets where along the axis the width is measured and, mirrored, how wide it is. On
  release the crop turns level with the new axis. The new measurements show on the image, the card,
  the summary and the downloads.
  </details>

- `3.12` The summary shows one histogram per measurement of the finalists.
  <details>

  Changed by the owner on 2026-10-07: a count axis, the mean drawn as a line with one SD either side
  shaded, and the mean, SD and n written above it, with no separate table.
  </details>

- `3.13` Download Candidates and Download Summary give CSVs; Submit new GT to GitHub gives the ground truth.
  <details>

  Moved by the owner on 2026-10-07. At the bottom of the Summary box, side by side across its width,
  Download Candidates gives the candidates as CSV (every candidate, its status, its reasons, the
  user's decision and its measurements) and Download Summary the summary as CSV. In the box below
  it, titled Ground Truth, the Submit new GT to GitHub button gives the ground truth
  (`norfinder-ground-truth/2`): a JSON file naming the image (its SHA-256, and where it was loaded
  from: its Google Drive id and link, or "local") that lists only what the user marked: every
  candidate voted up (label 1, with its lengths and length lines, marked adjusted or approved) or
  down (label 0), and every added NoR the user approved (kind `missing`, label 1, with its radius,
  `origin: "added by user"`, its measurements and lines). A candidate nobody voted on is ambiguous
  and left out. The lab's `nor_lab.py --labels` reads it: the labels score detection and the
  checked lengths score measurement (`studies/nor/tests/test_ground_truth.py`).
  </details>

- `3.14` The submit button's icon says how finished the work is; its popup lists what is left.
  <details>

  Changed by the owner on 2026-10-06 and twice on 2026-10-07. A small icon beside the Submit new GT
  to GitHub button's text says how finished the work is: a green check when every finalist has the
  user's verdict, an orange warning when some candidates have one but a finalist does not, and a red
  error when no candidate has one yet or a candidate the user added still waits for a verdict; the
  warning and the error pulse gently. Any animation scrolled out of view is paused, since Chrome
  would keep drawing it. The button itself stays plain. Its popup (`1.26`) carries a checklist of
  short instructions (approve or reject the NoRs you added, vote on at least one candidate, vote on
  every finalist, only images from Google Drive can be exported), each done one crossed out with a
  green check; the added-NoRs line shows only when the user added some, and while a summary mask is
  on a warning that the mask is not exported, never crossed out. The issue names the image (name,
  SHA-256, Drive link, finder, what was marked). With nothing marked the popup says how to mark and
  exports nothing (`studies/nor/tests/test_ground_truth_page.py`). What happens to a submission is
  the study's R10.
  </details>

- `3.15` A lassoed summary mask limits the summary and the CSVs to the candidates inside it.
  <details>

  Set by the owner on 2026-10-06. Add mask, at the top of the Summary box, switches to the image
  view, zooms out to show the whole image and lets the user lasso an area by dragging (Esc
  cancels). The summary then counts only the candidates whose centre is inside the mask, and the
  Candidates and Summary CSVs hold only those; the ground truth ignores the mask. Lassoing again
  adds an area by exclusive or, so a lasso inside another cuts a hole. The mask's borders show as a
  pulsing dashed line, and its inside is tinted a very transparent white only when areas overlap or
  nest. Clear mask, shown while a mask is on, removes it. The mask is remembered in the browser per
  file name (`studies/nor/tests/test_ground_truth_page.py`).
  </details>

- `3.16` The summary gives the finalists' density, in NoRs per mm² when the file has a scale.
  <details>

  Set by the owner on 2026-10-06. The summary and the Summary CSV give the finalists' density over
  the area counted (the mask, else the whole image) in NoRs per mm², from the scale in the file, or
  per million square pixels when the file has none (`studies/nor/tests/test_ground_truth_page.py`).
  </details>

- `3.17` Each candidate keeps one number for as long as a detection lasts.
  <details>

  Numbered top to bottom, finalists and rejected alike. Filters never renumber candidates. Added
  NoRs are numbered after the finder's candidates, in the order added (set by the owner on
  2026-10-07). The image, the cards, the Candidates CSV and the ground-truth file all name a
  candidate by that number (`studies/nor/tests/test_ground_truth_page.py`).
  </details>

- `3.18` Decisions, lengths and added NoRs are remembered per file name.
  <details>

  Decisions and adjusted or approved lengths are saved in the browser per file name and finder,
  tied to each candidate's position; added NoRs per file name.
  </details>

- `3.19` Filter settings persist across images, visits and days; one button restores the defaults.

- `3.20` Every image the study's data list names has a ready-made Drive thumbnail on the site.
  <details>

  Each image named in `studies/nor/data/sources.json` has one (`studies/nor/web/drive_thumbs.py`,
  rerun when that list changes; a test fails until it is).
  </details>

- `3.21` The page runs the lab's code, and at our settings passes what the lab passes.
  <details>

  The Python it runs is the study's `detection/` and `src/` as they are, so the finder stays
  malleable. At our settings, the page passes what the lab passes with the blue mask applied after
  finding.
  </details>
