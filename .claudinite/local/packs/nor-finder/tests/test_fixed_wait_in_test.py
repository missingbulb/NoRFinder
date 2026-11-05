"""The fixed-wait-in-test check, run by the engine on a violating tree and a clean one.

    python3 -m pytest .claudinite/local/packs/nor-finder/tests
"""
from test_async_wait_predicate import findings as found


def findings(tmp_path, files):
    return found(tmp_path, files, 'fixed-wait-in-test')


def test_each_fixed_wait_is_found_in_a_driver_and_a_study_test(tmp_path):
    assert findings(tmp_path, {
        'web-tests/a_driver.mjs': ('await page.waitForTimeout(300);\n'
                                   'await pause(600);\n'
                                   'await new Promise((ok) => setTimeout(ok, 100));\n'),
        'studies/x/tests/b_driver.mjs': 'const p = ctx.pages()[0];\nawait new Promise((r) => setTimeout(r, 50));\n',
        'studies/x/tests/test_c.py': 'import time\ntime.sleep(0.5)\n',
    }) == ['studies/x/tests/b_driver.mjs:2', 'studies/x/tests/test_c.py:2',
           'web-tests/a_driver.mjs:1', 'web-tests/a_driver.mjs:2', 'web-tests/a_driver.mjs:3']


def test_a_wait_saying_why_a_comment_a_condition_wait_and_page_code_are_not(tmp_path):
    assert findings(tmp_path, {
        'web-tests/a_driver.mjs': ('await page.waitForTimeout(6200); // waits on purpose: the browser\'s 5 s user activation lapses\n'
                                   '// await page.waitForTimeout(300) would guess\n'
                                   'await page.waitForFunction(() => document.title);\n'
                                   'const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));\n'),
        'studies/x/tests/test_c.py': 'time.sleep(delay)  # waits on purpose: loads started apart\n',
        'web/page.js': 'await new Promise((ok) => setTimeout(ok, 100));\n',
    }) == []
