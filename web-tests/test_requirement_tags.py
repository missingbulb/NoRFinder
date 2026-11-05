"""Every requirement in the page's specs (the shell's, and each study's own) has a tag no other requirement has, so a test or a comment citing one
names one thing. A tag is a path under its section's tag (`req/shell/offline/default`), and each section lists
its requirements sorted by tag, compared segment by segment so a branch stays together: two pull requests adding
requirements side by side take no shared number and, unless their tags are neighbours, touch different lines.
Every `req/...` cited anywhere in the repo names a tag a spec has, so a renamed or dropped tag fails here."""
import collections
import glob
import os
import re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SPEC = os.path.join(ROOT, 'dev', 'requirements', 'requirements.md')
TAG = r'req(?:/[a-z0-9]+(?:-[a-z0-9]+)*)+'
SKIP_DIRS = {'.git', 'node_modules', '__pycache__', 'vendor', 'build'}
TEXT = ('.md', '.py', '.js', '.mjs', '.css', '.html', '.yml', '.yaml', '.json', '.go', '.sh', '.txt')


def specs():
    return [SPEC, *sorted(glob.glob(os.path.join(ROOT, 'studies', '*', 'requirements.md')))]


def sections(*paths):
    found = collections.OrderedDict()
    for path in paths or specs():
        for section, tags in read(path).items():
            assert section not in found, f'section {section} is in two specs'
            found[section] = tags
    return found


def read(path):
    found = collections.OrderedDict()
    current = None
    for line in open(path, encoding='utf-8'):
        heading = re.match(r'## `([^`]*)`', line)
        if heading:
            current = heading.group(1)
            found[current] = []
            continue
        item = re.match(r'- `([^`]*)`', line)
        if item:
            assert current is not None, f'requirement {item.group(1)} sits above every section of {path}'
            found[current].append(item.group(1))
    return found


def test_every_requirement_has_a_tag_under_its_section():
    found = sections()
    assert sum(map(len, found.values())) >= 50, 'the pattern no longer matches the spec'
    for section, tags in found.items():
        assert re.fullmatch(TAG, section), f'section tag {section!r} is not a req/... path'
        wrong = [t for t in tags if not (re.fullmatch(TAG, t) and t.startswith(section + '/'))]
        assert not wrong, f'not a tag under {section}: {wrong}'


def test_no_two_requirements_share_a_tag():
    tags = [t for ts in sections().values() for t in ts]
    shared = sorted(t for t, k in collections.Counter(tags).items() if k > 1)
    assert not shared, f'requirement tags used twice: {shared}'


def test_each_section_is_sorted_by_tag():
    for section, tags in sections().items():
        want = sorted(tags, key=lambda t: t.split('/'))
        assert tags == want, f'{section} is out of order; first misplaced: ' + next(
            f'{a} where {b} belongs' for a, b in zip(tags, want) if a != b)


def test_every_cited_tag_exists():
    known = {t for s, ts in sections().items() for t in [s, *ts]}
    unknown, scanned, cited = [], 0, 0
    for top, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            if not name.endswith(TEXT):
                continue
            path = os.path.join(top, name)
            try:
                text = open(path, encoding='utf-8').read()
            except UnicodeDecodeError:
                continue
            scanned += 1
            for tag in re.findall(rf'(?<![\w/.-]){TAG}', text):
                cited += 1
                if tag not in known:
                    unknown.append(f'{os.path.relpath(path, ROOT)}: {tag}')
    assert scanned >= 200 and cited >= 200, f'swept {scanned} files and {cited} citations: the walk no longer reaches the repo'
    assert not unknown, 'cited tags the spec does not have:\n' + '\n'.join(unknown)


def test_the_shell_spec_holds_only_the_shell_and_each_study_its_own():
    """req/checks/spec-layout: no study's section in the shell's spec, and each study's spec one section of its own."""
    shell = list(sections(SPEC))
    assert shell == ['req/shell', 'req/checks'], f'the shell spec holds more than the shell: {shell}'
    studies = sorted(glob.glob(os.path.join(ROOT, 'studies', '*', 'requirements.md')))
    assert len(studies) >= 3, f'found {len(studies)} study specs'
    for path in studies:
        study = os.path.basename(os.path.dirname(path))
        assert list(sections(path)) == [f'req/{study}'], f'{os.path.relpath(path, ROOT)} is not one req/{study} section'
