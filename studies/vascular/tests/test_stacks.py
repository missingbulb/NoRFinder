"""The raw stacks are found through the study's Drive root and fetched only when missing.

Offline: Drive is replaced by a fake transport, so this cannot catch Drive changing its download
protocol or a share being revoked — the first real fetch reports those.
"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'analysis'))
import stacks


class FakeDrive:
    """A study root as the vascular one is laid out: stacks under Data/, previews files, ground truth, settings."""

    ROOT = [('Data/a.tif', 'A'), ('Data/b.tiff', 'B'), ('Data/rauntruth-previews.tiff', 'P1'),
            ('Data/Originals uncropped/a big.tif', 'O'), ('Data/Originals uncropped/rauntruth-previews.tiff', 'P2'),
            ('Data/notes.txt', 'N'), ('GT/a__1234/gt_someone.json', 'G'), ('rauntruth-study.json', 'S')]

    def __init__(self):
        self.downloads, self.listed = [], []

    def download(self, drive_id, out):
        self.downloads.append(drive_id)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, 'wb') as f:
            f.write(b'bytes of ' + drive_id.encode())

    def list_folder(self, drive_id):
        self.listed.append(drive_id)
        return self.ROOT


def study(d, **extra):
    path = os.path.join(d, 'study.json')
    with open(path, 'w') as f:
        json.dump({'root': 'https://drive.google.com/drive/folders/ROOT_ID_123', **extra}, f)
    return path


def test_the_root_and_the_z_step_come_from_study_json():
    with tempfile.TemporaryDirectory() as d:
        assert stacks.root_id(study(d)) == 'ROOT_ID_123'
        assert stacks.z_step_um(study(d, view={'spacing': 1.0})) == 1.0
        assert stacks.z_step_um(study(d, view={})) is None


def test_the_listing_is_the_stacks_in_the_roots_data_folder():
    drive = FakeDrive()
    got = stacks.listing(drive, 'ROOT_ID_123')
    assert drive.listed == ['ROOT_ID_123']
    assert got == [('Originals uncropped/a big.tif', 'O'), ('a.tif', 'A'), ('b.tiff', 'B')], got


def test_a_stack_is_downloaded_the_first_time_and_never_again():
    with tempfile.TemporaryDirectory() as d:
        drive, raw, s = FakeDrive(), os.path.join(d, 'raw'), study(d)
        got = stacks.fetch(raw=raw, transport=drive, study=s)
        assert got == [os.path.join(raw, 'a.tif'), os.path.join(raw, 'b.tiff')], got
        assert drive.downloads == ['A', 'B']
        stacks.fetch(raw=raw, transport=drive, study=s)
        assert drive.downloads == ['A', 'B'], 'a stack already in raw/ is not downloaded again'


def test_globs_choose_the_stacks_and_reach_into_subfolders():
    with tempfile.TemporaryDirectory() as d:
        drive, raw, s = FakeDrive(), os.path.join(d, 'raw'), study(d)
        got = stacks.fetch(['Originals uncropped/*'], raw=raw, transport=drive, study=s)
        assert got == [os.path.join(raw, 'Originals uncropped', 'a big.tif')] and drive.downloads == ['O'], (got, drive.downloads)


def test_a_study_naming_no_root_fetches_nothing():
    with tempfile.TemporaryDirectory() as d:
        s = os.path.join(d, 'study.json')
        with open(s, 'w') as f:
            json.dump({}, f)
        drive = FakeDrive()
        assert stacks.fetch(raw=os.path.join(d, 'raw'), transport=drive, study=s) == [] and not drive.listed
