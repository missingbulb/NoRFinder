# Makes rauntruth-previews.tiff for a Drive folder from its TIFF and PNG images (requirement 1.42): run it
# where the folder's images are, then upload the file beside them. Each page is deflate-compressed.
#   python3 dev/tools/previews/make_previews.py IMAGES_DIR [OUT_DIR]   (OUT_DIR defaults to IMAGES_DIR)
# A flat image is one RGB page at most FLAT pixels a side; a stack is a mini-volume of at most
# VOL pixels a side and at most SLICES slices, one 8-bit page per slice and channel (slice-major).
# The first page's description is the index: {version, images: [{name, sha256, page, kind, ...}]}.
import hashlib, json, os, sys
import numpy as np, tifffile
from PIL import Image

FLAT, VOL, SLICES = 96, 48, 16
COLOURS = {1: [(1, 1, 1)], 2: [(0, 1, 0), (1, 0, 1)], 3: [(1, 0, 0), (0, 1, 0), (0, 0, 1)]}


def stretch(a):
    """8-bit, its median black and its 99.8th percentile white, as the page draws stacks."""
    lo, hi = np.percentile(a, [50, 99.8])
    return np.clip((a - lo) / max(hi - lo, 1e-9) * 255, 0, 255).astype(np.uint8)


def shrink(plane, side):
    """A plane at most `side` pixels a side, by area averaging."""
    h, w = plane.shape
    k = side / max(h, w)
    if k >= 1:
        return plane.astype(np.float32)
    im = Image.fromarray(plane.astype(np.float32), mode="F")
    return np.asarray(im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.BOX))


def read(path):
    """(array as Z, C, Y, X, ImageJ metadata or {})."""
    if path.lower().endswith(".png"):
        a = np.asarray(Image.open(path).convert("RGB")).transpose(2, 0, 1)[None]
        return a, {}
    with tifffile.TiffFile(path) as t:
        s, ij = t.series[0], t.imagej_metadata or {}
        a, axes = s.asarray(), s.axes
    for ax in [x for x in axes if x not in "ZCSYX"]:  # the first time point only
        a = np.take(a, 0, axis=axes.index(ax)); axes = axes.replace(ax, "")
    if "S" in axes and "C" not in axes:  # an RGB image's samples are its channels
        axes = axes.replace("S", "C")
    for ax in "ZC":
        if ax not in axes:
            a = a[None]; axes = ax + axes
    return np.transpose(a, [axes.index(x) for x in "ZCYX"]), ij


def colours(ij, C):
    """Each channel's colour as the file displays it: the top of its ImageJ LUT, else the defaults by count."""
    luts = ij.get("LUTs")
    luts = [] if luts is None else [luts] if np.ndim(luts) == 2 else list(luts)
    if len(luts) >= C:
        return [tuple(int(v > 0) for v in np.asarray(l)[:, -1]) for l in luts[:C]]
    cols = COLOURS.get(C, COLOURS[3])
    return [cols[c % len(cols)] for c in range(C)]


def preview(path):
    a, ij = read(path)
    Z, C = a.shape[:2]
    cols = colours(ij, C)
    if Z == 1:
        planes = [stretch(shrink(a[0, c], FLAT)) for c in range(C)]
        rgb = np.zeros(planes[0].shape + (3,), np.float32)
        for c, p in enumerate(planes):
            rgb += p[..., None] * np.array(cols[c % len(cols)], np.float32)
        return {"kind": "flat", "channels": C, "colours": cols}, [np.clip(rgb, 0, 255).astype(np.uint8)]
    # slices grouped evenly into at most SLICES, each group's brightest kept
    groups = np.array_split(np.arange(Z), min(Z, SLICES))
    vol = np.stack([np.stack([shrink(a[g, c].max(axis=0), VOL) for c in range(C)]) for g in groups])
    vol = np.stack([stretch(vol[:, c]) for c in range(C)], axis=1)
    meta = {"kind": "stack", "channels": C, "slices": Z, "colours": cols, "volume": list(vol.shape[:2]) + list(vol.shape[2:])}
    if ij.get("spacing"):
        meta["spacing"] = ij["spacing"]
    return meta, [vol[z, c] for z in range(vol.shape[0]) for c in range(C)]


def write(path, index, pages):
    with tifffile.TiffWriter(path) as w:
        for i, p in enumerate(pages):
            w.write(p, photometric="rgb" if p.ndim == 3 else "minisblack", metadata=None,
                    description=json.dumps(index) if i == 0 else None, compression="zlib", predictor=2)


def main(src, out=None):
    out = out or src
    os.makedirs(out, exist_ok=True)
    index, pages = {"version": 1, "images": []}, []
    for name in sorted(os.listdir(src)):
        if not name.lower().endswith((".tif", ".tiff", ".png")) or name.startswith("rauntruth-previews"):
            continue
        p = os.path.join(src, name)
        with open(p, "rb") as f:
            sha = hashlib.sha256(f.read()).hexdigest()
        meta, ps = preview(p)
        index["images"].append({"name": name, "sha256": sha, "page": len(pages), "pages": len(ps), **meta})
        pages += ps
        print(f"  {name}: {meta['kind']}, {len(ps)} page(s)", flush=True)
    path = os.path.join(out, "rauntruth-previews.tiff")
    write(path, index, pages)
    print(f"{path}: {len(index['images'])} images, {os.path.getsize(path) / 1024:.0f} KB")


if __name__ == "__main__":
    main(*sys.argv[1:3])
