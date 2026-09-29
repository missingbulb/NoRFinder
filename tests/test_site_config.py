"""R8 — the deploy's repository variables reach the page through web/config.js.

Run: python3 tests/test_site_config.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'web'))
import build


def settings(text):
    return json.loads(text.split('window.NOR_CONFIG = ', 1)[1].rstrip().rstrip(';'))


def test_the_deploy_variables_become_the_page_settings():
    got = settings(build.config_js({'GOOGLE_API_KEY': 'AIza"x', 'DRIVE_DEFAULT_FOLDER': 'https://drive.google.com/drive/folders/abc'}))
    assert got == {'google': {'apiKey': 'AIza"x'}, 'drive': {'defaultLink': 'https://drive.google.com/drive/folders/abc'}}


def test_a_local_preview_keeps_the_committed_settings():
    assert build.config_js({}) is None
    assert build.config_js({'DRIVE_DEFAULT_FOLDER': 'https://drive.google.com/drive/folders/abc'}) is None


def main():
    test_the_deploy_variables_become_the_page_settings()
    test_a_local_preview_keeps_the_committed_settings()
    print('ok')


if __name__ == '__main__':
    main()
