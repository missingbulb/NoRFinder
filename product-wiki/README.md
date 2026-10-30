# Product wiki

Research for the page and its studies: an in-browser, no-upload page that turns
fluorescence-microscopy images into checked numbers and collects researchers' ground truth, with
NoR Finder as its first study. The research covers technology only, not biology.

The wikis are researched and refined by agents, cited but unreviewed, so nothing outside
`product-wiki/` may depend on them. What a human has reviewed and distilled from them into product
requirements lives in [`product-requirements/`](product-requirements/README.md), the one part of
this folder the rest of the repo may reference.

| Wiki | What it tracks |
|---|---|
| [microscopy-tools](microscopy-tools/README.md) | The tools researchers use to view and analyse microscopy images, and what each means for a browser-only tool |
| [ground-truth-and-algorithm-tools](ground-truth-and-algorithm-tools/README.md) | Ground-truth annotation tools and their export formats; libraries for building and scoring image algorithms, and which run in Pyodide |
| [tiff-format](tiff-format/README.md) | TIFF and its microscopy dialects (ImageJ, OME-TIFF), OME-Zarr, vendor formats, readers in Python and JavaScript, and their pitfalls |
