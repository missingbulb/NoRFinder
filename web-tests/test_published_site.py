"""req/shell/site/published-files: the shell decides what is published, from the studies' standard layout; req/shell/site/visit-counting: visits are
counted on the released site only; req/shell/site/app-address: the app is under /app/ and the site's own pages at its top; req/shell/site/policies, req/shell/site/license: the privacy policy, terms and license are published there and linked; req/shell/site/landing: the landing page; req/shell/site/icons: the
icons and posters; req/shell/site/crawlers: the sitemap and robots.txt.

Run: python3 -m pytest web-tests/test_published_site.py
"""
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
sys.path.insert(0, os.path.join(ROOT, 'dev', 'tools', 'build'))
import build
from PIL import Image

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
            if key in m['web']:
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


def test_every_file_a_study_page_fetches_is_published():
    """req/nor/metrics: a file the page reads beside its own module (new URL(..., import.meta.url)) must ship with it; a
    folder it reads under (a base address handed to an engine) must ship with files in it."""
    got, fetched = published(), []
    for module in glob.glob(os.path.join(ROOT, 'studies', '*', 'web', '*.js')):
        rel = os.path.relpath(module, ROOT)
        for target in re.findall(r'new URL\("([^"]+)", import\.meta\.url\)', open(module).read()):
            fetched.append((rel, os.path.normpath(os.path.join(os.path.dirname(rel), target))))
    assert len(fetched) >= 1, 'found no module-relative fetch: the sweep is not looking at the study pages'
    missing = [f'{m} fetches {t}' for m, t in fetched if t not in got and not any(g.startswith(t + '/') for g in got)]
    assert not missing, missing


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
    for page in ('web/index.html', 'web/shell.js', 'web/worker.js', 'web/sw.js', 'web/config.js', 'web/logo.svg',
                 'web/icon.svg', 'web/poster.png'):
        assert page in got, page
    assert 'web/version_history.md' not in got


def test_the_repo_around_the_site_never_ships():
    for p in published():
        assert p.split('/')[0] in ('web', 'site', 'studies'), p


def test_assembling_copies_the_set_under_the_published_tree(tmp_path):
    tracked = open(os.path.join(ROOT, 'web', 'config.js')).read()
    build.assemble(ROOT, str(tmp_path), {'GOOGLE_API_KEY': 'k'})
    on_disk = {os.path.relpath(os.path.join(d, f), tmp_path) for d, _, fs in os.walk(tmp_path) for f in fs}
    assert {build.served(p) for p in published()} <= on_disk
    assert '"apiKey": "k"' in open(tmp_path / 'app' / 'config.js').read()
    assert open(os.path.join(ROOT, 'web', 'config.js')).read() == tracked, 'the build rewrote the tracked web/config.js'


def test_the_app_is_under_app_beside_the_studies_and_the_site_pages_at_the_top(tmp_path):
    build.assemble(ROOT, str(tmp_path), {})
    assert (tmp_path / 'app' / 'index.html').is_file() and (tmp_path / 'app' / 'shell.js').is_file()
    assert not (tmp_path / 'web').exists() and not (tmp_path / 'shell.js').exists()
    assert (tmp_path / 'studies' / 'fixture' / 'study.json').is_file()
    for page in ('index.html', 'privacy.html', 'terms.html', 'license.html', 'robots.txt', 'sitemap.xml', 'favicon.svg', 'favicon.ico'):
        assert (tmp_path / page).is_file(), page
    assert build.served('web/sw.js') == 'app/sw.js' and build.served('site/index.html') == 'index.html'
    assert build.served('studies/nor/study.json') == 'studies/nor/study.json'


def test_no_address_from_before_the_move_is_redirected(tmp_path):
    """req/shell/site/app-address: the owner chose to let /<id>, /web/... and /?study= go unserved: nothing redirects them."""
    build.assemble(ROOT, str(tmp_path), {})
    assert not (tmp_path / '_redirects').exists()
    assert not any((tmp_path / (s + '.html')).exists() for s in STUDIES)


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


def listed_studies(tmp_path, *studies):
    for sid, visibility in studies:
        os.makedirs(tmp_path / 'studies' / sid)
        (tmp_path / 'studies' / sid / 'study.json').write_text(json.dumps(dict(id=sid, title=sid.title(), visibility=visibility)))
    return str(tmp_path)


def test_each_listed_study_is_published_under_its_own_path(tmp_path):
    """req/shell/study/folder-and-address: rauntruth.com/app/<id> is the page, published again as app/<id>.html, which Cloudflare serves at /app/<id>."""
    root = listed_studies(tmp_path, ('alpha', 'listed'), ('hidden', 'unlisted'), ('mine', {'accounts': ['me@example.com']}))
    assert build.study_pages(root, {'index.html', 'shell.js'}) == ['alpha.html', 'mine.html']


def test_a_study_whose_path_the_site_already_serves_is_refused(tmp_path):
    root = listed_studies(tmp_path, ('vendor', 'listed'))
    for taken in ({'vendor'}, {'vendor.html'}):
        try:
            build.study_pages(root, taken)
        except ValueError as e:
            assert 'vendor' in str(e)
        else:
            raise AssertionError(f'a study named vendor was published over {taken}')


def test_the_repos_studies_take_no_path_the_app_serves():
    top = {p.split('/')[1] for p in map(build.served, published()) if p.startswith('app/')} | set(build.GENERATED)
    assert len(top) >= 5, top
    assert 'nor.html' in build.study_pages(ROOT, top)


def test_the_privacy_policy_terms_and_license_are_published_at_the_top_and_linked(tmp_path):
    build.assemble(ROOT, str(tmp_path), {})
    landing, app = (tmp_path / 'index.html').read_text(), (tmp_path / 'app' / 'index.html').read_text()
    for page in ('privacy', 'terms', 'license'):
        text = (tmp_path / (page + '.html')).read_text()
        # served at /privacy, /terms and /license, linked without .html (Cloudflare redirects the .html form)
        assert re.search(rf'<a [^>]*href="{page}"', landing), f'the landing page does not link {page}'
        assert re.search(rf'<a [^>]*href="\.\./{page}"', app), f'the app does not link {page}'
        assert re.search(r'<a [^>]*href="mailto:[^"]+@[^"]+"', text), f'{page} gives no way to reach whoever runs the site'
        assert re.search(r'<a [^>]*href="(/|\./)"', text), f'{page} does not link back to the landing page'
    privacy = (tmp_path / 'privacy.html').read_text()
    # Google's consent screen requires the policy to say Google user data is used under its Limited Use rules
    assert 'https://developers.google.com/terms/api-services-user-data-policy' in privacy and 'Limited Use' in privacy


def words(html):
    return ' '.join(re.sub(r'<[^>]+>', ' ', html).split())


def test_the_license_page_carries_the_repos_mit_license_word_for_word(tmp_path):
    build.assemble(ROOT, str(tmp_path), {})
    license = open(os.path.join(ROOT, 'LICENSE')).read()
    assert ' '.join(license.split()) in words((tmp_path / 'license.html').read_text())


def test_the_landing_page_opens_the_app_and_lists_every_listed_study(tmp_path):
    build.assemble(ROOT, str(tmp_path), {})
    landing = (tmp_path / 'index.html').read_text()
    assert re.search(r'<a [^>]*href="app/"', landing), 'the landing page does not open the app'
    assert len(build.studies(ROOT)) >= 3
    for s in (s for s in build.studies(ROOT) if 'accounts' not in s):
        assert re.search(rf'<a [^>]*href="app/{s["id"]}"[^>]*>[^<]*{re.escape(s["title"])}', landing), s
    assert not re.search(r'href="app/fixture"', landing), 'an unlisted study is offered on the landing page'
    for s in build.studies(ROOT):
        if 'accounts' in s:
            assert not re.search(rf'href="app/{s["id"]}"', landing), f'{s["id"]}, shown to named accounts alone, is offered on the landing page'
    assert 'src="analytics.js"' in landing



def test_the_landing_page_lists_the_supported_browsers_the_page_checks_for(tmp_path):
    """req/shell/browsers/supported: the landing page's list is the one the status bar's icon is drawn from."""
    build.assemble(ROOT, str(tmp_path), {})
    landing = (tmp_path / 'index.html').read_text()
    supported = json.load(open(os.path.join(ROOT, 'web', 'browsers.json')))['supported']
    assert len(supported) >= 2
    listed = re.search(r'<ul [^>]*id="browsers"[^>]*>(.*?)</ul>', landing, re.S)
    assert listed, 'the landing page has no list of supported browsers'
    items = re.findall(r'<li>([^<]*)</li>', listed.group(1))
    assert items == [f'{b["name"]} {b["from"]} or later' for b in supported], items


def meta(html, prop):
    m = re.search(rf'<meta (?:property|name)="{prop}" content="([^"]*)"', html)
    return m and m.group(1)


def icon_of(html):
    m = re.search(r'<link rel="icon"[^>]*href="([^"]*)"', html)
    return m and m.group(1)


def poster(path):
    im = Image.open(path)
    return im.format, im.size


def test_the_site_and_the_app_each_carry_their_own_icon_and_poster(tmp_path):
    build.assemble(ROOT, str(tmp_path), {})
    site = build.SITE_URL
    for page in ('index.html', 'privacy.html', 'terms.html', 'license.html'):
        html = (tmp_path / page).read_text()
        assert icon_of(html) == 'favicon.svg', page
    landing, app = (tmp_path / 'index.html').read_text(), (tmp_path / 'app' / 'index.html').read_text()
    assert icon_of(app) == 'icon.svg'
    assert (tmp_path / 'favicon.svg').read_bytes() != (tmp_path / 'app' / 'icon.svg').read_bytes()
    assert meta(landing, 'og:image') == site + '/poster.png' and meta(app, 'og:image') == site + '/app/poster.png'
    assert meta(landing, 'og:url') == site + '/' and meta(app, 'og:url') == site + '/app/'
    for html in (landing, app):
        assert meta(html, 'og:title') and meta(html, 'og:description') and meta(html, 'twitter:card') == 'summary_large_image'
    assert poster(tmp_path / 'poster.png') == ('PNG', (1200, 630)) and poster(tmp_path / 'app' / 'poster.png') == ('PNG', (1200, 630))
    assert (tmp_path / 'poster.png').read_bytes() != (tmp_path / 'app' / 'poster.png').read_bytes()
    assert Image.open(tmp_path / 'favicon.ico').format == 'ICO'


def test_a_studys_address_carries_its_own_icon_and_poster_or_the_apps(tmp_path):
    """req/shell/site/icons: study.json's icon and poster, under its web/, reach its address; a study naming none keeps the app's."""
    build.assemble(ROOT, str(tmp_path), {})
    site, own = build.SITE_URL, 0
    assert len(build.studies(ROOT)) >= 3
    for s in build.studies(ROOT):
        m = json.load(open(os.path.join(ROOT, 'studies', s['id'], 'study.json')))
        html = (tmp_path / 'app' / (s['id'] + '.html')).read_text()
        assert meta(html, 'og:title') == s['title'] and re.search(rf'<title>{re.escape(s["title"])}</title>', html)
        assert meta(html, 'og:url') == f'{site}/app/{s["id"]}'
        assert icon_of(html) == (f'../studies/{s["id"]}/{m["icon"]}' if 'icon' in m else 'icon.svg'), s
        assert meta(html, 'og:image') == (f'{site}/studies/{s["id"]}/{m["poster"]}' if 'poster' in m else f'{site}/app/poster.png'), s
        if 'poster' in m:
            assert poster(tmp_path / 'studies' / s['id'] / m['poster']) == ('PNG', (1200, 630)), s
        own += 'icon' in m and 'poster' in m
    assert own >= 1, 'no study sets its own icon and poster: the substitution is not exercised'


def test_the_sitemap_lists_the_sites_own_pages_never_the_app_or_a_study(tmp_path):
    build.assemble(ROOT, str(tmp_path), {})
    site = build.SITE_URL
    listed = re.findall(r'<loc>([^<]+)</loc>', (tmp_path / 'sitemap.xml').read_text())
    assert set(listed) == {site + '/', site + '/privacy', site + '/terms', site + '/license'}, listed


def test_robots_names_the_sitemap_and_keeps_crawlers_off_the_app(tmp_path):
    build.assemble(ROOT, str(tmp_path), {})
    robots = (tmp_path / 'robots.txt').read_text()
    assert f'Sitemap: {build.SITE_URL}/sitemap.xml' in robots and 'User-agent: *' in robots
    rules = re.findall(r'^Disallow: (\S+)$', robots, re.M)
    assert rules == ['/app/'], rules
    # every page the sitemap lists stays open to crawlers
    for url in re.findall(r'<loc>([^<]+)</loc>', (tmp_path / 'sitemap.xml').read_text()):
        assert not url[len(build.SITE_URL):].startswith('/app/'), url


def test_the_build_lists_every_file_the_app_needs_offline_with_its_hash(tmp_path):
    """req/shell/offline/default: app/offline.json names each file of the app and the studies with its SHA-256, by its path from the app,
    but itself; the site's own pages lie outside the app's worker and are left out."""
    import hashlib
    build.assemble(ROOT, str(tmp_path), {})
    app = tmp_path / 'app'
    files = json.load(open(app / 'offline.json'))['files']
    on_disk = {os.path.relpath(os.path.join(d, f), app).replace(os.sep, '/') for top in ('app', 'studies')
               for d, _, fs in os.walk(tmp_path / top) for f in fs}
    assert {f['path'] for f in files} == on_disk - {'offline.json'}
    for f in files:
        assert f['sha256'] == hashlib.sha256(open(app / f['path'], 'rb').read()).hexdigest(), f['path']
    assert {'index.html', 'shell.js', 'sw.js', '../studies/nor/study.json'} <= {f['path'] for f in files}
