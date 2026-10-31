"""Every requirement in the page's spec has a number no other requirement has, so a test or a comment citing
one names one thing. Two pull requests written side by side each take the next free number; this fails the
second to merge."""
import collections
import os
import re

SPEC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dev', 'requirements', 'requirements.md')


def test_no_two_requirements_share_a_number():
    numbers = re.findall(r'^- `(\d+\.\d+)`', open(SPEC).read(), re.M)
    assert len(numbers) >= 50, f'found only {len(numbers)} requirements: the pattern no longer matches the spec'
    shared = sorted(n for n, k in collections.Counter(numbers).items() if k > 1)
    assert not shared, f'requirement numbers used twice: {shared}'
