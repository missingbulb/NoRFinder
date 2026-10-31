"""The vascular study's Python entry (py/vascular.py) returns a z-stack for the shell's 3D viewer: each channel
flattened (the brightest value over every slice), then every slice, CD31 first, each channel scaled by one window
over the whole stack (requirements 4.1, 1.48)."""
import json
import os
import sys

import numpy as np
import tifffile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'py'))
import vascular


def stack_file(path, a, axes, **extra):
    tifffile.imwrite(path, a, imagej=True, metadata={'axes': axes, 'unit': 'um', **extra}, resolution=(1 / 0.55, 1 / 0.55))
    return str(path)


def opened(path):
    meta, data = vascular.Session(path).opened()
    meta = json.loads(meta)
    C, Z, H, W = len(meta['channels']), meta['Z'], meta['H'], meta['W']
    raw = np.frombuffer(data, np.uint8)
    assert raw.size == C * H * W * (1 + Z), 'the flat planes, then every slice of every channel'
    return meta, raw[:C * H * W].reshape(C, H, W), raw[C * H * W:].reshape(C, Z, H, W)


def test_a_two_channel_original_comes_cd31_first_flattened_then_slice_by_slice(tmp_path):
    a = np.zeros((4, 2, 6, 7), np.uint16)
    a[2, 1, 3, 4] = 900   # a CD31 voxel deep in the stack (the originals' second channel)
    a[0, 0, 1, 1] = 500   # a DAPI voxel in the first slice
    meta, flat, vol = opened(stack_file(tmp_path / 's.tif', a, 'ZCYX'))
    assert [c['name'] for c in meta['channels']] == ['CD31', 'DAPI']
    assert flat[0, 3, 4] == 255 and flat[0].sum() == 255, 'the deep CD31 voxel reaches the flat picture, alone'
    assert vol[0, 2, 3, 4] == 255 and vol[0].sum() == 255, 'and sits in its own slice of the volume'
    assert flat[1, 1, 1] == 255 and vol[1, 0, 1, 1] == 255
    assert abs(meta['um'] - 0.55) < 1e-6 and meta['Z'] == 4 and meta['spacing'] is None


def test_one_window_over_the_whole_stack_keeps_a_fade_with_depth(tmp_path):
    a = np.zeros((2, 40, 40), np.uint16)
    a[0, :, :20] = 1000; a[1, :, :20] = 250   # the same structure, a quarter as bright one slice deeper
    _, _, vol = opened(stack_file(tmp_path / 'f.tif', a, 'ZYX'))
    assert vol[0, 1].max() < vol[0, 0].max() * 0.5, 'a slice is never stretched on its own'


def test_a_single_channel_stack_is_cd31_and_its_recorded_spacing_comes_through(tmp_path):
    a = np.zeros((3, 5, 5), np.uint16); a[1, 2, 2] = 100
    meta, _, _ = opened(stack_file(tmp_path / 'c.tif', a, 'ZYX', spacing=2.5))
    assert [c['name'] for c in meta['channels']] == ['CD31'] and meta['spacing'] == 2.5
