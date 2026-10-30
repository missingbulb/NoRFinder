# Tools researchers use to view and analyze microscopy images

This page covers the technology only. It is for a team building a **browser-only** analysis tool
(NoR Finder: Pyodide, numpy/scipy/scikit-image/tifffile). For each tool it asks what the tool is,
its licence, platform, file formats and extension model, and what it means for a tool that has
no server and no install. The repo's own notes on its TIFFs are in `studies/nor/data/README.md`
and are not repeated here.

Researched 2026-10-30. Licences were read from each project's own `LICENSE` file at the default
branch on that date, not from aggregators.

## Key insights

- The established browser viewers (Viv, vizarr, Neuroglancer) only display images. None of them analyses.
- A full ImageJ already runs in the browser (ImageJ.JS), compiled from Java rather than Python.
- Every vendor-format reader that matters (Bio-Formats) needs Java, so files are converted on the desktop before they reach us.
- Pyodide 314 ships scikit-image, scipy, OpenCV and scikit-learn, but not tifffile or imagecodecs.
- napari, QuPath, CellProfiler and Icy are desktop-only. What we can use from them is their export formats.


## 1. Summary table

| Tool | Kind | Licence | Runs where | Formats in | Scripting / plugins | Browser relevance |
|---|---|---|---|---|---|---|
| ImageJ 1.x | Desktop app (Java) | Public domain ([LICENSE](https://github.com/imagej/ImageJ/blob/master/LICENSE.txt)) | Desktop JVM | Native TIFF, plus many more via Bio-Formats | Macro language, Java plugins | Defines the ImageJ TIFF dialect our inputs use (see [tiff-format](../tiff-format/README.md)) |
| Fiji | ImageJ distribution | GPL-3.0 ([LICENSE](https://github.com/fiji/fiji/blob/main/LICENSE.txt)) | Desktop JVM | Bio-Formats bundled | Groovy, JavaScript, Jython, native Python ([Fiji page](https://imagej.net/software/fiji/)); update sites | The tool our users already know; its outputs (TIFF, ROI zip) are our inputs |
| ImageJ.JS | ImageJ 1.x compiled to WebAssembly | (see Gaps) | Browser | As ImageJ | ImageJ macros, ImJoy plugins | Proof that a full ImageJ can run client-side ([README](https://github.com/imjoy-team/imagej.js)) |
| napari | Desktop viewer (Python) | BSD-3-Clause ([LICENSE](https://github.com/napari/napari/blob/main/LICENSE)) | Desktop, Qt | Via reader plugins | npe2 plugin manifests, Python API | Its writers set a de-facto label/points exchange format |
| QuPath | Desktop app (Java) | GPL-3.0 ([LICENSE](https://github.com/qupath/qupath/blob/main/LICENSE)) | Desktop | Whole-slide and microscopy images | Groovy scripting | GeoJSON annotation export (see the ground-truth page) |
| CellProfiler | Desktop pipeline app (Python) | BSD-3-Clause ([LICENSE](https://github.com/CellProfiler/CellProfiler/blob/main/LICENSE)) | macOS and Windows builds, Linux from source ([README](https://github.com/CellProfiler/CellProfiler)) | (not verified here) | Pipelines, Python modules | A reference for the batch-measurement model, not something to embed |
| Icy | Desktop app (Java) | Kernel: LGPL-3.0 ([LICENSE](https://github.com/Icy-imaging/Icy-Kernel/blob/master/LICENSE)) | Desktop | (not verified here) | JavaScript and Python scripts, plugins, visual "protocols" ([site](https://icy.bioimageanalysis.org/)) | Low |
| OMERO | Client-server data management | Server GPL-2.0 ([LICENSE](https://github.com/ome/openmicroscopy/blob/develop/LICENSE.txt)) | Server, with desktop and web clients | "Over 150" formats via Bio-Formats ([OMERO page](https://www.openmicroscopy.org/omero/)) | Python, ImageJ, MATLAB, R | Needs a server, so it is the opposite of our model |
| OMERO.iviewer | OMERO.web app | AGPL-3.0 ([plugin/LICENSE](https://github.com/ome/omero-iviewer/blob/master/plugin/LICENSE)) | Browser, served by an OMERO server | Whatever OMERO holds | OMERO.web app | Needs OMERO 5.6+ ([README](https://github.com/ome/omero-iviewer)) |
| Bio-Formats | Java library and command-line tools | GPL-2.0 ([LICENSE](https://github.com/ome/bioformats/blob/develop/LICENSE.txt)) | JVM | Proprietary vendor formats to the OME model | Java API, `bfconvert` | The only route from `.sld`/`.sldy` to an open format (see [tiff-format](../tiff-format/README.md)) |
| Viv / Avivator | JS rendering library and a viewer built on it | MIT ([LICENSE](https://github.com/hms-dbmi/viv/blob/main/LICENSE)) | Browser (WebGL, deck.gl) | OME-TIFF, OME-NGFF (Zarr), indexed OME-TIFF | deck.gl layers | Best precedent for client-side multichannel rendering |
| vizarr | Client-side Zarr viewer | MIT ([LICENSE](https://github.com/hms-dbmi/vizarr/blob/main/LICENSE)) | Browser and notebooks | OME-Zarr, Zarr, OME-TIFF over HTTP range requests, Kerchunk refs | Python anywidget API | Shows that OME-TIFF can be read remotely without a server |
| Neuroglancer | WebGL volume viewer | Apache-2.0 ([LICENSE](https://github.com/google/neuroglancer/blob/master/LICENSE)) | Browser | precomputed, N5, Zarr v2/v3, OME-Zarr 0.4/0.5, NIfTI, Deep Zoom ([README](https://github.com/google/neuroglancer)) | Python in-memory volumes | Built for large EM/connectomics volumes; heavy for a single 2D plane |
| Imaris | Commercial 3D/4D analysis (Oxford Instruments) | Proprietary | Desktop | Native `.ims` (HDF5) | (not covered) | Sets `.ims`; see below |
| arivis Pro / arivis Cloud | Commercial (ZEISS) | Proprietary | Desktop / cloud | (not covered) | (not covered) | arivis Cloud is "formerly APEER" ([ZEISS KB](https://knowledge.zeiss.com/rms/en/arivis-cloud/getting-started/what-is-arivis-cloud)) |
| Huygens | Commercial deconvolution (SVI) | Proprietary | Desktop | ICS/ICS2, HDF5, OME-TIFF without options; vendor formats with the paid "Full File Reader" ([SVI](https://svi.nl/FileFormats)) | Batch processor | Not relevant to the browser |

---

## 2. Per tool

### ImageJ 1.x and Fiji

- **ImageJ 1.x** is public domain: the [LICENSE](https://github.com/imagej/ImageJ/blob/master/LICENSE.txt)
  says the software "is in the public domain". The current source is `VERSION = "1.54u"`
  ([ImageJ.java](https://github.com/imagej/ImageJ/blob/master/ij/ImageJ.java)). Our inputs were
  saved by 1.54p.
- **Fiji** is described as a "batteries-included" distribution of ImageJ
  ([imagej.net/software/fiji](https://imagej.net/software/fiji/)). It is licensed GPL-3.0 and
  supports scripting in Groovy, JavaScript, Jython and native Python. Plugins are distributed
  through update sites.
- **For a browser tool:** ImageJ's own TIFF writer *is* the specification of the files we
  receive. Its source code is the most authoritative reference for the dialect (see
  [tiff-format](../tiff-format/README.md) §2). The Fiji tools researchers use for counting and length
  (multi-point, Cell Counter, line plot-profile) are described on the ground-truth page.

### ImageJ.JS (ImJoy)

- ImageJ was compiled "into WebAssembly and Javascript with a Java compiler called CheerpJ".
  It runs "with all mainstream browsers with one click, no installation and no Java runtime
  environment needed", including on mobile ([README](https://github.com/imjoy-team/imagej.js)).
- URL parameters `open=` and `run=` load an image or a macro from a link. That is a link-sharing
  pattern worth noting for a browser tool.
- **Relevance:** this is the closest precedent for "the researcher's desktop tool, in the
  browser". It is not Pyodide: it runs Java bytecode through CheerpJ.

### napari

- napari is "a fast, interactive, multi-dimensional image viewer for Python… built on top of Qt
  (for the GUI), vispy (for performant GPU-based rendering)" ([README](https://github.com/napari/napari)).
  It is licensed BSD-3-Clause, and the current version is 0.9.2 ([PyPI](https://pypi.org/project/napari/)).
- It is extended through npe2 manifests. The built-in manifest declares writers: **labels** go
  to `.tif/.tiff/.npz/…`, and **points** and **shapes** to `.csv`
  ([builtins.yaml](https://github.com/napari/napari/blob/main/src/napari_builtins/builtins.yaml)).
- **Relevance:** napari will not run in Pyodide. It needs Qt, and its dependencies (`dask`,
  `cachey`, …) are not in the Pyodide 314 lock (see §4). Its *output formats* are relevant,
  though: a label TIFF and a points CSV are what a napari user can hand us.

### QuPath

- "QuPath is open source software for bioimage analysis", with tools to "annotate and view
  images, including whole slide & microscopy images", interactive machine learning, and
  scripting ([README](https://github.com/qupath/qupath)). It is licensed GPLv3 and is "intended
  for research use only".
- It exports objects as **GeoJSON**, and through ImageJ's RoiManager as a ROI **zip**, and as
  binary or labeled images
  ([exporting annotations](https://qupath.readthedocs.io/en/stable/docs/advanced/exporting_annotations.html)).

### CellProfiler

- "Free open-source software designed to enable biologists without training in computer vision
  or programming to quantitatively measure phenotypes from thousands of images automatically"
  ([README](https://github.com/CellProfiler/CellProfiler)). The README badge shows version
  4.2.8. Stable builds are for macOS and Windows; Linux users build from source.
- **Relevance:** its pipeline-of-modules model (load, identify objects, measure, export) is the
  model biologists expect from batch tools. It is a desktop app and is not embeddable.

### Icy

- "An open community platform for bioimage informatics" ([icy.bioimageanalysis.org](https://icy.bioimageanalysis.org/)),
  with plugins, visual *protocols*, and an integrated JavaScript/Python script editor. The
  `Icy-Kernel` repository's licence file is LGPL-3.0.

### OMERO and OMERO.iviewer

- OMERO is client-server. It imports "over 150 image formats" (through Bio-Formats) and lets
  users "export as OME-TIFF" and "publish your raw data straight from the server using URLs"
  ([openmicroscopy.org/omero](https://www.openmicroscopy.org/omero/)).
- OMERO.iviewer is "an OMERO.web app for visualizing images in OMERO". It requires OMERO 5.6.0
  or newer ([README](https://github.com/ome/omero-iviewer)).
- **Relevance:** a lab with OMERO could feed us OME-TIFF exports. Otherwise this is a different
  architecture from ours.

### Bio-Formats

- "A software tool for reading and writing image data using standardized, open formats",
  developed by the OME consortium (Dundee, Glencoe Software)
  ([openmicroscopy.org/bio-formats](https://www.openmicroscopy.org/bio-formats/)). It is Java
  and GPL-2.0.
- Its supported-formats table lists 3i SlideBook `.sld` and SlideBook 7 `.sldy`, Zeiss `.czi`,
  Nikon `.nd2`, Leica `.lif`, Olympus `.oib/.oif/.oir`, Bitplane `.ims`, and OME-TIFF
  ([supported formats](https://bio-formats.readthedocs.io/en/stable/supported-formats.html)).
  Details are in [tiff-format](../tiff-format/README.md) §5.
- **Relevance:** Bio-Formats needs a JVM, so it does not run in the browser. The practical
  consequence is that **conversion from vendor formats happens on the researcher's desktop**,
  and our tool should accept what that conversion produces.

### Browser viewers: Viv / Avivator, vizarr, Neuroglancer

- **Viv** is "a JavaScript library for rendering OME-TIFF and OME-NGFF (Zarr) directly in the
  browser", packaged as deck.gl layers ([README](https://github.com/hms-dbmi/viv); paper:
  [Manz et al., Nature Methods 2022](https://www.nature.com/articles/s41592-022-01482-7)).
  Non-pyramidal images are supported "provided the individual texture can be uploaded to the
  GPU (< 4096 x 4096 in pixel size)". Our 1200 × 1200 planes fit. Viv recommends
  `bioformats2raw` + `raw2ometiff` to convert proprietary formats. **Avivator** is the
  lightweight viewer built on Viv, for local and remote datasets.
- **vizarr** is "a minimal, purely client-side program for viewing zarr-based images". It reads
  OME-Zarr, Kerchunk references, and `ome-tiff://` URLs "served over HTTP with range request
  support" ([README](https://github.com/hms-dbmi/vizarr)). It uses zarrita.js for Zarr access.
- **Neuroglancer** is "a WebGL-based viewer for volumetric data". It is "purely a client-side
  program" but needs data reachable over HTTP. It supports Zarr v2/v3 and OME-Zarr 0.4/0.5,
  plus Chrome ≥ 51, Firefox ≥ 46 and Safari ≥ 15 ([README](https://github.com/google/neuroglancer)).
- **Relevance:** all three are *viewers*. None of them analyses. Viv is the reusable piece if
  NoR Finder ever needs GPU multichannel compositing beyond a canvas.

### Commercial: Imaris, arivis, Huygens

- **Imaris** `.ims` "is based on the standard HDF5… developed by The National Center for
  Supercomputing Applications". The older "Imaris Classic" and "Imaris3" formats are not HDF5
  ([Imaris file format](https://imaris.oxinst.com/support/imaris-file-format)).
- **arivis Cloud** is "formerly APEER… a cloud-based, AI-driven platform designed specifically
  for microscopy image analysis" ([ZEISS knowledge base](https://knowledge.zeiss.com/rms/en/arivis-cloud/getting-started/what-is-arivis-cloud)).
- **Huygens** reads ICS/ICS2, HDF5 and OME-TIFF natively. Vendor formats need its Full File
  Reader option, and it markets itself as a file converter ([SVI file formats](https://svi.nl/FileFormats)).
  The page fetched in this session did not mention SlideBook.

---

## 3. Precedents for analysis in the browser with Pyodide / WebAssembly

| Precedent | What it shows | Source |
|---|---|---|
| **ImJoy `web-python` plugins** | ImJoy "uses pyodide to run python plugins… with scientific libraries (including numpy, scipy, scik…" in the browser, an early bioimage use of Pyodide | [ImJoy development docs](https://github.com/imjoy-team/ImJoy/blob/master/docs/development.md) |
| **ImageJ.JS** | A whole desktop analysis app in WebAssembly (via CheerpJ, not Pyodide) | [README](https://github.com/imjoy-team/imagej.js) |
| **ITK-Wasm** | ITK compiled to WebAssembly "to enable high-performance spatial analysis in a web browser, Node.js, Python". Apache-2.0 | [README](https://github.com/InsightSoftwareConsortium/itk-wasm) |
| **OpenCV in Pyodide** | `opencv-python` 4.11.0.86 ships in the Pyodide 314 distribution | [pyodide-lock.json](https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide-lock.json) |
| **NoR Finder itself** | Pyodide `v314.0.7` from jsDelivr in a Web Worker, with a pinned `tifffile==2026.3.3` wheel vendored | `web/worker.js`, `studies/nor/study.json` in this repo |

## 4. What the Pyodide 314.0.7 distribution actually contains

Read directly from the [lock file](https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide-lock.json)
the repo pins. It covers Python 3.14.2 on `wasm32` / `emscripten_5_0_3`, with 357 packages.

| Package | In Pyodide 314? | Version | Wheel size (measured download) |
|---|---|---|---|
| numpy | yes | 2.4.6 | 2.96 MB |
| scipy | yes | 1.18.0 | 14.0 MB |
| scikit-image | yes | 0.26.0 | 9.52 MB |
| opencv-python (`cv2`) | yes | 4.11.0.86 | 10.7 MB |
| scikit-learn | yes | 1.8.0 | — |
| pillow, imageio, pywavelets, networkx, shapely, pandas, matplotlib, xarray, lxml, statsmodels | yes | — | — |
| zarr / numcodecs | yes | 3.2.1 / 0.15.1 | — |
| **tifffile** | **no** (the repo vendors a pure-Python wheel) | — | 0.24 MB |
| **imagecodecs** | **no**, but PyPI publishes `cp312-abi3-pyemscripten_2026_0_wasm32` wheels ([PyPI files](https://pypi.org/project/imagecodecs/2026.10.10/#files)) | 2026.10.10 | 4.07 MB |
| SimpleITK, itk, dask, torch, tensorflow, cellpose, stardist, napari, bioio, ome-zarr | no | — | — |

The decision-relevant consequence is in [tiff-format](../tiff-format/README.md) §7: without
`imagecodecs`, tifffile in Pyodide **cannot read LZW-compressed TIFFs**. This was measured in
this session.

---

## Sources

- [LICENSE](https://github.com/imagej/ImageJ/blob/master/LICENSE.txt)
- [LICENSE](https://github.com/fiji/fiji/blob/main/LICENSE.txt)
- [Fiji page](https://imagej.net/software/fiji/)
- [README](https://github.com/imjoy-team/imagej.js)
- [LICENSE](https://github.com/napari/napari/blob/main/LICENSE)
- [LICENSE](https://github.com/qupath/qupath/blob/main/LICENSE)
- [LICENSE](https://github.com/CellProfiler/CellProfiler/blob/main/LICENSE)
- [README](https://github.com/CellProfiler/CellProfiler)
- [LICENSE](https://github.com/Icy-imaging/Icy-Kernel/blob/master/LICENSE)
- [site](https://icy.bioimageanalysis.org/)
- [LICENSE](https://github.com/ome/openmicroscopy/blob/develop/LICENSE.txt)
- [OMERO page](https://www.openmicroscopy.org/omero/)
- [plugin/LICENSE](https://github.com/ome/omero-iviewer/blob/master/plugin/LICENSE)
- [README](https://github.com/ome/omero-iviewer)
- [LICENSE](https://github.com/ome/bioformats/blob/develop/LICENSE.txt)
- [LICENSE](https://github.com/hms-dbmi/viv/blob/main/LICENSE)
- [LICENSE](https://github.com/hms-dbmi/vizarr/blob/main/LICENSE)
- [LICENSE](https://github.com/google/neuroglancer/blob/master/LICENSE)
- [README](https://github.com/google/neuroglancer)
- [ZEISS KB](https://knowledge.zeiss.com/rms/en/arivis-cloud/getting-started/what-is-arivis-cloud)
- [SVI](https://svi.nl/FileFormats)
- [ImageJ.java](https://github.com/imagej/ImageJ/blob/master/ij/ImageJ.java)
- [README](https://github.com/napari/napari)
- [PyPI](https://pypi.org/project/napari/)
- [builtins.yaml](https://github.com/napari/napari/blob/main/src/napari_builtins/builtins.yaml)
- [README](https://github.com/qupath/qupath)
- [exporting annotations](https://qupath.readthedocs.io/en/stable/docs/advanced/exporting_annotations.html)
- [openmicroscopy.org/bio-formats](https://www.openmicroscopy.org/bio-formats/)
- [supported formats](https://bio-formats.readthedocs.io/en/stable/supported-formats.html)
- [README](https://github.com/hms-dbmi/viv)
- [Manz et al., Nature Methods 2022](https://www.nature.com/articles/s41592-022-01482-7)
- [README](https://github.com/hms-dbmi/vizarr)
- [Imaris file format](https://imaris.oxinst.com/support/imaris-file-format)
- [ImJoy development docs](https://github.com/imjoy-team/ImJoy/blob/master/docs/development.md)
- [README](https://github.com/InsightSoftwareConsortium/itk-wasm)
- [pyodide-lock.json](https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide-lock.json)
- [PyPI files](https://pypi.org/project/imagecodecs/2026.10.10/#files)

## Growth log

- **2026-10-30** — page created. Tool survey, licences read from LICENSE files, Pyodide 314 package
  table measured from the lock file.

## Open questions

- Is Viv worth adopting for multichannel display, or is a canvas enough for single 1200 × 1200 planes?
- Would the owner's lab export OME-TIFF from SlideBook directly, so channel names travel with the file?

## Gaps / not verified

- **ImageJ.JS licence** was not read. The fetched README states none, and the repository's
  `LICENSE` was not fetched.
- **omero-web licence** was not found: no `LICENSE`/`LICENSE.txt` exists at the `master` root.
  The OMERO server (GPL-2.0) and OMERO.iviewer (AGPL-3.0) licences were read.
- **CellProfiler and Icy file-format support** was not checked against their docs. Both are
  commonly said to use Bio-Formats; that is unverified here.
- **Icy's overall licence:** only the `Icy-Kernel` repository's licence file (LGPL-3.0) was read.
  The project website may state a different licence for the application.
- **Imaris, arivis and Huygens:** only the vendor pages cited were read. Pricing, platforms and
  scripting models were not researched. The arivis Pro product page returned 403 and is not cited.
- **Pyodide precedents in microscopy** beyond ImJoy were searched for and none were found. A
  published "Pyodide microscopy analysis" app may exist and was not surfaced.
- **ImJoy's current state:** the docs read reference the old `iodide-project/pyodide` URL. That
  suggests they are old, and whether `web-python` plugins still work today was not checked.
- Wheel sizes are compressed downloads. Their in-memory footprint after unpacking was not
  measured.
