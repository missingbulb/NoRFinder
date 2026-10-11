# The shell's requirements

What the page (`web/`) must satisfy whichever study it runs. A study's own requirements live in its
docs ([NoR Finder](../studies/nor/docs/requirements.md)). Each is stated so it can become a test.

## S1 — The shell knows no study

Nothing in `web/` names a study, its channels, its algorithms or its flow. Everything study-specific
reaches the page through the study's `study.json`, its Python entry module and its `mount(shell)`.
Test: `tests/test_study_contract.py` reads `web/` for the NoR study's own words, and the shell's page
tests run on the fixture study, which shares none of them.

## S2 — A study is a folder

A study is `studies/<id>/` with a `study.json` that names everything the shell needs, and every file
it names exists. The page runs the study `?study=<id>` names, the NoR study when none is named, so
every link to the page from before studies existed opens what it opened then. Adding a study changes
nothing in `web/`, in the deploy's settings or in CI. Test: `tests/test_study_contract.py`.

## S3 — The viewer is the study's choice

The image a study works on is shown by a viewer the study names (`viewer` in `study.json`), behind
one interface: show the opened image, draw the study's layers over it, report a pick and a lasso in
image coordinates, zoom and pan. A 3D viewer is a second implementation of that interface, not a
change to the shell or to the studies that keep the 2D one.

## S4 — Python is reached through one generic call

The shell's Python runtime opens a file with the study's `Session(path)` and forwards every other
request as `call(action, args)`, returning JSON and optional bytes. It never names an action. Test:
`tests/test_study_runs.py` runs the fixture study through the bridge in Pyodide and through the real
worker in the page; the NoR study's memory test checks that repeated calls leave nothing behind.

## S5 — What a user saved stays theirs

A browser key an existing study saves under keeps its name across the split and every later change
to the shell, so a person's settings, decisions and measurements survive a release.
