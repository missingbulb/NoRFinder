# Raw data — where it lives and how to get it

The microscope files are **not in this repository**. They live in the owner's Google Drive;
[`sources.json`](sources.json) names each one, and a fresh session fetches them:

```
pip install -r requirements.txt
python3 src/fetch_data.py
```

They land in `data/raw/` (git-ignored, gone with the container). Every file is checked against
the SHA-256 in `sources.json`; a mismatch stops the run. The first fetch of a new source runs with
`--pin` to record its checksums (and, for a folder, its file listing), and that manifest change is
committed. Requirement: [`docs/requirements.md`](../docs/requirements.md) R6.

**Adding data:** put it in Drive, share it as **"Anyone with the link"**, add an entry to
`sources.json` (`kind: "file"` with `"sha256": null`, or `kind: "folder"` with `"files": null` and
optional `skip` globs), run `--pin`, commit.

## Sources

| name | what | status |
|---|---|---|
| `owner-scans-2026-09` | Three scans from the owner (2026-09-25). Each subfolder is one scan: many TIFF files, each an **RGB** image. The folder's zip is a duplicate and is skipped. | **Not yet fetchable** — Drive answered 401 / sign-in redirect on 2026-09-25: the folder is not shared "Anyone with the link". Not listed, not pinned, format below unverified. |

## Why Drive, and not git

Checked on 2026-09-25, for an owner with no local machine:

- **Plain git:** GitHub blocks files over 100 MiB, and a file added through the browser is capped at
  25 MiB — the owner cannot put a scan there at all. Even small images bloat history for ever: the
  sibling project `gRatio` committed its PNG samples and outputs and its `.git` reached 199 MB.
- **Git LFS:** the same 25 MiB browser cap (pushing to LFS needs a git client), `git lfs` is not
  installed in the cloud container, and the session's git proxy does not serve LFS objects. Every
  session's download would also bill the owner's LFS bandwidth.
- **GitHub Release assets** (up to 2 GiB each, unmetered bandwidth, downloadable from the
  container — tested) are the fallback if Drive ever blocks downloads.
- **Drive:** the files are already there; `drive.google.com` and `drive.usercontent.google.com`
  are reachable from the container, and `gdown` handles Drive's large-file confirmation page.

Gotchas: a Drive link that is shared only with named people redirects to `accounts.google.com`
(gdown: `status code 401`) — fix the sharing, not the code. gdown's folder listing is documented
upstream as capped (historically 50 files per folder); if a scan folder holds more, the listing
will come back short — compare it against the Drive UI on first `--pin`.

## The microscope

Per the owner, these scans come from the same instrument as the sibling VascularColoring project:
Tel Aviv University's **Marianas spinning-disk confocal**
([facility page](https://en-med.tau.ac.il/marianas-spinning-disk-confocal-sicf)). What the page states:

- Dual Nipkow-disk spinning-disk confocal; **SoRa** super-resolution mode (1.4× resolution,
  further with deconvolution); light-sheet option; live/fixed multicolour, tile scan, multi-position.
- Lasers **405, 488, 561, 640 nm**. Objectives **20×, 60× oil, 100× oil**.
- Camera described as a "CCD" with **95% quantum efficiency**.

What is **inferred, not verified** — check each against the first real file's metadata:

- "Marianas" is Intelligent Imaging Innovations' (3i) system, whose software (SlideBook) writes
  `.sld`/`.sldy`. The owner's lab offered `.vsi`, which is Olympus cellSens's format — so the
  exporting software is worth confirming.
- 95% QE fits a Photometrics Prime 95B sCMOS: 1200×1200 px, 11 µm pixels, 16-bit — about 0.18 µm
  per pixel at 60× before any SoRa magnifier. The VascularColoring raw stacks (≈170 MB for 60
  planes ≈ 2.9 MB per plane = 1200×1200×16-bit) are consistent with it.
- The page lists no UV laser, so DAPI on this scope is excited at 405 nm.

## Handling these files

- **Scale must come from the file** ([`docs/requirements.md`](../docs/requirements.md) R3). The
  owner's current files are **RGB TIFFs** — the shape of an export, which commonly drops pixel
  size and z-step and flattens 16-bit data to 8-bit. On the first real file, read its tags
  (`tifffile`: `ImageDescription`, `XResolution`/`ResolutionUnit`, any OME-XML or ImageJ
  metadata) before assuming either. If the scale is gone, ask the lab for the native file or an
  OME-TIFF export.
- **An RGB channel is not a stain.** Map R/G/B to Caspr / Nav1.6 / DAPI from the lab's colour
  choice (the brief: Caspr green, Nav1.6 red), and confirm it by looking, not by assumption.
- **Many TIFFs per scan** is most likely one file per z-plane (or per tile); establish which from
  the file names and metadata before stacking them.
- **A `.vsi` is only an index**: the pixels are in a sibling folder of `.ets` files, which must be
  uploaded with it. Reading VSI needs Bio-Formats (Java) — a heavy route, used only if the TIFFs
  lack what we need.
