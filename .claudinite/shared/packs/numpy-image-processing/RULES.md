# numpy-image-processing

A technology pack for numeric image analysis in Python: reading an image into a NumPy array,
deriving a mask, skeleton or threshold from it with SciPy's `ndimage` and scikit-image, and
rendering the result with Pillow. A default to adapt, not a contract.

- **Computing a threshold, quantile, or other global statistic over an array that can carry
  padding** (an affine-transformed, rotated or cropped image) — restrict it to the imaged region,
  never the whole array. `scipy.ndimage.affine_transform` fills the corners a rotation or scale
  introduces with a constant, usually `0`, and that padding is valid float data — not `NaN` — so
  a plain `np.quantile`/`np.percentile` over the full array folds it into the statistic with no
  error. Build a validity mask by running the same transform over an all-ones array
  (`ndi.affine_transform(np.ones_like(a), ..., order=0) > 0.5`) and index by it before taking the
  statistic. (statistics-exclude-padding)

- **Thresholding a normalized or clipped channel with a strict `>`** — check first whether the
  value can sit exactly at the array's own maximum. A saturated or clipped image ties many pixels
  at the top of its range, and an Otsu or quantile threshold can land *at* that maximum:
  `chan > thr` then selects nothing. Fall back to `>=` in that case
  (`chan >= thr if thr >= chan.max() else chan > thr`). (strict-threshold-at-max)

- **Building a symmetric window or crop around a floating-point center** (`cy - r` .. `cy + r`) —
  bound it with `np.floor`/`np.ceil`, never `int()`. Truncation is toward zero, so a window built
  with `int()` is not the mirror of itself under a flip transform, and code meant to be invariant
  under rotation or reflection breaks by exactly one pixel of asymmetry.
  (floor-ceil-window-bounds)

- **Calling `scipy.ndimage.affine_transform`** — it *pulls*: for each destination pixel it samples
  `Minv @ (dst - offset)` in the source, so building it from a *forward* transform matrix `M`
  means inverting `M` and deriving `offset` from where `M` sends the source's corners — never
  passing `M` itself. Getting this backward raises nothing; it silently renders an empty,
  wrongly-scaled, or mirrored image. (affine-transform-pulls)

- **Classifying pixels on a binary skeleton or mask by neighbor count** (an endpoint vs. a
  junction) — convolve with a 3×3 ones kernel and subtract the pixel's own value:
  `ndi.convolve(skel.astype(np.uint8), np.ones((3, 3), int), mode='constant') - skel`. It turns a
  skeletonized mask into a graph without walking pixels by hand. (neighbor-count-convolution)

- **Filtering connected components by size** — label with `ndi.label`, get each label's pixel
  count with `ndi.sum(np.ones_like(lab), lab, range(1, n + 1))`, then rebuild the keep-mask by
  fancy-indexing that boolean-per-label array with the label map itself
  (`np.concatenate([[False], sizes >= minsz])[lab]`) — cheaper than looping and reassigning blob
  by blob. (component-size-filter)

- **Loading a font with `PIL.ImageFont.truetype`** — wrap it in `try`/`except OSError` and fall
  back to `ImageFont.load_default()`. A fresh container ships no system font files at all, and a
  fixed path a workstation happens to have is not guaranteed anywhere the analysis actually runs
  unattended. (truetype-font-fallback)

- **Upscaling a labeled or annotated image for display** — resample with `Image.NEAREST`, never
  the default. Any smoothing resampler blurs a mask or overlay's hard edges and shifts them off
  the pixels they mark, which only shows up once someone compares the annotation to the original
  at the display's zoom level. (nearest-for-annotations)

- **Choosing a color to draw an annotation over an image** — don't hardcode one; measure how close
  the image's own bright pixels already sit to each candidate color (cosine similarity in RGB is
  enough) and require a real margin before accepting it. A fixed "safe" color like red or cyan
  disappears exactly on the class of image whose dominant channel happens to be that color.
  (annotation-color-margin)
