"""The page's version history: web/version_history.md, read into the list the page shows.

Each release is a few paragraphs, each ending with the pull requests it tells of, `(#12, #34)`. A
paragraph under "Next release" goes under the release that carried all of them, read from main's
release commits. Run from the repo root:

  python3 dev/tools/build/version_history.py json     writes web/version_history.json, which the page reads
  python3 dev/tools/build/version_history.py fold     writes the found versions into version_history.md
"""
import json, os, re, subprocess, sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
SOURCE = os.path.join(ROOT, 'web', 'version_history.md')
OUT = os.path.join(ROOT, 'web', 'version_history.json')
NEXT = 'Next release'
RELEASE = re.compile(r'^Release site version (\S+)$')
PR_IN_SUBJECT = re.compile(r'\(#(\d+)\)$|^Merge pull request #(\d+) ')
PRS_AT_END = re.compile(r'\s*\((#\d+(?:,\s*#\d+)*)\)\s*$')
MAX_PARAGRAPHS, MAX_WORDS = 3, 60


def parse(text):
    """[(heading, [paragraph])] in the file's order: each "## " heading with its blank-line-separated paragraphs."""
    sections, lines = [], []

    def close():
        if lines and sections:
            sections[-1][1].append(' '.join(lines))
        lines.clear()
    for raw in text.splitlines():
        if raw.startswith('## '):
            close()
            sections.append((raw[3:].strip(), []))
        elif not raw.strip():
            close()
        elif sections:
            lines.append(raw.strip())
    close()
    return sections


def pull_requests(paragraph):
    m = PRS_AT_END.search(paragraph)
    return [int(n) for n in re.findall(r'\d+', m.group(1))] if m else []


def words(paragraph):
    return len(PRS_AT_END.sub('', paragraph).split())


def carried_by(paragraph, found):
    """The release that carried every pull request the paragraph names, or None while one is unreleased."""
    versions = [found.get(pr) for pr in pull_requests(paragraph)]
    return max(versions, key=build_number) if versions and all(versions) else None


def releases(log):
    """{pull request: the version that first carried it}, from `git log --first-parent --format=%s`
    lines, newest first."""
    found, pending = {}, []
    for subject in reversed(log):
        m = RELEASE.match(subject)
        if m:
            found.update((pr, m.group(1)) for pr in pending)
            pending = []
            continue
        m = PR_IN_SUBJECT.search(subject)
        if m:
            pending.append(int(m.group(1) or m.group(2)))
    return found


def build_number(version):
    """The release counter, which orders versions even across a change of major."""
    return int(version.split('.')[-1])


def resolve(sections, found, current):
    """[{version, changes}] newest first: every Next release paragraph moved to the version that carried its
    pull requests, or to `current` (the version being built) while one is unreleased."""
    by_version = {}
    for heading, lines in sections:
        for line in lines:
            if heading == NEXT:
                version = carried_by(line, found) or current
            else:
                version = heading
            by_version.setdefault(version, []).append(line)
    return [{'version': v, 'changes': [PRS_AT_END.sub('', c) for c in by_version[v]]}
            for v in sorted(by_version, key=build_number, reverse=True)]


def git_log(root):
    """main's first-parent subjects, newest first; fetches the history a shallow checkout lacks."""
    git = lambda *a: subprocess.run(['git', '-C', root, *a], capture_output=True, text=True)
    if git('rev-parse', '--is-shallow-repository').stdout.strip() == 'true':
        git('fetch', '--quiet', '--unshallow', 'origin')
    out = git('log', '--first-parent', '--format=%s', 'HEAD')
    return out.stdout.splitlines() if out.returncode == 0 else []


def current_version(root):
    return json.load(open(os.path.join(root, 'package.json')))['version']


def history(root):
    log = git_log(root)
    found = releases(log)
    print(f'version history: {len(found)} pull requests placed by {sum(map(bool, map(RELEASE.match, log)))} releases', file=sys.stderr)
    return resolve(parse(open(SOURCE).read()), found, current_version(root))


def fold(text, found):
    """version_history.md with each Next release paragraph that a release carried moved under that release."""
    sections = parse(text)
    keep, moved = [], {}
    for line in dict(sections).get(NEXT, []):
        version = carried_by(line, found)
        (moved.setdefault(version, []) if version else keep).append(line)
    if not moved:
        return text
    head, _, _ = text.partition('## ')
    out = dict((h, list(ls)) for h, ls in sections if h != NEXT)
    for version, lines in moved.items():
        out[version] = lines + out.get(version, [])
    order = sorted(out, key=build_number, reverse=True)
    section = lambda h, ps: '\n\n'.join([f'## {h}', *map(wrap, ps)]) + '\n'
    return head + '\n'.join([section(NEXT, keep), *(section(v, out[v]) for v in order)])


def wrap(paragraph, width=100):
    lines = ['']
    for word in paragraph.split():
        if lines[-1] and len(lines[-1]) + 1 + len(word) > width:
            lines.append('')
        lines[-1] = f'{lines[-1]} {word}'.lstrip()
    return '\n'.join(lines)


if __name__ == '__main__':
    root = ROOT
    if sys.argv[1:] == ['json']:
        json.dump(history(root), open(OUT, 'w'), indent=1)
    elif sys.argv[1:] == ['fold']:
        text = open(SOURCE).read()
        open(SOURCE, 'w').write(fold(text, releases(git_log(root))))
    else:
        sys.exit(__doc__)
