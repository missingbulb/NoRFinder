#!/usr/bin/env python3
"""Turn one raw confocal z-stack into the files the 3D stack viewer reads.

The viewer (analysis/stack_view/index.html) is how the owner judges a stack in 3D before any
measurement exists: rotate it, clip it in depth, compare it against the flat projection.

    python3 analysis/export_stack_view.py --inspect STACK.tif      # header only, no pixels read
    python3 analysis/export_stack_view.py STACK.tif OUT_DIR [--bin 2] [--z-step UM]

OUT_DIR receives index.html, meta.json and one 8-bit volume per channel, stored losslessly as a
grayscale PNG of the slices stacked top to bottom (Z*Y rows, X columns), a type any static host serves.
Both channels are scaled by one percentile window over the whole stack, never per slice, so
signal that fades with depth still looks faded: that fade is something the owner should see.
"""
import argparse, json, os, shutil
import numpy as np
import tifffile
from PIL import Image

import stack_sources

HERE = os.path.dirname(os.path.abspath(__file__))
VIEWER = os.path.join(HERE, 'stack_view', 'index.html')

# Channel identity was established by content (data/README.md); the stored colours are not it.
CHANNELS = {0: 'dapi', 1: 'cd31'}
WINDOW_PCT = (0.5, 99.9)


def header(path):
    """Everything the file says about itself, without decoding a pixel."""
    with tifffile.TiffFile(path) as tf:
        s = tf.series[0]
        p = tf.pages[0]
        ij = tf.imagej_metadata or {}
        xres = p.tags.get('XResolution')
        unit = ij.get('unit')
        px_per_unit = xres.value[0] / xres.value[1] if xres else None
        return {
            'shape': list(s.shape), 'axes': s.axes, 'dtype': str(s.dtype),
            'pages': len(tf.pages), 'file_bytes': os.path.getsize(path),
            'um_per_px': (1 / px_per_unit) if px_per_unit and unit in ('micron', 'um', 'µm') else None,
            'unit': unit,
            'z_step_um': ij.get('spacing') or stack_sources.z_step_um(path),
            'z_step_source': 'file' if ij.get('spacing') else ('the owner (data/sources.json)' if stack_sources.z_step_um(path) else None),
            'imagej': {k: v for k, v in ij.items() if not isinstance(v, (bytes, np.ndarray)) and k not in ('Ranges', 'LUTs')},
        }


def read_channel(path, c, n_ch, region=None):
    """One channel as (Z, Y, X); `region` = (y0, x0, size) in full-resolution px cuts a square."""
    with tifffile.TiffFile(path) as tf:
        n_z = len(tf.pages) // n_ch
        vol = np.stack([tf.pages[z * n_ch + c].asarray() for z in range(n_z)])
    if region:
        y0, x0, n = region
        vol = vol[:, y0:y0 + n, x0:x0 + n]
    return vol


def bin_xy(vol, b):
    if b == 1:
        return vol.astype(np.float32)
    z, y, x = vol.shape
    y, x = y - y % b, x - x % b
    return vol[:, :y, :x].reshape(z, y // b, b, x // b, b).mean(axis=(2, 4), dtype=np.float32)


def to_u8(vol):
    lo, hi = np.percentile(vol, WINDOW_PCT)
    return np.clip((vol - lo) / max(hi - lo, 1e-9) * 255, 0, 255).astype(np.uint8), float(lo), float(hi)


def slice_drift(vol):
    """Shift of each slice against the one above, in binned px: a check that the stack is aligned."""
    from skimage.registration import phase_cross_correlation
    out = [[0.0, 0.0]]
    for a, b in zip(vol[:-1], vol[1:]):
        shift, _, _ = phase_cross_correlation(a, b, upsample_factor=4)
        out.append([round(float(shift[0]), 2), round(float(shift[1]), 2)])
    return out


def export(path, out, b, z_step, region=None):
    h = header(path)
    assert h['axes'] == 'ZCYX' and h['shape'][1] == len(CHANNELS), f"unexpected layout {h['axes']} {h['shape']}"
    os.makedirs(out, exist_ok=True)
    meta = {'source': os.path.basename(path), 'bin': b,
            'um_per_px': h['um_per_px'] * b if h['um_per_px'] else None,
            'z_step_um': z_step if z_step is not None else h['z_step_um'],
            'z_step_source': 'command line' if z_step is not None else h['z_step_source'],
            'region_yx_px': list(region[:2]) if region else None,
            'channels': {}}
    for c, name in CHANNELS.items():
        raw = bin_xy(read_channel(path, c, len(CHANNELS), region), b)
        u8, lo, hi = to_u8(raw)
        z, y, x = u8.shape
        Image.fromarray(u8.reshape(z * y, x), mode='L').save(os.path.join(out, f'{name}.png'), optimize=True)
        meta['shape'] = list(u8.shape)
        meta['channels'][name] = {
            'file': f'{name}.png', 'window_raw': [lo, hi],
            'slice_p50': [round(float(np.percentile(s, 50)), 1) for s in u8],
            'slice_p99': [round(float(np.percentile(s, 99)), 1) for s in u8],
        }
        if name == 'cd31':
            meta['drift_px'] = slice_drift(raw)
    with open(os.path.join(out, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    shutil.copy(VIEWER, os.path.join(out, 'index.html'))
    return meta


def parse_region(text):
    return tuple(int(v) for v in text.split(',')) if text else None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('stack')
    ap.add_argument('out', nargs='?')
    ap.add_argument('--inspect', action='store_true', help='print the header and stop')
    ap.add_argument('--bin', type=int, default=2, help='xy binning factor (default 2)')
    ap.add_argument('--z-step', type=float, help='µm between slices, when the file does not say')
    ap.add_argument('--region', help='Y0,X0,SIZE: a square cut from the full-resolution frame, in px')
    a = ap.parse_args()
    if a.inspect or not a.out:
        print(json.dumps(header(a.stack), indent=1, default=str))
        return
    m = export(a.stack, a.out, a.bin, a.z_step, parse_region(a.region))
    print(f"{m['source']}: {m['shape']} (z,y,x) at {m['um_per_px']} µm/px, z-step {m['z_step_um']} µm "
          f"-> {a.out}")


if __name__ == '__main__':
    main()
