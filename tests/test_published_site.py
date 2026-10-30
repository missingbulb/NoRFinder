"""1.8: the shell decides what is published, from the studies' standard layout; 1.9: visits are
counted on the released site only.

Run: python3 -m pytest tests/test_published_site.py
"""
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
sys.path.insert(0, os.path.join(ROOT, 'web'))
import build

STUDIES = sorted(os.path.basename(os.path.dirname(p)) for p in glob.glob(os.path.join(ROOT, 'studies', '*', 'study.json')))


def published():
    return set(build.published(ROOT))


def test_every_study_ships_its_manifest_page_part_and_python():
    got = published()
    for sid in STUDIES:
        base = f'studies/{sid}'
        m = json.load(open(os.path.join(ROOT, base, 'study.json')))
        assert f'{base}/study.json' in got
        for key in ('module', 'panels', 'style'):
            assert f'{base}/{m["web"][key]}' in got, m['web'][key]
        for d in m['python']['paths']:
            for f in glob.glob(os.path.join(ROOT, base, d, '*.py')):
                assert os.path.relpath(f, ROOT) in got, f
        if 'driveThumbs' in m:
            assert any(p.startswith(f'{base}/{m["driveThumbs"]}') for p in got)


def test_nothing_else_of_a_study_ships():
    for p in published():
        if not p.startswith('studies/'):
            continue
        sid, rest = p.split('/')[1], p.split('/', 2)[2]
        m = json.load(open(os.path.join(ROOT, 'studies', sid, 'study.json')))
        top = [d.rstrip('/') for d in m['python']['paths']]
        python = rest.endswith('.py') and os.path.dirname(rest) in top
        page = rest.startswith('web/') and not rest.endswith('.py')
        assert rest == 'study.json' or python or page, p


def test_research_files_stay_home():
    got = published()
    for kept in ('studies/nor/docs/requirements.md', 'studies/nor/tests/test_quality.py',
                 'studies/nor/detection/lab/ledger.md', 'studies/nor/detection/STATE.md',
                 'studies/nor/detection/browser/bench_live.mjs', 'studies/nor/data/sources.json',
                 'studies/nor/web/drive_thumbs.py'):
        assert os.path.exists(os.path.join(ROOT, kept)), f'{kept} moved: pick another research file'
        assert kept not in got, kept


def test_the_shell_ships_its_page_and_not_its_tooling():
    got = published()
    for page in ('web/index.html', 'web/shell.js', 'web/worker.js', 'web/sw.js', 'web/config.js', 'web/logo.svg'):
        assert page in got, page
    for tool in ('web/build.py', 'web/version_history.py', 'web/logo_trace.py', 'web/logo_source.png', 'web/version_history.md'):
        assert tool not in got, tool


def test_the_repo_around_the_site_never_ships():
    for p in published():
        assert p.split('/')[0] in ('web', 'studies'), p


def test_assembling_copies_the_set_under_the_published_tree(tmp_path):
    tracked = open(os.path.join(ROOT, 'web', 'config.js')).read()
    build.assemble(ROOT, str(tmp_path), {'GOOGLE_API_KEY': 'k'})
    on_disk = {os.path.relpath(os.path.join(d, f), tmp_path) for d, _, fs in os.walk(tmp_path) for f in fs}
    assert published() <= on_disk
    assert '"apiKey": "k"' in open(tmp_path / 'web' / 'config.js').read()
    assert open(os.path.join(ROOT, 'web', 'config.js')).read() == tracked, 'the build rewrote the tracked web/config.js'


def test_the_page_loads_the_analytics_loader_and_the_loader_waits_for_its_token():
    page = open(os.path.join(ROOT, 'web', 'index.html')).read()
    assert 'src="../analytics.js"' in page
    loader = open(os.path.join(ROOT, 'site', 'analytics.js')).read()
    assert "'REPLACE_WITH_CLOUDFLARE_WEB_ANALYTICS_TOKEN'" in loader


def test_the_wrangler_config_builds_and_publishes_the_site_tree():
    w = json.load(open(os.path.join(ROOT, 'wrangler.json')))
    assert w['assets']['directory'] == './site'
    assert w['build']['command'] == 'python3 web/build.py'
    assert {r['pattern'] for r in w['routes'] if r.get('custom_domain')} == {'rauntruth.com', 'www.rauntruth.com'}
