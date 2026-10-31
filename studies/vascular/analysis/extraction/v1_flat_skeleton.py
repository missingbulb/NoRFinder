"""v1, flat skeleton: analysis/vessel_model.py as it stood when versioning began (2026-10-29).

Flatten the noise-normalised slices, threshold with hysteresis, skeletonise, clean, fit curves, and
trace a fainter threshold for low-confidence candidates. Kept unchanged as the baseline every later
version is scored against.
"""
import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import vessel_model as vm

NAME = 'v1-flat-skeleton'


def extract(vol, um, source, z_step):
    m = vm.model(vol, um, source, z_step)
    m['algorithm'] = NAME
    return m
