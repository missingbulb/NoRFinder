# Raw confocal data — where it lives and how to get it

The owner's own microscope stacks are **not in this repository**. They live in the owner's Google
Drive; [`sources.json`](sources.json) names each one, and a fresh session fetches them:

```
pip install -r requirements.txt
python3 analysis/stack_sources.py
```

They land in `data/raw/` (git-ignored, gone with the container). Every file is checked against the
SHA-256 in `sources.json`, and a mismatch stops the run: a stack silently replaced on Drive would
otherwise change every number downstream with nothing here recording why. A checksum is `null`
until the first fetch; that run uses `--pin` to record it, and the manifest change is committed.
This follows the image commit rule in
[`studies/vascular/docs/WORKING-GUIDE.md`](../docs/WORKING-GUIDE.md): real data is worth keeping, but a
170 MB stack cannot go through git (below). Test: `python3 tests/test_stack_sources.py`.

**Adding data:** put it in Drive, share it as **"Anyone with the link"**, add an entry to
`sources.json` (`kind: "file"` with `"sha256": null`, or `kind: "folder"` with `"files": null` and
optional `skip` globs, matched against file names), run `--pin`, commit. A source marked `"on_demand": true` is fetched only when named on the command line.

## Sources

All under the owner's shared Drive root
[`NoR-VascularColoring data`](https://drive.google.com/drive/folders/1HfpSQ4ndHfBeUotSv4FXzoTyYDOeia7F),
whose `VascularColoring/` subfolder is the one source here.

| name | what | status |
|---|---|---|
| `owner-stacks` | The working set: the four stacks below cut to **CD31 only** and to the slices that carry vessels, chosen by the owner in the 3D viewer (2026-10-02): `cd31_ca1_x20_r_1_slices13-30`, `cd31_ca1_x20_r_2_slices1-24`, `cd31_frontal_x20_r_1_slices1-12`, `cd31_frontal_x20_r_2_slices6-29` (slice numbers count from 1 in the original). Layout `ZYX`, 16-bit, pixels unchanged, 0.55 µm/px kept; the source and range are in each file's ImageJ `Info`. 35–69 MB each. | **Pinned** 2026-10-02, 4 files, each byte-identical to the file written from the originals. |
| `owner-stacks-originals` | Four z-stacks from session `4.2.26.sld`, 20×, mouse brain: `cd31_ca1_x20 r 1`/`r 2` (hippocampal CA1) and `cd31_frontal_x20 r 1`/`r 2` (frontal cortex). DAPI + CD31, all 30 slices. ≈165 MB each, in the Drive folder's `Originals uncropped/`. **Fetched only on request:** `python3 analysis/stack_sources.py owner-stacks-originals`. | **Pinned** 2026-09-25, 4 files, checked against Drive's own folder view. |

## Why Drive, and not git

Checked on 2026-09-25, for an owner with no local machine:

- **Plain git:** GitHub blocks files over 100 MiB, and a file added through the browser is capped at
  25 MiB — the owner cannot put a stack there at all.
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
- **gdown's folder listing is not reliable on its own** — on 2026-09-25 it dropped one of a
  sibling folder's 13 files on one call and returned it on the next. `--pin` therefore re-lists
  every time and only *adds* entries (a recorded checksum is never overwritten); check a fresh pin
  against Drive's own view, `https://drive.google.com/embeddedfolderview?id=<folder id>`.

## The microscope

Tel Aviv University's **Marianas spinning-disk confocal**
([facility page](https://en-med.tau.ac.il/marianas-spinning-disk-confocal-sicf)). The page lists
lasers 405, 488, 561 and 640 nm, objectives 20×, 60× oil and 100× oil, SoRa super-resolution, and
a 95% quantum-efficiency camera; it names no vendor or software. The page lists no UV laser, so
DAPI here is excited at 405 nm — not the 340–360 nm the lab quoted, which is the lamp-based band.

**Measured from the files (2026-09-25):**

- The raw acquisition is **3i SlideBook** (`D:\gal\4.2.26.sld`, recorded in each file); the TIFFs
  were saved from it through **ImageJ 1.54p** (Bio-Formats import), so they carry ImageJ metadata.
- Frames are **1200 × 1200, 16-bit** — the geometry of a Photometrics Prime 95B sCMOS
  (11 µm pixels, 95% QE).
- Pixel size, as stored: **0.55 µm/px** (`XResolution` 1.818181 px/µm, unit micron) = 11 µm ÷ 20,
  matching the 20× in the names. Read it from each file, per the WORKING-GUIDE's calibration rule,
  rather than from this note.
- **No z-step is stored**, and no channel names or wavelengths. The owner gave the z-step on
  2026-10-29: **1 µm** between slices, recorded in `sources.json` (`z_step_um`) and read from there
  when a file carries none.

## Handling these stacks

- **The originals' layout: `ZCYX` = 30 z × 2 channels, interleaved** (Bio-Formats `DimensionOrder = XYCZT`);
  `tifffile.imread(path)` returns shape `(30, 2, 1200, 1200)`.
- **Channel 1 = DAPI, channel 2 = CD31** in all four, established by looking at max projections
  (ch1 scattered round nuclei, ch2 branching tubes). The stored display colours are ch1 red, ch2
  green — do not read identity off them. In the sibling NoRFinder data the channel order *varies
  between files*; with four files here it does not, but check each new file by content.
- **These are not the figure panels.** The pipeline so far runs on RGB figure crops and segments by
  *red dominance*. A raw stack is **grayscale 16-bit per channel**: select CD31 by index, never by
  hue.
- **Artefacts:** the CA1 CD31 projection has a few bright rectangular blobs, likely debris, that a
  vessel segmenter must not count.
- **Viewing one in 3D:** `analysis/export_stack_view.py`, which still reads the two-channel originals (see [`studies/vascular/docs/3D-STACKS.md`](../docs/3D-STACKS.md)).
- **A z-stack changes "length".** Centerline length on a max projection under-counts vessels
  running through z; 3D length uses the 1 µm z-step the owner gave (`sources.json`).
- **The raw `.sld` holds more than these exports** (z-step, channel names, wavelengths). Reading
  `.sld`/`.sldy` needs Bio-Formats (Java) or 3i's tools — use only if a missing piece blocks work.
