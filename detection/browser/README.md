# Running the NoR finders in a browser

Question (Ariel, 2026-09-28): can the detection run in a browser? The code is Python
(numpy, scipy.ndimage, a few scikit-image calls, Pillow), about 2,000 lines across
`detection/*.py` and `src/nor.py`. Two routes were compared.

## Measured: the unchanged Python under Pyodide
`pyodide_check.mjs` loads Pyodide 314.0.7 in Node (the same WebAssembly runtime a browser uses),
mounts the repo and runs `nor_lab.py cmp tl rf` with no code changes.

| | native CPython | Pyodide |
|---|---|---|
| tl | 229/463 pass, tp 47 fp 7, 9-10 s | identical, 13 s |
| rf | 265/848 pass, tp 48 fp 9, 3 s | identical, 7 s |
| start-up | none | ~2 s runtime + ~8 s packages (first visit downloads ~52 MB, cached after) |

Scores and reason counts match line for line, so the browser build would be the same algorithm,
not a copy of it.

The page is built: [`web/`](../../web/), requirement R8. It reads the `.tif` with a tifffile wheel
the build vendors, runs Python in a Web Worker, and draws in the page itself rather than through
`render_std.py`. In Chromium, loading the slide, finding with traffic light and the first filter
pass take about 16 s. After that a filter change takes 20-50 ms.

The download can shrink: scikit-image (~10 MB, and it pulls in matplotlib ~7 MB) is used only
for `h_maxima`, `watershed`, `perimeter` and `threshold_otsu`, which could be replaced with
scipy/numpy versions.

## Measuring speed and memory
Three tools, all running the page's path (open the slide, blue mask, detect, first refilter):
- `python3 ../bench.py [FINDER ...]` natively: min-of-3 time per stage, peak RSS per finder
  (each in its own process) and the peak of Python/numpy allocations during detect.
- `node bench_pyodide.mjs FINDER` runs `bench.py` under Pyodide in Node and adds the WebAssembly
  heap's peak (it never shrinks, so a tab keeps its peak). Set `NOR_REPO` to measure another
  checkout, e.g. a worktree of `main` for a before/after.
- `node bench_live.mjs [URL] [FINDER ...]` drives the page's own `worker.js` in headless Chromium,
  the deployed site by default or a local preview URL, and samples Chromium's resident memory.

Install Pyodide for the first two with `npm i --prefix . pyodide@314.0.7` here (`--prefix`, or npm
installs into the repo root's package.json). Results are in `../lab/ledger.md` §4.

## Not measured: porting to JavaScript
A JS port means rewriting every finder and the `scipy.ndimage` / scikit-image calls it relies on
(`label` 23 uses, `gaussian_filter` 20, binary dilation/erosion/fill/closing, `find_objects`,
subpixel `shift`, `affine_transform`, `maximum_filter`, watershed, h-maxima). There is no
maintained JS library that covers that set, so most would be hand-written. It would load
instantly and likely run faster, but it would be a second implementation to keep in step with
every change the lab makes, and the lab loop (`nor_lab.py ablate`, labels, ledger) stays Python.

## Recommendation
Pyodide while the algorithm is still changing: zero drift, measured parity, about 2x slower.
Consider a JS port only once a finder is frozen and load time or speed is a real complaint.
