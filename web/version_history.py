"""The page's version history: web/version_history.md, read into the list the page shows.

A line under "Next release" names its pull request, and goes under the release that first carried
that pull request, read from main's release commits. Run from the repo root:

  python3 web/version_history.py json     writes web/version_history.json, which the page reads
  python3 web/version_history.py fold     writes the found versions into version_history.md
"""
import json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, 'version_history.md')
OUT = os.path.join(HERE, 'version_history.json')
NEXT = 'Next release'
RELEASE = re.compile(r'^Release site version (\S+)$')
PR_IN_SUBJECT = re.compile(r'\(#(\d+)\)$|^Merge pull request #(\d+) ')
PR_IN_LINE = re.compile(r'\(#(\d+)\)\s*$')


def parse(text):
    """[(heading, [line])] in the file's order: each "## " heading with its "- " lines."""
    sections = []
    for raw in text.splitlines():
        if raw.startswith('## '):
            sections.append((raw[3:].strip(), []))
        elif raw.startswith('- ') and sections:
            sections[-1][1].append(raw[2:].strip())
    return sections


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
    """[{version, changes}] newest first: every Next release line moved to the version that carried its
    pull request, or to `current` (the version being built) when no release carried it yet."""
    by_version = {}
    for heading, lines in sections:
        for line in lines:
            if heading == NEXT:
                m = PR_IN_LINE.search(line)
                version = found.get(int(m.group(1))) if m else None
                version = version or current
            else:
                version = heading
            by_version.setdefault(version, []).append(line)
    return [{'version': v, 'changes': [PR_IN_LINE.sub('', c).rstrip() for c in by_version[v]]}
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
    """version_history.md with each Next release line that a release carried moved under that release."""
    sections = parse(text)
    keep, moved = [], {}
    for line in dict(sections).get(NEXT, []):
        m = PR_IN_LINE.search(line)
        version = found.get(int(m.group(1))) if m else None
        (moved.setdefault(version, []) if version else keep).append(line)
    if not moved:
        return text
    head, _, _ = text.partition('## ')
    out = dict((h, list(ls)) for h, ls in sections if h != NEXT)
    for version, lines in moved.items():
        out[version] = lines + out.get(version, [])
    order = sorted(out, key=build_number, reverse=True)
    body = [f'## {NEXT}\n' + ''.join(f'- {line}\n' for line in keep)]
    body += [f'## {v}\n' + ''.join(f'- {line}\n' for line in out[v]) for v in order]
    return head + '\n'.join(body)


if __name__ == '__main__':
    root = os.path.dirname(HERE)
    if sys.argv[1:] == ['json']:
        json.dump(history(root), open(OUT, 'w'), indent=1)
    elif sys.argv[1:] == ['fold']:
        text = open(SOURCE).read()
        open(SOURCE, 'w').write(fold(text, releases(git_log(root))))
    else:
        sys.exit(__doc__)
