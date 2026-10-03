# numpy-image-processing pack

Fingerprinted by `numpy` and `scipy` named together in a near-root Python dependency manifest
(`requirements*.txt` or `pyproject.toml`). The marker only suspects the pack; declaring it is the
project's call.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| A global statistic over a padded array | high | correctness | prose: <200 words |
| Thresholding with a strict `>` at saturation | high | correctness | prose: <100 words |
| A symmetric window around a float center | high | correctness | prose: <100 words |
| `scipy.ndimage.affine_transform` pulls | high | correctness | prose: <100 words |
| Classifying skeleton pixels by neighbor count | medium | complexity | prose: <100 words |
| Filtering connected components by size | medium | performance | prose: <50 words |
| Loading a font with `PIL.ImageFont.truetype` | medium | correctness | prose: <50 words |
| Upscaling a labeled image for display | medium | correctness | prose: <100 words |
| Choosing an annotation color | medium | correctness | prose: <100 words |
