"""Builds the site the release uploads: the shell decides what of the repo is published, from the
studies' standard layout (req/shell/site/published-files), and assembles it under dev/build/site/, the tree
wrangler.json publishes: the site's own pages (site/) at its top, the shell's page under app/ and the
studies under studies/ (req/shell/site/app-address). The release runs this through wrangler.json's build command;
so does a local preview:

  python3 dev/tools/build/build.py
  python3 dev/tools/build/serve.py        then open http://localhost:8000/

It also fetches the third-party wheels the studies install into Pyodide (packages Pyodide does not
ship, each study's python.wheels) into web/vendor/, so the page never depends on PyPI at run time;
writes the version history the page shows (version_history.py) and the studies its header offers
(studies.json); publishes the page again as app/<id>.html for each of them, which Cloudflare serves at
/app/<id>, carrying the study's own icon and poster (req/shell/site/icons); lists the studies on the landing
page (req/shell/site/landing); writes sitemap.xml and robots.txt (req/shell/site/crawlers); and writes the deployment's
settings into the published web/config.js from the repository variables: GOOGLE_API_KEY turns on
loading from Google Drive, GOOGLE_CLIENT_ID signing in with Google. The folder its dialog opens on is each study's own (files.drive in its study.json).
"""
import glob, hashlib, json, os, re, shutil, subprocess, sys, urllib.parse
from html import escape

import version_history

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
# the address a shared link's preview and the sitemap name the site by
SITE_URL = 'https://www.rauntruth.com'
APP = 'app'
# the site's own pages the sitemap lists: every page at the top but the landing page's file
PAGES_NOT_LISTED = {'index.html'}
WEB = os.path.join(ROOT, 'web')
OUT = os.path.join(WEB, 'vendor')
SITE = os.path.join(ROOT, 'dev', 'build', 'site')
# what the build writes into web/ and the page reads, published under app/
GENERATED = ('vendor', 'version_history.json', 'studies.json')
# the list of the app's files, the studies' included, the page keeps a copy of to open offline (req/shell/offline/default)
OFFLINE = 'offline.json'
OFFLINE_TREES = (APP, 'studies')


def wheels():
    """Every study's pinned wheels, once each."""
    pins = set()
    for path in glob.glob(os.path.join(ROOT, 'studies', '*', 'study.json')):
        pins.update(json.load(open(path))['python']['wheels'])
    return sorted(pins)


def studies(root):
    """The studies the header's switcher offers, [{id, title}] by title: those whose study.json lists them."""
    found = [json.load(open(p)) for p in glob.glob(os.path.join(root, 'studies', '*', 'study.json'))]
    return sorted(({'id': m['id'], 'title': m['title']} for m in found if m['listed']), key=lambda m: m['title'])


def study_pages(root, top):
    """The page's copies, one per listed study, [<id>.html]; an id the app already serves at its top
    (top: the names under app/) would hide that file or be hidden by it, and is refused."""
    pages = []
    for s in studies(root):
        taken = {s['id'], s['id'] + '.html'} & set(top)
        if taken:
            raise ValueError(f'study "{s["id"]}" would take {", ".join(sorted(taken))}, which the site already serves')
        pages.append(s['id'] + '.html')
    return pages


def config_js(env):
    """The page's settings from the deploy's variables; None without a key, keeping the committed file."""
    if not env.get('GOOGLE_API_KEY'):
        return None
    settings = {'google': {'apiKey': env['GOOGLE_API_KEY'], 'clientId': env.get('GOOGLE_CLIENT_ID', '')}}
    return ('// written by dev/tools/build/build.py from the repository variables GOOGLE_API_KEY and GOOGLE_CLIENT_ID\n'
            f'window.NOR_CONFIG = {json.dumps(settings)};\n')


def shell_ships(rel):
    return not rel.endswith(('.py', '.md'))


def served(rel):
    """Where a published repo file is on the site: the site's own pages at the top, the shell's page under app/,
    the studies under studies/."""
    if rel.startswith('web/'):
        return APP + '/' + rel[len('web/'):]
    if rel.startswith('site/'):
        return rel[len('site/'):]
    return rel


def study_ships(rel, python_dirs):
    """A study's standard layout: study.json, its page part under web/ (never Python), and the
    modules directly in the folders its Python is imported from, which is all the page's importer
    can reach. Its docs, data, tests and lab notes stay in the repo."""
    if rel == 'study.json':
        return True
    if rel.startswith('web/'):
        return not rel.endswith('.py')
    return rel.endswith('.py') and os.path.dirname(rel) in python_dirs


def tracked(root):
    return [p for p in subprocess.run(['git', '-C', root, 'ls-files', '-z'], capture_output=True, check=True, text=True).stdout.split('\0') if p]


def published(root):
    """The repo's files the site serves, repo-relative, in the order git lists them."""
    dirs = {}
    for rel in tracked(root):
        parts = rel.split('/')
        if parts[0] in ('web', 'site') and len(parts) > 1 and shell_ships(rel):
            yield rel
        elif parts[0] == 'studies' and len(parts) > 2:
            sid = parts[1]
            if sid not in dirs:
                manifest = os.path.join(root, 'studies', sid, 'study.json')
                dirs[sid] = {d.strip('/') for d in json.load(open(manifest))['python']['paths']} if os.path.isfile(manifest) else None
            if dirs[sid] is not None and study_ships('/'.join(parts[2:]), dirs[sid]):
                yield rel


def assemble(root, out, env):
    """Copies the published set, and what the build generated, into out/ beside the files tracked there;
    returns the file count."""
    kept = {os.path.relpath(os.path.join(root, p), out) for p in tracked(root)}
    for d, _, fs in os.walk(out):
        for f in fs:
            if os.path.relpath(os.path.join(d, f), out) not in kept:
                os.remove(os.path.join(d, f))
    files = list(published(root))
    for rel in files:
        dst = os.path.join(out, served(rel))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(os.path.join(root, rel), dst)
    app = os.path.join(out, APP)
    for name in GENERATED:
        src = os.path.join(root, 'web', name)
        if os.path.isdir(src):
            shutil.copytree(src, os.path.join(app, name), dirs_exist_ok=True)
        elif os.path.isfile(src):
            shutil.copy2(src, os.path.join(app, name))
    top = {served(rel).split('/')[1] for rel in files if served(rel).startswith(APP + '/')} | set(GENERATED)
    index = open(os.path.join(app, 'index.html')).read()
    for page in study_pages(root, top):
        sid = page[:-len('.html')]
        with open(os.path.join(app, page), 'w') as f:
            f.write(study_head(index, json.load(open(os.path.join(root, 'studies', sid, 'study.json')))))
    landing = os.path.join(out, 'index.html')
    text = list_browsers(list_studies(open(landing).read(), studies(root)), json.load(open(os.path.join(root, 'web', 'browsers.json')))['supported'])
    with open(landing, 'w') as f:
        f.write(text)
    for d, _, fs in os.walk(out):
        for f in fs:
            if f.endswith('.html'):
                path = os.path.join(d, f)
                text = open(path).read()
                shared = share_links(text, os.path.relpath(path, out).replace(os.sep, '/'))
                if shared != text:
                    with open(path, 'w') as g:
                        g.write(shared)
    with open(os.path.join(out, 'sitemap.xml'), 'w') as f:
        f.write(sitemap(out))
    with open(os.path.join(out, 'robots.txt'), 'w') as f:
        f.write(robots())
    text = config_js(env)
    if text:
        with open(os.path.join(app, 'config.js'), 'w') as f:
            f.write(text)
    offline_list(out)
    return len(files), bool(text)


def attr(html, tag, value):
    """html with the content (a meta) or href (a link) of the one tag matching tag set to value."""
    got = re.subn(rf'({tag}[^>]*?(?:content|href)=")[^"]*(")', lambda m: m.group(1) + value + m.group(2), html, count=1)
    if not got[1]:
        raise ValueError(f'the page has no {tag}')
    return got[0]


def study_head(index, m):
    """The page as a study's own address serves it: its title, and its icon and poster where its study.json names
    them (req/shell/site/icons), each relative to the page, as the shell names them."""
    base = f'../studies/{m["id"]}/'
    html = re.sub(r'<title>[^<]*</title>', lambda _: f'<title>{escape(m["title"])}</title>', index, count=1)
    html = attr(html, '<meta property="og:title"', escape(m['title']))
    html = attr(html, '<meta property="og:url"', m['id'])
    if 'icon' in m:
        html = attr(html, '<link rel="icon"', base + m['icon'])
    if 'poster' in m:
        html = attr(html, '<meta property="og:image"', base + m['poster'])
    return html


def share_links(html, page):
    """A page's og:image and og:url as full addresses, which a link's preview needs: the page names them relative
    to itself (page: its path on the site)."""
    here = SITE_URL + '/' + page
    for prop in ('og:image', 'og:url'):
        m = re.search(rf'<meta property="{prop}" content="([^"]*)"', html)
        if m:
            html = attr(html, f'<meta property="{prop}"', urllib.parse.urljoin(here, m.group(1)))
    return html


def list_studies(landing, listed):
    """The landing page with every listed study a link to its address in the app (req/shell/site/landing)."""
    items = ''.join(f'\n<li><a href="{APP}/{s["id"]}">{escape(s["title"])}</a></li>' for s in listed)
    got = re.subn(r'(<ul [^>]*id="studies"[^>]*>)(</ul>)', lambda m: m.group(1) + items + '\n' + m.group(2), landing, count=1)
    if not got[1]:
        raise ValueError('the landing page has no empty <ul id="studies">')
    return got[0]



def list_browsers(landing, supported):
    """The landing page with the browsers the page supports, as the status bar checks for them (req/shell/browsers/supported)."""
    items = ''.join(f'\n<li>{escape(b["name"])} {b["from"]} or later</li>' for b in supported)
    got = re.subn(r'(<ul [^>]*id="browsers"[^>]*>)(</ul>)', lambda m: m.group(1) + items + '\n' + m.group(2), landing, count=1)
    if not got[1]:
        raise ValueError('the landing page has no empty <ul id="browsers">')
    return got[0]

def site_pages(out):
    """The addresses of the site's own pages, never the app's or a study's (req/shell/site/crawlers)."""
    pages = ['/']
    pages += sorted('/' + f[:-len('.html')] for f in os.listdir(out) if f.endswith('.html') and f not in PAGES_NOT_LISTED)
    return [SITE_URL + p for p in pages]


def sitemap(out):
    urls = ''.join(f'  <url><loc>{u}</loc></url>\n' for u in site_pages(out))
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n'


def robots():
    """Crawlers kept off the app, every study's address in it included (req/shell/site/crawlers)."""
    return f'User-agent: *\nDisallow: /{APP}/\n\nSitemap: {SITE_URL}/sitemap.xml\n'


def offline_list(out):
    """Writes out/app/offline.json, {files: [{path, sha256}]}: every file of the app and the studies, by its path
    from the app, where the app's service worker reads it."""
    app, files = os.path.join(out, APP), []
    for top in OFFLINE_TREES:
        for d, _, fs in os.walk(os.path.join(out, top)):
            for f in fs:
                path = os.path.join(d, f)
                rel = os.path.relpath(path, app).replace(os.sep, '/')
                if rel != OFFLINE:
                    files.append({'path': rel, 'sha256': hashlib.sha256(open(path, 'rb').read()).hexdigest()})
    with open(os.path.join(app, OFFLINE), 'w') as f:
        json.dump({'files': sorted(files, key=lambda e: e['path'])}, f, indent=1)


if __name__ == '__main__':
    shutil.rmtree(OUT, ignore_errors=True)
    subprocess.run([sys.executable, '-m', 'pip', 'download', '-q', '--no-deps', '--only-binary', ':all:', '-d', OUT, *wheels()], check=True)
    json.dump(sorted(os.path.basename(f) for f in glob.glob(os.path.join(OUT, '*.whl'))), open(os.path.join(OUT, 'wheels.json'), 'w'))
    json.dump(version_history.history(ROOT), open(version_history.OUT, 'w'), indent=1)
    json.dump(studies(ROOT), open(os.path.join(WEB, 'studies.json'), 'w'), indent=1)
    count, drive = assemble(ROOT, SITE, os.environ)
    size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(SITE) for f in fs)
    print(f'build: assembled {count} repo files and the generated ones under dev/build/site/, {size / 1e6:.1f} MB; '
          + ('Google Drive loading is on' if drive else 'no GOOGLE_API_KEY, so Google Drive loading stays off'))
