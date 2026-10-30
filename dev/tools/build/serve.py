"""Serves the built site (dev/build/site/) on this computer the way Cloudflare does: /nor is nor.html.

  python3 dev/tools/build/serve.py [port]        then open http://localhost:8000/
"""
import functools, http.server, os, sys

SITE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'build', 'site'))


class Site(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        f = super().translate_path(path)
        return f + '.html' if not os.path.exists(f) and os.path.isfile(f + '.html') else f


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    http.server.ThreadingHTTPServer(('', port), functools.partial(Site, directory=SITE)).serve_forever()
