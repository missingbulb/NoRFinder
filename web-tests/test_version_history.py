"""req/shell/version-history: the page's version history. web/version_history.md parses into releases of a few
paragraphs, and a Next release paragraph goes under the release that carried every pull request it names
(dev/tools/build/version_history.py)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dev', 'tools', 'build'))
import version_history as vh  # noqa: E402  (dev/tools/build/ is not a package)

# main's first-parent subjects, newest first
LOG = ['Release site version 0.11008.23', 'Fix the bubble (#371)', 'Release site version 0.11008.22',
       'Merge pull request #369 from missingbulb/claude/x', 'Version history popup (#365)', 'Release site version 0.11007.21']
DOC = """# Version history

Prose.

## Next release
Clicking the version shows this history,
wrapped over two lines. (#365)

The bubble points at the version, and the popup grows. (#369, #371)

Not released yet, beside a released change. (#365, #380)

## 0.11007.21
Memory in the status bar. (#358)

## 1.10928.1
The first page. (#225)
"""


def test_each_pull_request_goes_under_the_release_that_first_carried_it():
    assert vh.releases(LOG) == {365: '0.11008.22', 369: '0.11008.22', 371: '0.11008.23'}


def test_a_paragraph_is_its_lines_joined_up_to_a_blank_line():
    assert vh.parse(DOC)[0] == ('Next release', ['Clicking the version shows this history, wrapped over two lines. (#365)',
                                                 'The bubble points at the version, and the popup grows. (#369, #371)',
                                                 'Not released yet, beside a released change. (#365, #380)'])


def test_next_release_paragraphs_go_under_the_release_that_carried_all_their_pull_requests():
    got = vh.resolve(vh.parse(DOC), vh.releases(LOG), '0.11008.24')
    assert got == [{'version': '0.11008.24', 'changes': ['Not released yet, beside a released change.']},
                   {'version': '0.11008.23', 'changes': ['The bubble points at the version, and the popup grows.']},
                   {'version': '0.11008.22', 'changes': ['Clicking the version shows this history, wrapped over two lines.']},
                   {'version': '0.11007.21', 'changes': ['Memory in the status bar.']},
                   {'version': '1.10928.1', 'changes': ['The first page.']}]


def test_fold_writes_the_found_versions_into_the_file():
    folded = vh.fold(DOC, vh.releases(LOG))
    assert folded.startswith('# Version history\n\nProse.\n\n## Next release\n\n'
                             'Not released yet, beside a released change. (#365, #380)\n\n## 0.11008.23\n')
    assert vh.parse(folded) == [('Next release', ['Not released yet, beside a released change. (#365, #380)']),
                                ('0.11008.23', ['The bubble points at the version, and the popup grows. (#369, #371)']),
                                ('0.11008.22', ['Clicking the version shows this history, wrapped over two lines. (#365)']),
                                ('0.11007.21', ['Memory in the status bar. (#358)']), ('1.10928.1', ['The first page. (#225)'])]
    assert vh.fold(folded, vh.releases(LOG)) == folded


def test_fold_keeps_an_empty_next_release():
    folded = vh.fold(DOC.replace(', #380', ''), vh.releases(LOG))
    assert vh.parse(folded)[0] == ('Next release', [])


def test_words_are_counted_without_the_pull_requests():
    assert vh.words('Memory in the status bar. (#358, #359)') == 5


def test_every_release_is_at_most_three_paragraphs_of_sixty_words_each_naming_its_pull_requests():
    sections = vh.parse(open(vh.SOURCE).read())
    assert sections[0][0] == vh.NEXT and len(sections) > 30
    for heading, paragraphs in sections:
        assert heading == vh.NEXT or (vh.build_number(heading) and paragraphs), heading
        assert len(paragraphs) <= vh.MAX_PARAGRAPHS, heading
        for p in paragraphs:
            assert vh.words(p) <= vh.MAX_WORDS, (heading, vh.words(p), p)
            assert vh.pull_requests(p), (heading, p)
