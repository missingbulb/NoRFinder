"""The vascular study's Python entry (py/vascular.py) shows a z-stack flattened: each channel the brightest
value over every slice, under the name its place gives it."""
import json
import os
import sys

import numpy as np
import tifffile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'py'))
import vascular


def stack_file(path, a, axes):
    tifffile.imwrite(path, a, imagej=True, metadata={'axes': axes, 'unit': 'um'}, resolution=(1 / 0.55, 1 / 0.55))
    return str(path)


def test_a_two_channel_stack_shows_its_brightest_slice_per_pixel(tmp_path):
    a = np.zeros((4, 2, 6, 7), np.uint16)
    a[2, 1, 3, 4] = 900   # a CD31 voxel deep in the stack
    a[0, 0, 1, 1] = 500   # a DAPI voxel in the first slice
    s = vascular.Session(stack_file(tmp_path / 's.tif', a, 'ZCYX'))
    meta, planes = s.opened()
    meta = json.loads(meta)
    planes = np.frombuffer(planes, np.uint8).reshape(2, meta['H'], meta['W'])
    assert [c['name'] for c in meta['channels']] == ['DAPI', 'CD31']
    assert planes[1, 3, 4] == 255 and planes[1].sum() == 255, 'the deep CD31 voxel reaches the flat picture, alone'
    assert planes[0, 1, 1] == 255 and planes[0].sum() == 255
    assert abs(meta['um'] - 0.55) < 1e-6
    assert ['Slices', '4'] in meta['info']


def test_a_single_channel_stack_is_cd31(tmp_path):
    a = np.zeros((3, 5, 5), np.uint16); a[1, 2, 2] = 100
    meta = json.loads(vascular.Session(stack_file(tmp_path / 'c.tif', a, 'ZYX')).opened()[0])
    assert [c['name'] for c in meta['channels']] == ['CD31']
