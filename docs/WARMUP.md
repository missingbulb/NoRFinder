# Repo warm-up — read this first

The repo is **one page and several studies**. The page (`web/`, the shell) knows how to load an
image, run Python in the browser, show the image, keep the user's settings and send ground truth to
GitHub. A study (`studies/<id>/`) is one piece of research: its data, its algorithms, its own flow
on the page, its ground truth and its docs. The shell knows no study; a study knows the shell only
through the contract below. [`requirements.md`](requirements.md) states what that means as tests.

Working on a study? Read its own warm-up next: [NoR Finder](../studies/nor/docs/WARMUP.md).

## Layers

| Layer | Where | Swapped by |
|---|---|---|
| Shell: loading (computer, Google Drive), the Python runtime, status and memory, notices, theme, side bars, version history, downloads, ground-truth submission | `web/` | — |
| Viewer: shows the opened image and what a study draws over it, zoom, pan, the thumbnail, channel toggles | `web/viewer2d.js` | a study's `viewer` |
| Study: its panels, its flow, its Python | `studies/<id>/` | `?study=<id>` |

A 3D viewer is a second module beside `viewer2d.js` with the same interface; a method shared by
several studies (the NoR study's candidates-then-filters flow, say) is lifted out of its study once a
second study needs it, not before.

## The study contract

A study is a folder with a `study.json`:

- `viewer` — the viewer it is shown in (`image2d`).
- `python` — `paths` (folders, relative to the study, its modules are imported from), `entry` (the
  module the page imports), `packages` (from Pyodide's own set) and `wheels` (from PyPI, vendored
  by `web/build.py`).
- `web` — `module`, an ES module exporting `mount(shell)`; `panels`, an HTML file of `<template
  data-slot="…">` elements the shell puts into its slots before mounting; `style`, its stylesheet.
- `files` — what Load accepts, and the text the empty view shows.
- `channels` — the image's channels as the viewer shows them: key (`r`, `g`, `b`), name, title,
  whether shown at first.
- `progress` — the status line while Python installs (`install`), loads the study (`load`), opens an
  image (`open`) and runs each action (by its name).
- `groundTruth.label` — the GitHub issue label its submissions carry.
- `driveThumbs` — optional, the folder of ready-made thumbnails for the Google Drive dialog.

Its Python entry module offers `ready()` (JSON, what the page needs before any image) and
`Session(path)` with `opened()` (JSON meta — `W`, `H`, `um`, `info` — and the viewer's image bytes,
one plane per channel) and `call(action, args)` (JSON result and optional bytes). The shell forwards
every call and knows none of their meanings. `mount(shell)` returns the study's hooks; the list, and
what `shell` offers, heads `web/shell.js`, and the viewer's own heads `web/viewer2d.js`.
`studies/fixture/` is the smallest study there is; the shell's own tests run on it.

## Run

```
pip install -r requirements.txt
python3 -m pytest tests studies -m "not full"
python3 web/build.py
python3 -m http.server 8000
```

then open `http://localhost:8000/web/` (the NoR study) or `http://localhost:8000/web/?study=fixture`.
The full set (`python3 -m pytest tests studies`) also needs Node, Pyodide
(`npm i --prefix studies/nor/detection/browser pyodide@314.0.7`) and Playwright's Chromium.

## Map

```
web/              the shell, the viewer, the Python runtime (worker.js, bridge.js)
tests/            the shell's tests, run on the fixture study
studies/nor/      the NoR Finder study: study.json, web/, detection/, src/, data/, docs/, tests/
studies/fixture/  the smallest study, for the shell's tests (`?study=fixture`)
docs/             this map and the shell's requirements
```
