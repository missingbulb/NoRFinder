"""The repo's pytest hooks, from dev/tools/build/pytest_ci.py, for the tests in this folder."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'dev', 'tools', 'build'))
from pytest_ci import pytest_configure, pytest_runtest_makereport
