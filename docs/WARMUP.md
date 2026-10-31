# Repo warm-up — read this first

The repo is **one page and several studies**. The page (`web/`, the shell) knows how to load an
image, run Python in the browser, show the image, keep the user's settings and send ground truth to
GitHub. A study (`studies/<id>/`) is one piece of research: its data, its algorithms, its own flow
on the page, its ground truth and its docs. The shell knows no study; a study knows the shell only
through the contract below. [`dev/requirements/requirements.md`](../dev/requirements/requirements.md) states what the page must do, the shell's part and each study's.

Working on a study? Read its own warm-up next: [NoR Finder](../studies/nor/docs/WARMUP.md), [Vascular Measurements](../studies/vascular/docs/WARMUP.md).

## Layers

| Layer | Where | Swapped by |
|---|---|---|
| Shell: loading (computer, Google Drive), the Python runtime, status and memory, notices, theme, side bars, version history, downloads, ground-truth submission | `web/` | — |
| Viewer: shows the opened image and what a study draws over it, zoom, pan, the minimap, each channel's row and its black and white points (`web/channels.js`) | `web/viewer2d.js` | a study's `viewer` |
| Study: its panels, its flow, its Python | `studies/<id>/` | `/<id>` (rauntruth.com/nor) |

A 3D viewer is a second module beside `viewer2d.js` with the same interface; a method shared by
several studies (the NoR study's candidates-then-filters flow, say) is lifted out of its study once a
second study needs it, not before.

## The study contract

A study is a folder with a `study.json`:

- `listed` — whether the header's study switcher offers it (`true` or `false`; the fixture is not).
- `viewer` — the viewer it is shown in (`image2d`).
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
- `files` — what Load accepts, the text the empty view shows, and optionally `drive`, the Google Drive
  folder the Drive dialog opens on in this study.
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
as many as `channels` lists, else as the study's `channels`, any bytes after them the study's own) and `call(action, args)` (JSON result and optional bytes). The shell forwards
every call and knows none of their meanings; Unload has it let the open image go. `mount(shell)` returns the study's hooks; the list, and
what `shell` offers, heads `web/shell.js`, and the viewer's own heads `web/viewer2d.js`. The header's
switcher swaps studies in place, in the same page and the same Python, so a study must be able to
leave: every listener it adds outside its own panels takes `shell.signal` (requirement 1.30).
`studies/fixture/` is the smallest study there is; the shell's own tests run on it.
`studies/viewer/`, the Image Viewer the page opens on, is the study with nothing of its own: what the
shell shows there is what every study gets.

The shell publishes a study's `study.json`, its `web/` folder (Python there stays home) and the
modules directly in its `python.paths` folders, and nothing else of it (requirement 1.8): keep the
page's files in those places, and everything else in the study is research that never ships.

## Run

```
pip install -r requirements.txt
python3 -m pytest web-tests studies -m "not full"
python3 dev/tools/build/build.py
python3 dev/tools/build/serve.py 8000
```

then open `http://localhost:8000/` (the Image Viewer), `http://localhost:8000/nor` or
`http://localhost:8000/fixture`. `serve.py` serves `/nor` from the `nor.html` the build writes, as
Cloudflare does; a plain file server would answer a reload there with a 404.
The build assembles under `dev/build/site/` exactly what is published (requirement 1.8), with the
page at the root as rauntruth.com serves it (requirement 1.27); serving the repo root instead and
opening `/web/` shows the page with every file of every study reachable.
The full set (`python3 -m pytest web-tests studies`) also needs Node, Pyodide
(`npm i --prefix web-tests pyodide@314.0.7`, as CI does) and Playwright's Chromium.

## Map

```
web/              the shell, the viewer, the Python runtime (worker.js, bridge.js)
web-tests/        the shell's tests, run on the fixture study
studies/nor/      the NoR Finder study: study.json, web/, detection/, data/, docs/, tests/
studies/vascular/ the Vascular Measurements study (unlisted): study.json, py/, web/, analysis/, data/, docs/, tests/
studies/viewer/   the Image Viewer, the page's default: any image, no analysis
studies/fixture/  the smallest study, for the shell's tests (`/fixture`)
docs/             this map
dev/requirements/ the page's one spec: the shell, the repo's checks, each study's page
dev/tools/build/  the site build, the version history, the logo tracer and the tests' pytest hooks
dev/build/site/   the published tree: the build assembles the shell (at its root) and the studies'
                  published parts here; wrangler.json uploads it to Cloudflare (rauntruth.com)
```
