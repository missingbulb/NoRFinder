"""1.8: the shell decides what is published, from the studies' standard layout; 1.9: visits are
counted on the released site only; 1.27: the page is at the site's root.

Run: python3 -m pytest web-tests/test_published_site.py
"""
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
sys.path.insert(0, os.path.join(ROOT, 'dev', 'tools', 'build'))
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
                 'studies/nor/docs/WARMUP.md'):
        assert os.path.exists(os.path.join(ROOT, kept)), f'{kept} moved: pick another research file'
        assert kept not in got, kept
    assert not any(p.startswith('dev/') for p in got)


def test_the_shell_ships_its_page_and_not_its_tooling():
    got = published()
    for page in ('web/index.html', 'web/shell.js', 'web/worker.js', 'web/sw.js', 'web/config.js', 'web/logo.svg'):
        assert page in got, page
    assert 'web/version_history.md' not in got


def test_the_repo_around_the_site_never_ships():
    for p in published():
        assert p.split('/')[0] in ('web', 'studies'), p


def test_assembling_copies_the_set_under_the_published_tree(tmp_path):
    tracked = open(os.path.join(ROOT, 'web', 'config.js')).read()
    build.assemble(ROOT, str(tmp_path), {'GOOGLE_API_KEY': 'k'})
    on_disk = {os.path.relpath(os.path.join(d, f), tmp_path) for d, _, fs in os.walk(tmp_path) for f in fs}
    assert {build.served(p) for p in published()} <= on_disk
    assert '"apiKey": "k"' in open(tmp_path / 'config.js').read()
    assert open(os.path.join(ROOT, 'web', 'config.js')).read() == tracked, 'the build rewrote the tracked web/config.js'


def test_the_page_is_at_the_site_root_beside_the_studies(tmp_path):
    build.assemble(ROOT, str(tmp_path), {})
    assert (tmp_path / 'index.html').is_file() and (tmp_path / 'shell.js').is_file()
    assert not (tmp_path / 'web').exists()
    assert (tmp_path / 'studies' / 'fixture' / 'study.json').is_file()
    assert build.served('web/sw.js') == 'sw.js' and build.served('studies/nor/study.json') == 'studies/nor/study.json'


def test_the_page_loads_the_analytics_loader_and_the_loader_waits_for_its_token():
    page = open(os.path.join(ROOT, 'web', 'index.html')).read()
    assert 'src="../analytics.js"' in page
    loader = open(os.path.join(ROOT, 'dev', 'build', 'site', 'analytics.js')).read()
    assert "'REPLACE_WITH_CLOUDFLARE_WEB_ANALYTICS_TOKEN'" in loader


def test_the_wrangler_config_builds_and_publishes_the_site_tree():
    w = json.load(open(os.path.join(ROOT, 'wrangler.json')))
    assert w['assets']['directory'] == './dev/build/site'
    assert w['build']['command'] == 'python3 dev/tools/build/build.py'
    assert {r['pattern'] for r in w['routes'] if r.get('custom_domain')} == {'rauntruth.com', 'www.rauntruth.com'}
