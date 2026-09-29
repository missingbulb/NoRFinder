# Where the web page's memory goes (Pyodide)

Question (Ariel, 2026-09-29): the memory breakdown for Pyodide and its libraries on the NoR
Finder page, options to reduce it, and other solutions. A pure performance change: the finders'
output may not change, and moving off Python is doubtful because the lab loop is Python.

Measured on the reference slide (1200 x 1200, three channels) with two tools here:
- `mem_live.mjs` drives the page's `worker.js` in headless Chromium and reads each Chromium
  process's proportional set size (PSS, so shared libraries count once) after each stage.
- `mem_breakdown.mjs` runs the same steps under Pyodide in Node (the same V8 and WebAssembly
  runtime), where each part can be read directly: WebAssembly memory, the in-memory filesystem,
  V8's heap. `--lazy` measures the install proposed below, and it prints a hash of the page's
  outputs (candidates, segments, first refilter) so two install methods can be compared.

Earlier notes quoted "about 1 GB before any finder runs". That was the sum of each Chromium
process's resident set, which counts shared libraries once per process. By PSS it is about
620 MB before a finder runs and 955 MB after traffic light.

## The breakdown in Chromium (traffic light, the code of PR #257, local preview)

| stage | PSS added | what it is |
|---|---|---|
| Chromium with the page open, no worker | 167 MB | browser, GPU, utility and renderer processes; fixed |
| Pyodide runtime and Python stdlib | +95 MB | the interpreter's compiled WebAssembly and its 30 MB of memory; fixed |
| packages installed and imported | +357 MB | see below |
| slide opened, blue mask built | +128 MB | three float64 channels kept (27 MB); the load's peak is 76 MB natively |
| detect + first refilter | +208 MB | tl's working arrays: a native peak of 248 MB of which 12 MB are kept |
| **total** | **955 MB** | |

The +357 MB for packages splits into:
- **109 MB of files.** Pyodide unpacks each wheel into an in-memory filesystem, so every file of
  every package stays in RAM whether or not it is imported: scipy 45 MB, scikit-image with its
  dependencies 51 MB (scikit-image 16, the rest matplotlib, fonttools, networkx, pywavelets,
  imageio and friends that the finders never import), numpy 10 MB.
- **~170 MB for native modules.** `loadPackage` loads every compiled module of every package it
  installs, 194 of them (scipy 106, scikit-image 54, numpy 13, matplotlib 8, ...), whether Python
  ever imports them or not. The finders need 64. Each loaded module costs its compiled machine
  code plus V8's bookkeeping, several times the module's size on disk.
- **~78 MB of WebAssembly memory:** the modules' static data and the imported Python modules.

WebAssembly memory never shrinks. Whatever a step allocates at its peak stays with the tab until it
closes, so the transient arrays of a detect cost as much as kept ones, and switching finders keeps
the largest peak seen so far.

## Options that keep the output identical

1. **Install lazily** (measured). Unpack only the wheels the finders import (numpy, scipy,
   scikit-image, lazy_loader, packaging, pillow, tifffile) with `pyodide.unpackArchive` instead
   of `loadPackage`, and let Python load a native module the first time it is imported. Same
   wheel files, same binaries, same Python code. About 20 lines in `web/worker.js`, including
   the SHA-256 check that `loadPackage` does today.
   - Chromium: tl 955 → 852 MB (−103 MB, −11%), rf 962 → 845 MB (−117 MB, two runs each,
     within 3 MB); Pyodide ready 20 → 15 s.
   - Node: 1221 → 797 MB for tl; V8 there keeps far more bookkeeping per module, so the
     saving is larger than in Chromium.
   - Output hash identical for all five finders (tl, rf, fill, walk, blobs).
   - The first download drops the packages never imported (matplotlib, fonttools, networkx,
     pywavelets, imageio, pytz, setuptools, micropip, ...), about 12 MB of the ~40 MB.
2. **Lower the finders' peaks** (not measured in the browser). tl allocates 248 MB of temporaries
   at its peak and keeps 12 MB; rf 157/9, fill 169/1, walk 73/7, blobs 59/9 (native tracemalloc).
   Since the tab keeps the peak, freeing big intermediates sooner, working in place, or
   processing in strips lowers the tab's memory for good. Each change is checked the way the
   perf ledger does it (`perf.py check`: bit-identical output). tl is the target, with up to
   ~200 MB to win; this is the largest remaining item.
3. **Drop scikit-image** (estimated). The finders call only `watershed` and `reconstruction`
   (h-maxima) from it, plus `perimeter` and `threshold_otsu`. Replacing them with our own
   numpy/scipy code saves its 16 MB of files, its 16 loaded modules, and 9 MB of download,
   roughly 30-50 MB in Chromium. It only counts if the replacement is fuzzed to be
   bit-identical to scikit-image, which is real work for watershed. Behind 1 and 2.
4. **Prune unused files after unpacking** (estimated). scipy subpackages the finders never
   import (stats, optimize, io, signal, interpolate, integrate, fft, ...) and every `tests/`
   directory are about 25 MB of the remaining files. A missing file fails loudly as an
   ImportError, never silently, but the list has to be kept current as the code and scipy change.
   Small win for the upkeep.

Not options: float32 working images (changes output at ties, see the ledger's 09-27 row); a
server (the page is required to run without a backend, R8); anything below Chromium's 167 MB
or Pyodide's 95 MB.

## Other solutions than Pyodide

- **Port the finders to JavaScript or Rust/WebAssembly.** The memory would drop to roughly
  Chromium plus the working arrays (about 400 MB for tl, less in float32), and it would load in
  seconds. But it is a second implementation of every finder, of `scipy.ndimage` and of
  watershed, and it would have to be kept in step with every change the lab makes in Python.
  The lab would stay Python either way, so the page would always trail it. Not worth it while
  the algorithm is changing (the same conclusion as README.md).
- **Other in-browser Pythons** (MicroPython, PyScript's MicroPython build) have no numpy or scipy.
  PyScript with Pyodide is Pyodide itself.
- **Run the finders natively on the user's machine** (a local helper the page talks to). Native
  memory would be the ~390 MB peak RSS measured by `bench.py`, but every user would need to
  install and run something, which the page exists to avoid.

## Recommendation

Stay on Pyodide and Python. Take option 1 now: it is small, mechanical, and proven identical on
every finder. Then work on option 2 inside the perf loop, starting with tl, since the finders'
peaks are the largest part left that is ours to change.
