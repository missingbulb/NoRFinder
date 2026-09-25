"""R6 — raw data lives outside the repository, and a fetched file is trusted only by its checksum.

Offline: Drive is replaced by a fake transport, so this cannot catch Drive changing its download
protocol or a share being revoked — the first real fetch reports those.

Run: python3 tests/test_fetch_data.py
"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
import fetch_data


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
        assert fetch_data.verify(p, fetch_data.sha256_of(p)) == 'ok'
        assert fetch_data.verify(p, None) == 'unpinned'
        try:
            fetch_data.verify(p, '0' * 64)
        except fetch_data.ChecksumMismatch:
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
        fetch_data.fetch_all(manifest, raw, pin=True, transport=drive)

        a, folder = fetch_data.load_manifest(manifest)
        assert a['sha256'] == fetch_data.sha256_of(os.path.join(raw, 'a.tif'))
        listed = {f['path']: f for f in folder['files']}
        assert sorted(listed) == ['acme-scan/z01.tif', 'acme-scan/z02.tif']
        z1 = listed['acme-scan/z01.tif']
        assert z1['drive_id'] == 'F1'
        assert z1['sha256'] == fetch_data.sha256_of(os.path.join(raw, 'acme-scan', 'z01.tif'))
        assert 'F3' not in drive.downloads


def test_second_fetch_downloads_nothing_and_catches_a_changed_file():
    with tempfile.TemporaryDirectory() as d:
        manifest = write_manifest(d, [
            {'name': 'a.tif', 'drive_id': 'A', 'kind': 'file', 'sha256': None}])
        raw = os.path.join(d, 'raw')
        drive = FakeDrive()
        fetch_data.fetch_all(manifest, raw, pin=True, transport=drive)
        fetch_data.fetch_all(manifest, raw, pin=False, transport=drive)
        assert drive.downloads == ['A']

        os.remove(os.path.join(raw, 'a.tif'))
        drive.content['A'] = b'the file was replaced on Drive'
        try:
            fetch_data.fetch_all(manifest, raw, pin=False, transport=drive)
        except fetch_data.ChecksumMismatch:
            pass
        else:
            raise AssertionError('a file changed on Drive was accepted')


if __name__ == '__main__':
    tests = [fn for name, fn in list(globals().items()) if name.startswith('test_')]
    assert len(tests) == 3
    for fn in tests:
        fn()
        print('ok', fn.__name__)
