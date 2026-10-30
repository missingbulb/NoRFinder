# Ground-truth annotation tools and algorithm-building libraries

This page covers technology only. Part (a) is about how researchers make ground truth for
microscopy images, and the file formats that ground truth arrives in. Part (b) is about the
libraries used to build and score image-processing algorithms, and which of them run inside
Pyodide, where NoR Finder runs. The repo's prior-art review
(`studies/nor/docs/literature/prior-art-detection.md`) covers *published node detectors* and is
not repeated here.

Researched 2026-10-30. "In Pyodide" means present in the
[Pyodide 314.0.7 lock file](https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide-lock.json),
the version the repo pins.

## Key insights

- The counting tools biologists already use (Fiji multi-point, Cell Counter) give point lists, a better fit for nodes than masks.
- ilastik's method (pixel features plus a random forest) can be rebuilt in the browser from scikit-image and scikit-learn, both in Pyodide.
- Cellpose and StarDist cannot run in Pyodide. Cellpose-SAM's weights alone are about 1.23 GB.
- Point-detection scoring is a one-to-one assignment within a distance cutoff. Spotiflow's default of 3 px should be set in µm for our data.
- "GeoJSON" from image annotation tools is not standard GeoJSON, because the standard fixes coordinates to Earth longitude and latitude.


## (a) Annotation and ground-truth creation

### Tools

| Tool | Annotation types | Export | Licence | Notes for us |
|---|---|---|---|---|
| **Fiji multi-point tool** | Points | ROI, or measurements table | (ImageJ, public domain) | Shift-click adds points to one selection, alt-click deletes one, and the count shows in the status bar ([ImageJ user guide §19](https://imagej.net/ij/docs/guide/146-19.html)). This is the lowest-friction counting tool a biologist already has. |
| **Fiji Cell Counter** plugin | Typed point markers (several counter types) | "Save Markers: Exports the marker data to an XML file" ([Cell Counter](https://imagej.net/plugins/cell-counter)) | — | Counts per slice and totals go to the Results table. Known bug: loading more than 8 counter types from XML. |
| **Fiji line selection and plot profile** | Line, intensity profile | Profile values | — | The length-measurement method the project brief quotes (see the brief §4.3). The tool docs were not re-read for this page. |
| **Labkit** (Fiji plugin) | Brush labels, plus pixel classification | Label image TIFF ("Labeling > Save Labeling… TIF Image") | BSD-2-style ([LICENSE](https://github.com/juglab/labkit-ui/blob/master/LICENSE.txt)) | "An advanced Fiji plugin for image segmentation" ([README](https://github.com/juglab/labkit-ui); paper [Arzt et al. 2022](https://www.frontiersin.org/article/10.3389/fcomp.2022.777728)). StarDist recommends it for instance labels: one label per object, "allow overlapping labels" disabled ([StarDist README](https://github.com/stardist/stardist)). |
| **napari** Labels / Points / Shapes layers | Painted labels, points, polygons, lines | Labels → `.tif/.npz/…`; points and shapes → `.csv` ([builtins.yaml](https://github.com/napari/napari/blob/main/src/napari_builtins/builtins.yaml)) | BSD-3-Clause | Desktop Qt. Points CSV is a simple exchange format for counts. |
| **QuPath** annotations | Polygons, points, lines, ellipses, plus interactive classification | GeoJSON (`exportObjectsToGeoJson`), ROI zip via ImageJ RoiManager, binary or labeled images ([exporting annotations](https://qupath.readthedocs.io/en/stable/docs/advanced/exporting_annotations.html)) | GPL-3.0 | "Using GeoJSON does impose some limitations; notably, ellipses become polygons." |
| **ilastik** | Brush scribbles per class | Probability maps and segmentations (export formats not verified) | GPL-2.0-or-later ([LICENSE](https://github.com/ilastik/ilastik/blob/main/LICENSE)) | The Pixel Classification workflow trains "a Random Forest classifier… from user annotations interactively" on "generic pixel features, such as smoothed pixel intensity, edge filters and texture descriptors" ([docs](https://www.ilastik.org/documentation/pixelclassification/pixelclassification)). |
| **Cellpose GUI** (human-in-the-loop) | Masks drawn and corrected over model output | `_seg.npy`, plus ROIs through `roifile` | BSD-3-Clause ([LICENSE](https://github.com/MouseLand/cellpose/blob/main/LICENSE)) | "Cellpose 2.0 allows human-in-the-loop training of models" ([README](https://github.com/MouseLand/cellpose); [paper](https://www.nature.com/articles/s41592-022-01663-4)). The workflow is: annotate, retrain, correct, repeat. |
| **CVAT Community** | Boxes, polygons, masks, keypoints, tags; SAM interactor | "20+ supported formats: CVAT (XML), COCO (JSON), YOLO…, Pascal VOC…" ([README](https://github.com/cvat-ai/cvat)) | MIT | Self-hosted web app (Docker). Built for general computer vision; not microscopy-aware. |
| **Label Studio** | Images, text, audio, video, time series | "Various model formats" | Apache-2.0 ([LICENSE](https://github.com/HumanSignal/label-studio/blob/develop/LICENSE)) | Self-hosted with Docker ([README](https://github.com/HumanSignal/label-studio)). Same caveat as CVAT. |
| **arivis Cloud** (formerly APEER) | Partial annotation for training cloud models | — | Proprietary | Renamed from APEER, not discontinued ([ZEISS KB](https://knowledge.zeiss.com/rms/en/arivis-cloud/getting-started/what-is-arivis-cloud)). |

**What fits a two-channel *point* problem.** A node of Ranvier is an object with a position and
a length, not a large blob. The tools whose natural output is a *point list* or a *line* are the
right fit: the multi-point tool, Cell Counter, napari Points, and QuPath points or lines. The
brush tools (Labkit, ilastik, the Cellpose GUI) produce masks. These are only needed if a
segmenter is trained.

### Export formats

| Format | What it is | Readable in Pyodide? | Pitfall |
|---|---|---|---|
| **ImageJ ROI / ROI zip** | `.roi` binary, and a `.zip` of them (RoiManager) | Yes. `roifile` is pure Python, BSD-3, needs only numpy ([PyPI](https://pypi.org/project/roifile/)) | "An undocumented and ImageJ application specific format" ([roifile README](https://github.com/cgohlke/roifile)). The same bytes can be embedded in a TIFF's IJMetadata `roi `/`over` entries (see [tiff-format](../tiff-format/README.md) §2). |
| **GeoJSON** | JSON FeatureCollection of geometries | Yes (`json`, `shapely` 2.1.2 is in Pyodide) | [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946) fixes the coordinate reference system to WGS 84 longitude and latitude. Image annotation tools reuse the geometry model in pixel space, so a "GeoJSON" annotation is not strictly conformant, and its origin and axis convention must be read from the producing tool. |
| **Label mask TIFF** | Integer image; 0 = background, *k* = object *k* | Yes (tifffile) | Must be instance-labelled (unique ids), not just binary, for object-level matching. |
| **Points CSV** (napari) | One row per point | Yes | Axis order (napari uses array order, so row before column) must be checked against the CSV header. |
| **Cell Counter XML** | Typed markers | Yes (`xml` / `lxml`) | Schema not documented on the plugin page. |
| **COCO JSON** | `annotation{id, image_id, category_id, segmentation: RLE or [polygon], area, bbox: [x,y,width,height], iscrowd}`. Polygons for single objects (`iscrowd=0`), RLE for crowds, bbox origin top-left and 0-indexed ([COCO format](https://cocodataset.org/dataset/format-data.htm)) | Yes | Designed for 8-bit photographs; it carries no physical pixel size. |

---

## (b) Libraries for building and scoring algorithms

| Library | What for | In Pyodide 314? | Licence | Notes |
|---|---|---|---|---|
| **scikit-image** | Filters, thresholds, morphology, labelling, regionprops, blob detection, registration | **Yes**, 0.26.0, 9.5 MB wheel | BSD-3 ([LICENSE](https://github.com/scikit-image/scikit-image/blob/main/LICENSE.txt)) | The Pyodide wheel includes `skimage.future.TrainableSegmenter`, `fit_segmenter` and `predict_segmenter`, and `skimage/feature/_basic_features.py` (inspected in the wheel) |
| **scipy.ndimage** / `scipy.optimize` | N-D filters, label, distance transforms; `linear_sum_assignment` for one-to-one matching | **Yes**, 1.18.0, 14.0 MB | BSD-3 | — |
| **OpenCV** (`cv2`) | Fast 2D filters, contours, Hough transforms | **Yes**, 4.11.0.86, 10.7 MB | Apache-2.0 ([LICENSE](https://github.com/opencv/opencv/blob/4.x/LICENSE)) | Duplicates much of skimage at a 10 MB download cost |
| **scikit-learn** | Random forests and other classical machine learning | **Yes**, 1.8.0 | BSD-3 | With skimage's multiscale features this reproduces ilastik-style pixel classification in the browser (see below) |
| **ITK / SimpleITK** | Registration, segmentation, filters | **No** | Apache-2.0 ([SimpleITK LICENSE](https://github.com/SimpleITK/SimpleITK/blob/master/LICENSE)) | The browser route is the separate **ITK-Wasm** project ([README](https://github.com/InsightSoftwareConsortium/itk-wasm)), not a Pyodide package |
| **ilastik** | Interactive pixel and object classification | No (desktop app) | GPL-2.0+ | Its algorithm (feature stack plus random forest) is reproducible with skimage and sklearn |
| **Cellpose / Cellpose-SAM** | Learned cell and nucleus instance segmentation | **No**: requires `torch>=1.6` ([PyPI](https://pypi.org/project/cellpose/)), and torch is not in Pyodide | BSD-3 code; "All Cellpose models are trained on data that is licensed under **CC-BY-NC**" ([README](https://github.com/MouseLand/cellpose)) | Weights: `cpsam` is **1,233,587,898 bytes (≈1.23 GB)**, as is `cpsam_v2` ([HF tree API](https://huggingface.co/api/models/mouseland/cellpose-sam/tree/main)). Impractical to download in a browser. |
| **StarDist** | Star-convex instance segmentation for nuclei | **No**: TensorFlow plus `csbdeep`, and `numba` on most platforms ([PyPI](https://pypi.org/project/stardist/)) | BSD-3 | Pretrained `2D_versatile_fluo` targets "Fluorescence (nuclear marker)… 2D single channel". Its `stardist.matching` module is useful on its own (below). |
| **Spotiflow** | Learned sub-pixel spot detection | No (PyTorch, per its [README](https://github.com/weigertlab/spotiflow)) | — | Its point-matching code is a good reference for scoring (below) |
| **CellProfiler** | Module pipelines | No (desktop) | BSD-3 | Reference model only |

### ilastik-style pixel classification in the browser

Every part is present in Pyodide 314:
`skimage.feature.multiscale_basic_features` (intensity, edge and texture features at several σ),
then `skimage.future.fit_segmenter(labels, features, clf)` with a
`sklearn.ensemble.RandomForestClassifier`, then `predict_segmenter`. This is the same recipe as
the ilastik workflow quoted above. It is the lightweight, in-browser alternative to a learned
segmenter. Its runtime in WebAssembly on a 1200 × 1200 × 2-channel image was **not measured**.

### Benchmarking and metrics practice

- **Object-level matching, not count ratios.** The repo's prior-art review already calls for
  precision and recall rather than an automated/manual ratio. The tools below are the standard
  ways to compute them.
- **Mask matching by IoU.** `stardist.matching.matching(y_true, y_pred)` returns
  `tp, fp, fn, precision, recall, accuracy, f1` (plus `panoptic_quality`, `mean_matched_score`).
  Objects are matched "if their IoU exceeds a threshold (by default 50%)"
  ([StarDist README](https://github.com/stardist/stardist)). It accepts any label masks, not
  only StarDist output.
- **Point matching by distance.** Spotiflow's `points_matching(…, cutoff_distance=3)` builds a
  squared-distance matrix, solves a one-to-one assignment with
  `scipy.optimize.linear_sum_assignment`, rejects pairs beyond the cutoff, and reports
  `f1 = 2·tp / (2·tp + fp + fn)`
  ([matching.py](https://github.com/weigertlab/spotiflow/blob/main/spotiflow/utils/matching.py)).
  The default of **3 px is a pixel constant**. For our data it should be set in µm from each
  file's own pixel size, and stated beside every F1. All of this uses scipy only, so it runs in
  Pyodide unchanged.
- **Choosing metrics.** *Metrics Reloaded* (Maier-Hein et al., Nature Methods 2024,
  [doi:10.1038/s41592-023-02151-z](https://doi.org/10.1038/s41592-023-02151-z)) is the
  consortium guideline for picking metrics by problem type (image classification, object
  detection, semantic and instance segmentation). Only its bibliographic record and abstract
  were read for this page.

---

## Sources

- [Pyodide 314.0.7 lock file](https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide-lock.json)
- [ImageJ user guide §19](https://imagej.net/ij/docs/guide/146-19.html)
- [Cell Counter](https://imagej.net/plugins/cell-counter)
- [LICENSE](https://github.com/juglab/labkit-ui/blob/master/LICENSE.txt)
- [README](https://github.com/juglab/labkit-ui)
- [Arzt et al. 2022](https://www.frontiersin.org/article/10.3389/fcomp.2022.777728)
- [StarDist README](https://github.com/stardist/stardist)
- [builtins.yaml](https://github.com/napari/napari/blob/main/src/napari_builtins/builtins.yaml)
- [exporting annotations](https://qupath.readthedocs.io/en/stable/docs/advanced/exporting_annotations.html)
- [LICENSE](https://github.com/ilastik/ilastik/blob/main/LICENSE)
- [docs](https://www.ilastik.org/documentation/pixelclassification/pixelclassification)
- [LICENSE](https://github.com/MouseLand/cellpose/blob/main/LICENSE)
- [README](https://github.com/MouseLand/cellpose)
- [paper](https://www.nature.com/articles/s41592-022-01663-4)
- [README](https://github.com/cvat-ai/cvat)
- [LICENSE](https://github.com/HumanSignal/label-studio/blob/develop/LICENSE)
- [README](https://github.com/HumanSignal/label-studio)
- [ZEISS KB](https://knowledge.zeiss.com/rms/en/arivis-cloud/getting-started/what-is-arivis-cloud)
- [PyPI](https://pypi.org/project/roifile/)
- [roifile README](https://github.com/cgohlke/roifile)
- [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946)
- [COCO format](https://cocodataset.org/dataset/format-data.htm)
- [LICENSE](https://github.com/scikit-image/scikit-image/blob/main/LICENSE.txt)
- [LICENSE](https://github.com/opencv/opencv/blob/4.x/LICENSE)
- [SimpleITK LICENSE](https://github.com/SimpleITK/SimpleITK/blob/master/LICENSE)
- [README](https://github.com/InsightSoftwareConsortium/itk-wasm)
- [PyPI](https://pypi.org/project/cellpose/)
- [HF tree API](https://huggingface.co/api/models/mouseland/cellpose-sam/tree/main)
- [PyPI](https://pypi.org/project/stardist/)
- [README](https://github.com/weigertlab/spotiflow)
- [matching.py](https://github.com/weigertlab/spotiflow/blob/main/spotiflow/utils/matching.py)
- [doi:10.1038/s41592-023-02151-z](https://doi.org/10.1038/s41592-023-02151-z)

## Growth log

- **2026-10-30** — page created. Annotation tools and export formats, algorithm libraries checked
  against the Pyodide 314 lock, and scoring practice.

## Open questions

- Which annotation tool will the owner's lab actually use to mark nodes: points, lines or masks?
- What matching tolerance in µm makes a detected node "the same" as an annotated one?

## Gaps / not verified

- **16-bit support in CVAT and Label Studio** was not checked. Both are built for general
  computer vision. Whether they display and keep 16-bit multichannel TIFFs, or convert them to
  8-bit, is unknown. Check before suggesting either to a lab.
- **ilastik export formats and platforms**, and **Cellpose GUI export formats** beyond
  `_seg.npy` and roifile, were not read from their docs.
- **Fiji line-profile tool docs** were not re-read. The brief's description is relied on.
- **Cell Counter XML schema** is undocumented on its page and was not inspected.
- **QuPath's GeoJSON coordinate convention** (pixel units, origin, whether it stores image
  metadata) was not confirmed in its docs. The page only says to compare QuPath's output with
  the GeoJSON spec.
- **StarDist pretrained-model size** was not measured, because its GitHub release asset was not
  fetched.
- **Spotiflow's licence** was not read.
- **Metrics Reloaded:** its specific recommendation for point detection with a distance
  tolerance was not read, only the abstract-level description.
- **Runtime in Pyodide** of skimage, sklearn or OpenCV on our image size was not measured.
- Whether **ITK-Wasm** can be called from inside Pyodide (it ships a Python `itkwasm` package
  per its badges) was not tested.
