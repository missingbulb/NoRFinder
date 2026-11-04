"""req/shell/version-history: the page's version history. Each pull request tells its change in a
`Version-history:` line of one of its commit messages, which the squash merge carries onto main; the
site build files each line under the release that carried its pull request, beside the releases
web/version_history.md keeps from before (dev/tools/build/version_history.py)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dev', 'tools', 'build'))
import version_history as vh  # noqa: E402  (dev/tools/build/ is not a package)

# main's first-parent commits, newest first, as (subject, body)
LOG = [('Fix the bubble (#381)', 'Version-history: none\n'),
       ('Release site version 0.11008.23', ''),
       ('Fix the bubble (#371)', '* Fix it\n\nVersion-history: The bubble no longer hides the version.\n'),
       ('Release site version 0.11008.22', ''),
       ('Merge pull request #369 from missingbulb/claude/x', 'Version-history: An early wording.\n\n'
        '* Reword\n\nVersion-history: The popup grows with its text.\n'),
       ('Version history popup (#365)', ''),
       ('Release site version 0.11007.21', ''),
       ('A ruler (#390)', 'Version-history: A ruler on the image.')]
DOC = """# Version history

Prose.

## 0.11007.21
Memory in the status bar,
wrapped over two lines. (#358)

## 1.10928.1
The first page. (#225)
"""


def test_each_pull_request_goes_under_the_release_that_first_carried_it():
    assert vh.releases(LOG) == {365: '0.11008.22', 369: '0.11008.22', 371: '0.11008.23', 390: '0.11007.21'}


def test_a_pull_request_tells_its_change_in_the_last_version_history_line_of_its_commits():
    assert vh.told(LOG) == {371: 'The bubble no longer hides the version.', 369: 'The popup grows with its text.',
                            390: 'A ruler on the image.'}


def test_a_paragraph_is_its_lines_joined_up_to_a_blank_line():
    assert vh.parse(DOC)[0] == ('0.11007.21', ['Memory in the status bar, wrapped over two lines. (#358)'])


def test_each_told_change_goes_under_the_release_that_carried_its_pull_request():
    got = vh.resolve(vh.parse(DOC), LOG, '0.11008.24')
    assert got == [{'version': '0.11008.23', 'changes': ['The bubble no longer hides the version.']},
                   {'version': '0.11008.22', 'changes': ['The popup grows with its text.']},
                   {'version': '0.11007.21', 'changes': ['Memory in the status bar, wrapped over two lines.', 'A ruler on the image.']},
                   {'version': '1.10928.1', 'changes': ['The first page.']}]


def test_an_unreleased_change_goes_under_the_version_being_built():
    log = [('Tasks (#400)', 'Version-history: Tasks in the left bar.')] + LOG[1:]
    assert vh.resolve(vh.parse(DOC), log, '0.11008.24')[0] == {'version': '0.11008.24', 'changes': ['Tasks in the left bar.']}


def test_a_pull_request_changing_the_page_needs_a_version_history_line():
    assert vh.check(['Fix the bubble'], ['web/shell.js']) == [
        'web/shell.js changes what a user sees: a commit message needs a line "Version-history: <at most 20 words a '
        'user reads>", or "Version-history: none"']
    assert vh.check(['Fix the bubble'], ['studies/nor/web/finder.js'])
    assert vh.check(['Fix the bubble\n\nVersion-history: none'], ['web/shell.js']) == []
    assert vh.check(['Fix the bubble', 'Tell it\n\nVersion-history: The bubble shows.'], ['web/shell.js']) == []


def test_a_pull_request_not_changing_the_page_needs_none():
    assert vh.check(['Lab notes'], ['studies/nor/docs/notes.md', 'web-tests/test_x.py', 'dev/tools/build/build.py']) == []


def test_a_version_history_line_is_at_most_twenty_words():
    long = 'Version-history: ' + ' '.join(['word'] * 21)
    assert vh.check([long], ['README.md']) == ['the Version-history line is 21 words; at most 20']
    assert vh.check(['Version-history: ' + ' '.join(['word'] * 20)], ['web/shell.js']) == []


def test_the_kept_releases_each_name_their_pull_requests():
    sections = vh.parse(open(vh.SOURCE).read())
    assert len(sections) > 30
    for heading, paragraphs in sections:
        assert vh.build_number(heading) and paragraphs, heading
        for p in paragraphs:
            assert vh.pull_requests(p), (heading, p)
