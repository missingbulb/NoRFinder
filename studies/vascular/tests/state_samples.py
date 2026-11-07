"""The z-stack the shell's states walk loads in this study (web-tests/test_shell_states_page.py): the crossing tubes
the extraction's own bridge test draws, which the algorithm finds vessels in."""
import os
import sys


def stack(d):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from test_extract_bridge import stack as tubes
    path = os.path.join(d, 'tubes.tif')
    tubes(path)
    return path
