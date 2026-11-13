"""The timers-in-one-file check, run by the engine on a violating tree and a clean one.

    python3 -m pytest .claudinite/local/packs/nor-finder/tests
"""
from test_async_wait_predicate import findings as found


def findings(tmp_path, files):
    return found(tmp_path, files, 'timers-in-one-file')


def test_each_raw_timer_in_page_code_is_found_in_the_shell_and_a_study(tmp_path):
    assert findings(tmp_path, {
        'web/shell.js': ('setInterval(usageNow, 1000);\n'
                         'item.spikeTimer = setTimeout(() => item.classList.remove("spike"), 3000);\n'),
        'web/sw.js': 'await fetch(LIST, { signal: AbortSignal.timeout(10000) });\n',
        'studies/x/web/view.js': 'maskTimer = setTimeout(() => {\n',
        'web/index.html': '<script>setTimeout(go, 50)</script>\n',
    }) == ['studies/x/web/view.js:1', 'web/index.html:1', 'web/shell.js:1', 'web/shell.js:2', 'web/sw.js:1']


def test_the_pacing_module_a_timer_saying_why_a_comment_vendor_and_tests_are_not(tmp_path):
    assert findings(tmp_path, {
        'web/pacing.js': 'export const after = (ms, fn) => { const id = setTimeout(fn, ms); return () => clearTimeout(id); };\n',
        'web/sw.js': 'fetch(LIST, { signal: AbortSignal.timeout(REACH_MS) }); // timed here: a worker loads no module\n',
        'web/shell.js': ('// setTimeout(go, 50) would guess\n'
                         'clearTimeout(saving);\n'
                         'every(1000, usageNow);\n'),
        'web/vendor/lib.js': 'setTimeout(go, 1);\n',
        'web-tests/a_driver.mjs': 'setTimeout(go, 1); // waits on purpose: x\n',
    }) == []
