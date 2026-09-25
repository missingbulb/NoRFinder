# Raw data — where it lives and how to get it

The microscope files are **not in this repository**. They live in the owner's Google Drive;
[`sources.json`](sources.json) names each one, and a fresh session fetches them:

```
pip install -r requirements.txt
python3 src/fetch_data.py
```

To fetch only some files, pass one or more path globs:
`python3 src/fetch_data.py -m 'Left Up- Edited/Slide2*'`.

They land in `data/raw/` (git-ignored, gone with the container). Every file is checked against
the SHA-256 in `sources.json`; a mismatch stops the run. The first fetch of a new source runs with
`--pin` to record its checksums (and, for a folder, its file listing), and that manifest change is
committed. Requirement: [`docs/requirements.md`](../docs/requirements.md) R6.

**Adding data:** put it in Drive, share it as **"Anyone with the link"**, add an entry to
`sources.json` (`kind: "file"` with `"sha256": null`, or `kind: "folder"` with `"files": null` and
optional `skip` globs), run `--pin`, commit.

## Sources

All under the owner's shared Drive root
[`NoR-VascularColoring data`](https://drive.google.com/drive/folders/1HfpSQ4ndHfBeUotSv4FXzoTyYDOeia7F),
whose `NoRFinder/` subfolder is the one source here.

| name | what | status |
|---|---|---|
| `owner-scans` | 55 single-plane images (2026-09-25) in three field-position subfolders — `Left Up- Edited` (19), `Down Middle- Edited` (18), `Up Middle- Edited` (18) — over six slides × up to four slices each, `4AP` condition. Names carry the owner's own notes (`_not so good`, `_opt2`, `_option2`): several fields have more than one edited version. 454 MB. | **Pinned** 2026-09-25, 55 files, listing checked against Drive's own folder view. The folder was still being filled while it was pinned: re-run `--pin` after an upload. |

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

Gotchas:

- A link shared only with named people redirects to `accounts.google.com` (gdown: `status code
  401`) — fix the sharing, not the code.
- **gdown's folder listing is not reliable on its own.** On 2026-09-25 it listed 12 of a folder's
  13 files once and all 13 on the next call. So `--pin` re-lists every time and only *adds*
  entries (a recorded checksum is never overwritten), and a fresh pin is checked against Drive's
  own view: `https://drive.google.com/embeddedfolderview?id=<folder id>` lists the same files as
  `flip-entry-title` entries.

## The microscope

Tel Aviv University's **Marianas spinning-disk confocal**
([facility page](https://en-med.tau.ac.il/marianas-spinning-disk-confocal-sicf)) — per the owner,
the same instrument as the sibling VascularColoring project. The page lists lasers 405, 488, 561
and 640 nm, objectives 20×, 60× oil and 100× oil, SoRa super-resolution, and a 95% quantum-efficiency
camera. It names no vendor or software.

**Measured from the files (2026-09-25):**

- The raw acquisition is **3i SlideBook** (`.sld`, named in every file); these TIFFs were saved
  from it through **ImageJ 1.54p** (Bio-Formats import), which is why they carry ImageJ metadata.
- Frames are **1200 × 1200, 16-bit** — the geometry of a Photometrics Prime 95B sCMOS
  (11 µm pixels, 95% QE).
- Pixel size, as stored: **0.17460 µm/px** in every file (`XResolution` 5.727272 px/µm,
  unit micron). That is exactly 11 µm ÷ **63**, not ÷ 60 — so a 63× objective, or 60× with a
  1.05× relay; the facility page's objective list may be out of date. Read the value from each
  file (requirements R3) rather than this note.
- The sibling project's 20× stacks store 0.55 µm/px = 11 µm ÷ 20 — the same camera.

## Handling these files

- **Each file is one z-plane, three channels** (`CYX`, uint16, ImageJ "composite"). No z-stack:
  the "Edited" files are single chosen planes, so the reference method's z-based horizontality
  criterion has nothing to work on here.
- **Neither channel position nor display colour says which stain a channel is.** The stored
  display colours (ImageJ LUTs) come in three arrangements — R,G,B (26 files), B,G,R (28), G,R,B
  (1) — and the nuclear channel is **ch1 in 50 files and ch3 in 5** (the `Slide1` files and
  `Slide2 … Slice1_up_left.2tif`), in some files displayed *red*. Identify DAPI by content: it is
  the channel of large round blobs. A blob-size test (mean connected-component area of the top
  3% after a σ=2 px blur) picked it correctly in 54 of 55 files; it failed on
  `Up Middle- Edited/Slide3 … Slice3_up_middle2.tif`, where a bright tissue edge in another
  channel outscored the nuclei. Check by eye.
- **Caspr vs Nav1.6 between the other two channels is not yet established.** In the files whose
  display colours match the brief (Caspr green, Nav1.6 red), a crop shows green–red–green
  triplets along the fibres, as expected. Whether the green-displayed channel is Caspr in *every*
  file is an assumption until the owner or the lab confirms the export's channel order.
- **The raw `.sld` holds more than these exports** — the z-stack, channel names and wavelengths
  (none of which the TIFFs carry). Reading `.sld`/`.sldy` needs Bio-Formats (Java) or 3i's own
  tools; ask for it only if a missing piece blocks work.
