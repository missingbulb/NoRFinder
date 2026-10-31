"""Raw data lives outside the repository, and a fetched file is trusted only by its checksum.

Offline: Drive is replaced by a fake transport, so this cannot catch Drive changing its download
protocol or a share being revoked — the first real fetch reports those.

Run: python3 tests/test_stack_sources.py  (see data/README.md)
"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'analysis'))
import stack_sources


class FakeDrive:
    """A Drive holding one folder with two images and a zip, plus loose files."""

    FOLDER = {'FOLDER': [('acme-scan/z01.tif', 'F1'), ('acme-scan/z02.tif', 'F2'),
                         ('acme-scan/all.zip', 'F3')]}

    def __init__(self):
        self.downloads = []
        self.content = {}

    def download(self, drive_id, out):
        self.downloads.append(drive_id)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, 'wb') as f:
            f.write(self.content.get(drive_id, b'bytes of ' + drive_id.encode()))

    def list_folder(self, drive_id):
        return self.FOLDER[drive_id]


def write_manifest(d, sources):
    path = os.path.join(d, 'sources.json')
    with open(path, 'w') as f:
        json.dump({'sources': sources}, f)
    return path


def test_verify_accepts_match_rejects_mismatch_and_reports_unpinned():
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, 'x.tif')
        with open(p, 'wb') as f:
            f.write(b'plane')
        assert stack_sources.verify(p, stack_sources.sha256_of(p)) == 'ok'
        assert stack_sources.verify(p, None) == 'unpinned'
        try:
            stack_sources.verify(p, '0' * 64)
        except stack_sources.ChecksumMismatch:
            pass
        else:
            raise AssertionError('a mismatched file was accepted')


def test_pin_records_file_checksum_and_folder_listing_skipping_globs():
    with tempfile.TemporaryDirectory() as d:
        manifest = write_manifest(d, [
            {'name': 'a.tif', 'drive_id': 'A', 'kind': 'file', 'sha256': None},
            {'name': 'acme-scan', 'drive_id': 'FOLDER', 'kind': 'folder', 'skip': ['*.zip'],
             'files': None},
        ])
        raw = os.path.join(d, 'raw')
        drive = FakeDrive()
        stack_sources.fetch_all(manifest, raw, pin=True, transport=drive)

        a, folder = stack_sources.load_manifest(manifest)
        assert a['sha256'] == stack_sources.sha256_of(os.path.join(raw, 'a.tif'))
        listed = {f['path']: f for f in folder['files']}
        assert sorted(listed) == ['acme-scan/z01.tif', 'acme-scan/z02.tif']
        z1 = listed['acme-scan/z01.tif']
        assert z1['drive_id'] == 'F1'
        assert z1['sha256'] == stack_sources.sha256_of(os.path.join(raw, 'acme-scan', 'z01.tif'))
        assert 'F3' not in drive.downloads


def test_second_fetch_downloads_nothing_and_catches_a_changed_file():
    with tempfile.TemporaryDirectory() as d:
        manifest = write_manifest(d, [
            {'name': 'a.tif', 'drive_id': 'A', 'kind': 'file', 'sha256': None}])
        raw = os.path.join(d, 'raw')
        drive = FakeDrive()
        stack_sources.fetch_all(manifest, raw, pin=True, transport=drive)
        stack_sources.fetch_all(manifest, raw, pin=False, transport=drive)
        assert drive.downloads == ['A']

        os.remove(os.path.join(raw, 'a.tif'))
        drive.content['A'] = b'the file was replaced on Drive'
        try:
            stack_sources.fetch_all(manifest, raw, pin=False, transport=drive)
        except stack_sources.ChecksumMismatch:
            pass
        else:
            raise AssertionError('a file changed on Drive was accepted')


def test_repin_adds_files_uploaded_since_and_keeps_existing_pins():
    with tempfile.TemporaryDirectory() as d:
        manifest = write_manifest(d, [
            {'name': 'acme-scan', 'drive_id': 'FOLDER', 'kind': 'folder', 'skip': ['*.zip'],
             'files': [{'path': 'acme-scan/z01.tif', 'drive_id': 'F1', 'sha256': 'f' * 64}]}])
        raw = os.path.join(d, 'raw')
        drive = FakeDrive()
        drive.download('F1', os.path.join(raw, 'acme-scan', 'z01.tif'))
        drive.downloads.clear()
        try:
            stack_sources.fetch_all(manifest, raw, pin=True, transport=drive)
        except stack_sources.ChecksumMismatch:
            pass
        else:
            raise AssertionError('re-pinning overwrote a recorded checksum')

        pinned = stack_sources.sha256_of(os.path.join(raw, 'acme-scan', 'z01.tif'))
        write_manifest(d, [
            {'name': 'acme-scan', 'drive_id': 'FOLDER', 'kind': 'folder', 'skip': ['*.zip'],
             'files': [{'path': 'acme-scan/z01.tif', 'drive_id': 'F1', 'sha256': pinned}]}])
        stack_sources.fetch_all(manifest, raw, pin=True, transport=drive)
        files = {f['path']: f for f in stack_sources.load_manifest(manifest)[0]['files']}
        assert sorted(files) == ['acme-scan/z01.tif', 'acme-scan/z02.tif']
        assert files['acme-scan/z01.tif']['sha256'] == pinned
        assert drive.downloads == ['F2']


def test_on_demand_source_is_fetched_only_when_named():
    with tempfile.TemporaryDirectory() as d:
        manifest = write_manifest(d, [
            {'name': 'a.tif', 'drive_id': 'A', 'kind': 'file', 'sha256': None},
            {'name': 'b.tif', 'drive_id': 'B', 'kind': 'file', 'sha256': None, 'on_demand': True}])
        raw = os.path.join(d, 'raw')
        drive = FakeDrive()
        stack_sources.fetch_all(manifest, raw, transport=drive)
        assert drive.downloads == ['A']
        stack_sources.fetch_all(manifest, raw, only={'b.tif'}, transport=drive)
        assert drive.downloads == ['A', 'B']


if __name__ == '__main__':
    tests = [fn for name, fn in list(globals().items()) if name.startswith('test_')]
    assert len(tests) == 5
    for fn in tests:
        fn()
        print('ok', fn.__name__)
