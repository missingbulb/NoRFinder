# Repo warm-up — read this first

The repo is **one page and several studies**. The page (`web/`, the shell) knows how to load an
image, run Python in the browser, show the image, keep the user's settings and send ground truth to
GitHub. A study (`studies/<id>/`) is one piece of research: its data, its algorithms, its own flow
on the page, its ground truth and its docs. The shell knows no study; a study knows the shell only
through the contract below. [`dev/requirements/requirements.md`](../dev/requirements/requirements.md) states what the shell must do; each study's own page is in its `studies/<id>/requirements.md`.

Working on a study? Read its own warm-up next: [NoR Finder](../studies/nor/docs/WARMUP.md), [Vascular Measurements](../studies/vascular/docs/WARMUP.md), [Bookshelf Reader](../studies/shelves/docs/WARMUP.md).

## Layers

| Layer | Where | Swapped by |
|---|---|---|
| Shell: loading (computer, Google Drive), the Python runtime, status and memory, notices, theme, side bars, version history, downloads, ground-truth submission, Data Management for a study's data managers (`web/data_mode.js`: the folder tree, previews made in the browser by `web/previews_writer.js`, and the study's Drive folders and their access in `web/study_drive.js`), Edit Image in Data Management's Preprocessing (`web/image_edit.js`, what an edit draws in `web/edit.js`, the files written by `web/split.js`), working offline and making a study available offline from the Storage tab (`web/offline.js`, with the service worker `web/sw.js`) | `web/` | — |
| Viewer: shows the opened image and what a study draws over it, zoom, pan, the minimap, each channel's row and its black and white points (`web/channels.js`) | `web/viewer2d.js`; `web/viewer3d.js` adds a 3D view of a z-stack | a study's `viewer` |
| Study: its panels, its flow, its Python | `studies/<id>/` | `/app/<id>` (rauntruth.com/app/nor) |
| The site's own pages around the app: the landing page, privacy, terms, license, icons, poster, the retired root service worker | `site/` | — |

The 3D viewer (`image3d`) keeps the 2D viewer's interface and adds a 3D view beside it; a method shared by
several studies (the NoR study's candidates-then-filters flow, say) is lifted out of its study once a
second study needs it, not before.

## The study contract

A study is a folder with a `study.json`, and a `requirements.md` for what its page does beyond the shell
(`req/<id>`, `req/checks/spec-layout`):

- `visibility` — who the page shows it to: `"listed"` (the header's study switcher and the landing page offer it),
  `"unlisted"` (only by its address; the fixture) or `{"accounts": [email, …]}` (the switcher offers it only while one
  of those Google accounts is signed in). It hides a study from the page, not its files from the network.
- `viewer` — the viewer it is shown in (`image2d`, or `image3d` for z-stacks: the stack in 3D
  only, no switch to a flat view), and optionally `view`, what the 3D view opens with: `render` (`brightest` or
  `surface`), `depthColour`, `spacing` (µm between slices when the file does not say) and
  `spacingSource` (who stated it).
- `python` — `paths` (folders, relative to the study, its modules are imported from), `entry` (the
  module the page imports), `packages` (from Pyodide's own set) and `wheels` (from PyPI, vendored
  by `dev/tools/build/build.py`).
- `web` — `module`, an ES module exporting `mount(shell)`; optionally `panels`, an HTML file of
  `<template data-slot="…">` elements the shell puts into its slots before mounting, and `style`, its
  stylesheet. The slots: `left` (the left bar, below the Image box), `toolbar` (the main area's
  toolbar, at its left), `toolbar-end` (its right end), `view-top`, `views` (beside the image view),
  `over-image` (floating over the image) and `body`; there is no right bar. A `box foldable` section folds
  with the steps: its `data-opens` names the step (`load`, one of its `phases`, `submit`) after which it
  opens, or `user` for one only its title opens, and `data-folds` the step after which it folds again.
- `files` — `from`, the places it opens images from (`local`, this computer, `drive`, Google Drive, or both:
  `req/shell/load/from`), what Load accepts, the text the empty view shows, and optionally `folders`, the study's Google
  Drive folders: the Drive dialog browses them alone, with no link to paste, and Data Management works on them all.
- `permissions` — optional, the Google accounts (by email) holding each role: `data_management` sees Data
  Management, `ground_truth_writer` will write ground truth to Drive. A study's panels step aside while Data
  Management is open.
- `channels` — what the study says of the image's channels, by place: `name`, `colour` (`#rrggbb`),
  `shown` at first, and optionally `about` (the (?)'s description, at most 100 words) and `black` and
  `white` (its first points, 0–255). A channel it leaves out takes what the file says, then its place
  (red, green, blue…); the Image Viewer names none.
- `progress` — the status line while Python installs (`install`), loads the study (`load`), opens an
  image (`open`) and runs each action (by its name).
- `groundTruth.label` — optional, the GitHub issue label its submissions carry.
- `driveThumbs` — optional, the folder of ready-made thumbnails for the Google Drive dialog.

The shell's controls draw from one page state (`web/page_state.js`: the image open, the minimap) and
change only it, never each other; a study reaches it as `shell.page`.

Its Python entry module offers `ready()` (JSON, what the page needs before any image) and
`Session(path)` with `opened()` (JSON meta — `W`, `H`, `um` and `um_y` (the pixel's width and
height in µm, each null when the file does not say), `info`, and optionally `channels`, what the file
says of each channel, `[{name, colour}]` — and the viewer's image bytes, one 8-bit plane per channel:
as many as `channels` lists, else as the study's `channels`; for a stack in `image3d`, `Z` in the meta and every slice of every channel after those planes, channel by channel, and `spacing`, µm between slices or null; any bytes after them the study's own) and `call(action, args)` (JSON result and optional bytes). The shell forwards
every call and knows none of their meanings; Unload has it let the open image go. `mount(shell)` returns the study's hooks; the list, and
what `shell` offers, heads `web/shell.js`, and the viewer's own heads `web/viewer2d.js`; a study draws over the 3D
view through `shell.viewer.three` (its camera, the stack's place in it and its hooks, listed where `web/viewer3d.js` builds it). The header's
switcher swaps studies in place, in the same page and the same Python, so a study must be able to
leave: every listener it adds outside its own panels takes `shell.signal` (req/shell/study/switch-in-place).
`studies/fixture/` is the smallest study there is; the shell's own tests run on it.
`studies/viewer/`, the Image Viewer the page opens on, is the study with nothing of its own: what the
shell shows there is what every study gets.

The shell publishes a study's `study.json`, its `web/` folder (Python there stays home) and the
modules directly in its `python.paths` folders, and nothing else of it (req/shell/site/published-files): keep the
page's files in those places, and everything else in the study is research that never ships.

## Run

```
pip install -r requirements.txt
python3 -m pytest web-tests studies -m "not full"
python3 dev/tools/build/build.py
python3 dev/tools/build/serve.py 8000
```

then open `http://localhost:8000/` (the landing page), `http://localhost:8000/app/` (the Image Viewer),
`http://localhost:8000/app/nor` or `http://localhost:8000/app/fixture`. `serve.py` serves `/app/nor` from
the `app/nor.html` the build writes, as Cloudflare does; a plain file server would answer a reload there
with a 404.
The build assembles under `dev/build/site/` exactly what is published (req/shell/site/published-files), with the
site's pages at the top, the app under `app/` and the studies under `studies/`, as rauntruth.com serves
them (req/shell/site/app-address); serving the repo root instead and
opening `/web/` shows the page with every file of every study reachable.
The full set (`python3 -m pytest web-tests studies -n auto`) also needs Node, Pyodide
(`npm i --prefix web-tests pyodide@314.0.7`, as CI does) and Playwright's Chromium. `-n auto` runs one
pytest-xdist worker per core, as CI does: most of the full set waits on browsers and timers, so it takes about
3 minutes instead of 10. Each test keeps its files under its own `tmp_path`; the one writing into the tree,
the offline test's build, writes each file whole.

## Map

```
web/              the shell, the viewer, the Python runtime (worker.js, bridge.js)
web-tests/        the shell's tests, run on the fixture study
studies/nor/      the NoR Finder study: study.json, requirements.md, web/, detection/, data/, docs/, tests/
studies/vascular/ the Vascular Measurements study: study.json, requirements.md, py/, web/, analysis/, data/, docs/, tests/
studies/shelves/  the Bookshelf Reader, an image-processing outlier: study.json, requirements.md, py/, web/, reading/, docs/, tests/
studies/viewer/   the Image Viewer, the page's default: any image, no analysis
studies/fixture/  the smallest study, for the shell's tests (`/fixture`); states.json, its part of the shell's states tree
docs/             this map
dev/requirements/ the shell's spec and the repo's checks, and the shell's states tree
dev/tools/build/  the site build, the version history and the tests' pytest hooks
dev/build/site/   the published tree: the build assembles the shell (at its root) and the studies'
                  published parts here; wrangler.json uploads it to Cloudflare (rauntruth.com)
```
