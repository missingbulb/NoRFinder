"""The names the readers spell by beside the subtitle word list (web/words/names.txt): every Hebrew word in the titles
of at least TITLES of Hebrew Wikipedia's articles, from one dated dump of its titles, the ones the subtitle list lacks,
most titles first. Authors, book titles and publishers are articles' titles; the subtitle list holds few names.

    python3 studies/shelves/lab/words.py
"""
import collections
import gzip
import hashlib
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))

DUMP = 'https://dumps.wikimedia.org/hewiki/20261101/hewiki-20261101-all-titles-in-ns0.gz'
SHA256 = '92790b80debed2894a7c9f4e43c67e65319406b236d660154d4cf372e8a64e4c'
TITLES = 3
OUT = os.path.join(HERE, '..', 'web', 'words', 'names.txt')
HEADER = f"""# Hebrew words of Hebrew Wikipedia's article titles, in {TITLES} titles or more, most titles first, less those of the
# subtitle word list the page fetches beside this one. From {DUMP}
# (sha256 {SHA256}); Wikipedia's text is licensed CC BY-SA 4.0 (creativecommons.org/licenses/by-sa/4.0/), as this
# file is. Written by studies/shelves/lab/words.py.
"""


def subtitle_list():
    """The subtitle word list's address, as the page keeps it offline."""
    with open(os.path.join(HERE, '..', 'study.json')) as f:
        return next(u for u in json.load(f)['web']['offline'] if u.endswith('/he_50k.txt'))


def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'bookshelf-reader-lab/1'})).read()


def main():
    dump = fetch(DUMP)
    got = hashlib.sha256(dump).hexdigest()
    if got != SHA256:
        sys.exit(f'{DUMP}: sha256 {got}, expected {SHA256}')
    listed = {line.split(' ')[0] for line in fetch(subtitle_list()).decode('utf8').splitlines()}
    titles = collections.Counter()
    for title in gzip.decompress(dump).decode('utf8').splitlines():
        titles.update(set(re.findall('[א-ת]+', title)))
    names = [w for w, n in titles.most_common() if n >= TITLES and len(w) > 1 and w not in listed]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf8') as f:
        f.write(HEADER + '\n'.join(names) + '\n')
    print(len(names), 'words', os.path.relpath(OUT))


if __name__ == '__main__':
    main()
