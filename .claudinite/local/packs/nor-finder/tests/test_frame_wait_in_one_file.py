"""The frame-wait-in-one-file check, run by the engine on a violating tree and a clean one.

    python3 -m pytest .claudinite/local/packs/nor-finder/tests
"""
from test_async_wait_predicate import findings as found


def findings(tmp_path, files):
    return found(tmp_path, files, 'frame-wait-in-one-file')


def test_each_hand_written_frame_wait_is_found_in_a_driver_and_a_study_test(tmp_path):
    assert findings(tmp_path, {
        'web-tests/a_driver.mjs': ('const frames = () => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));\n'
                                   'await page.evaluate(() => new Promise((ok) => requestAnimationFrame(ok)));\n'),
        'studies/x/tests/b_driver.mjs': 'await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));\n',
    }) == ['studies/x/tests/b_driver.mjs:1', 'web-tests/a_driver.mjs:1', 'web-tests/a_driver.mjs:2']


def test_the_helper_a_comment_a_stubbed_frame_and_page_code_are_not(tmp_path):
    assert findings(tmp_path, {
        'web-tests/page_frames.mjs': 'export const frames = (page, n = 2) => page.evaluate((n) => new Promise((ok) => { const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : ok()); f(n); }), n);\n',
        'web-tests/a_driver.mjs': ('// requestAnimationFrame(() => requestAnimationFrame(ok)) waits two frames\n'
                                   'globalThis.requestAnimationFrame = (f) => { queued = f; return 1; };\n'
                                   'await frames(page);\n'),
        'web/page.js': 'requestAnimationFrame(() => requestAnimationFrame(ok));\n',
    }) == []
