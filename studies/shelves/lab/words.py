"""The Hebrew word list the readers spell by (web/words/heb.txt), from Hermit Dave's FrequencyWords at a pinned commit:
the 50,000 most frequent words of the OpenSubtitles 2018 corpus, most frequent first, the counts dropped and any word
holding a letter other than Hebrew's left out.

    python3 studies/shelves/lab/words.py
"""
import os
import re
import urllib.request

COMMIT = '525f9b560de45753a5ea01069454e72e9aa541c6'
SOURCE = f'https://raw.githubusercontent.com/hermitdave/FrequencyWords/{COMMIT}/content/2018/he/he_50k.txt'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'words', 'heb.txt')
HEADER = f"""# Hebrew words, most frequent first: Hermit Dave's FrequencyWords (github.com/hermitdave/FrequencyWords, commit
# {COMMIT}), content/2018/he/he_50k.txt, from the OpenSubtitles 2018 corpus (opus.nlpl.eu), its counts
# dropped and any word holding a letter other than Hebrew's left out. Licensed CC BY-SA 4.0
# (creativecommons.org/licenses/by-sa/4.0/), as this file is. Written by studies/shelves/lab/words.py.
"""


def main():
    text = urllib.request.urlopen(SOURCE).read().decode('utf8')
    words = [w for w in (line.split(' ')[0] for line in text.splitlines()) if re.fullmatch('[א-ת]+', w)]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf8') as f:
        f.write(HEADER + '\n'.join(words) + '\n')
    print(len(words), 'words', os.path.relpath(OUT))


if __name__ == '__main__':
    main()
