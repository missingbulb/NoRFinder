"""The page's version history, read into the list the page shows.

Each pull request tells its change for the page's users in a line of one of its commit messages,
`Version-history: <at most 20 words>`, or `Version-history: none`; the squash merge carries it onto
main, and the line goes under the release that first carried the pull request, read from main's
release commits. The releases from before are kept in web/version_history.md. Run from the repo root:

  python3 dev/tools/build/version_history.py json          writes web/version_history.json, which the page reads
  python3 dev/tools/build/version_history.py check BASE    checks the commits since BASE (a pull request's)
"""
import fnmatch, json, os, re, subprocess, sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
SOURCE = os.path.join(ROOT, 'web', 'version_history.md')
OUT = os.path.join(ROOT, 'web', 'version_history.json')
RELEASE = re.compile(r'^Release site version (\S+)$')
PR_IN_SUBJECT = re.compile(r'\(#(\d+)\)$|^Merge pull request #(\d+) ')
PRS_AT_END = re.compile(r'\s*\((#\d+(?:,\s*#\d+)*)\)\s*$')
# a squash merge lists each commit's subject as "* <subject>"
LINE = re.compile(r'^(?:\* )?Version-history:\s*(.*?)\s*$', re.M)
NONE = 'none'
MAX_WORDS = 20
# what a user of the page sees: the shell's page and each study's
SEEN = ('web/*', 'studies/*/web/*')
UNIT, RECORD = '\x1f', '\x1e'


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


def pull_request(subject):
    m = PR_IN_SUBJECT.search(subject)
    return int(m.group(1) or m.group(2)) if m else None


def line(message):
    """The last Version-history line of a commit message: its words, '' for none, or None when it has none."""
    found = LINE.findall(message)
    if not found:
        return None
    return '' if found[-1].lower() == NONE else found[-1]


def releases(log):
    """{pull request: the version that first carried it}, from main's first-parent (subject, body), newest first."""
    found, pending = {}, []
    for subject, _ in reversed(log):
        m = RELEASE.match(subject)
        if m:
            found.update((pr, m.group(1)) for pr in pending)
            pending = []
        elif pull_request(subject):
            pending.append(pull_request(subject))
    return found


def told(log):
    """{pull request: the change it told}, leaving out those that told none."""
    out = {}
    for subject, body in log:
        pr, text = pull_request(subject), line(body)
        if pr and text:
            out[pr] = text
    return out


def build_number(version):
    """The release counter, which orders versions even across a change of major."""
    return int(version.split('.')[-1])


def resolve(sections, log, current):
    """[{version, changes}] newest first: the file's releases, and each told change under the release that
    carried its pull request, or under `current` (the version being built) while it is unreleased."""
    by_version = {}
    for heading, paragraphs in sections:
        by_version.setdefault(heading, []).extend(PRS_AT_END.sub('', p) for p in paragraphs)
    found = releases(log)
    for pr, text in reversed(list(told(log).items())):
        by_version.setdefault(found.get(pr, current), []).append(text)
    return [{'version': v, 'changes': by_version[v]} for v in sorted(by_version, key=build_number, reverse=True)]


def check(messages, files):
    """What a pull request's commit messages lack, given the files it changes: [] when nothing."""
    text = None
    for message in messages:
        text = line(message) if line(message) is not None else text
    if text is None:
        seen = [f for f in files if any(fnmatch.fnmatch(f, p) for p in SEEN)]
        return [f'{seen[0]} changes what a user sees: a commit message needs a line "Version-history: <at most '
                f'{MAX_WORDS} words a user reads>", or "Version-history: none"'] if seen else []
    n = len(text.split())
    return [f'the Version-history line is {n} words; at most {MAX_WORDS}'] if n > MAX_WORDS else []


def git(root, *args):
    return subprocess.run(['git', '-C', root, *args], capture_output=True, text=True)


def git_log(root):
    """main's first-parent (subject, body), newest first; fetches the history a shallow checkout lacks."""
    if git(root, 'rev-parse', '--is-shallow-repository').stdout.strip() == 'true':
        git(root, 'fetch', '--quiet', '--unshallow', 'origin')
    out = git(root, 'log', '--first-parent', f'--format=%s{UNIT}%b{RECORD}', 'HEAD')
    if out.returncode:
        return []
    return [tuple(r.lstrip('\n').split(UNIT, 1)) for r in out.stdout.split(RECORD) if UNIT in r]


def current_version(root):
    return json.load(open(os.path.join(root, 'package.json')))['version']


def history(root):
    log = git_log(root)
    print(f'version history: {len(told(log))} pull requests told, placed by '
          f'{sum(bool(RELEASE.match(s)) for s, _ in log)} releases', file=sys.stderr)
    return resolve(parse(open(SOURCE).read()), log, current_version(root))


def check_since(root, base):
    span = f'{base}..HEAD'
    messages = git(root, 'log', '--reverse', '--no-merges', f'--format=%B{RECORD}', span).stdout.split(RECORD)
    files = git(root, 'diff', '--name-only', f'{base}...HEAD').stdout.split()
    return check(messages, files)


if __name__ == '__main__':
    if sys.argv[1:] == ['json']:
        json.dump(history(ROOT), open(OUT, 'w'), indent=1)
    elif sys.argv[1:2] == ['check'] and len(sys.argv) == 3:
        problems = check_since(ROOT, sys.argv[2])
        print('\n'.join(problems) or 'version history: the pull request tells its change, or needs to tell none')
        sys.exit(1 if problems else 0)
    else:
        sys.exit(__doc__)
