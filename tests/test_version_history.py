"""R8: the page's version history. web/version_history.md parses into releases, and a Next release line
goes under the release that first carried its pull request (web/version_history.py)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web'))
import version_history as vh  # noqa: E402  (web/ is not a package)

# main's first-parent subjects, newest first
LOG = ['Release site version 0.11008.23', 'Fix the bubble (#371)', 'Release site version 0.11008.22',
       'Merge pull request #369 from missingbulb/claude/x', 'Version history popup (#365)', 'Release site version 0.11007.21']
DOC = """# Version history

Prose.

## Next release
- Clicking the version shows this history. (#365)
- The bubble points at the version. (#371)
- Not released yet. (#380)

## 0.11007.21
- Memory in the status bar. (#358)

## 1.10928.1
- The first page. (#225)
"""


def test_each_pull_request_goes_under_the_release_that_first_carried_it():
    assert vh.releases(LOG) == {365: '0.11008.22', 369: '0.11008.22', 371: '0.11008.23'}


def test_next_release_lines_are_filed_by_release_and_unreleased_ones_under_the_build():
    got = vh.resolve(vh.parse(DOC), vh.releases(LOG), '0.11008.24')
    assert got == [{'version': '0.11008.24', 'changes': ['Not released yet.']},
                   {'version': '0.11008.23', 'changes': ['The bubble points at the version.']},
                   {'version': '0.11008.22', 'changes': ['Clicking the version shows this history.']},
                   {'version': '0.11007.21', 'changes': ['Memory in the status bar.']},
                   {'version': '1.10928.1', 'changes': ['The first page.']}]


def test_fold_writes_the_found_versions_into_the_file():
    folded = vh.fold(DOC, vh.releases(LOG))
    assert folded.startswith('# Version history\n\nProse.\n\n## Next release\n- Not released yet. (#380)\n\n## 0.11008.23\n')
    assert vh.parse(folded) == [('Next release', ['Not released yet. (#380)']), ('0.11008.23', ['The bubble points at the version. (#371)']),
                                ('0.11008.22', ['Clicking the version shows this history. (#365)']),
                                ('0.11007.21', ['Memory in the status bar. (#358)']), ('1.10928.1', ['The first page. (#225)'])]
    assert vh.fold(folded, vh.releases(LOG)) == folded


def test_the_history_file_names_a_pull_request_on_every_line_and_a_version_on_every_release():
    sections = vh.parse(open(vh.SOURCE).read())
    assert sections[0][0] == vh.NEXT
    for heading, lines in sections[1:]:
        assert vh.build_number(heading) and lines, heading
    assert all(vh.PR_IN_LINE.search(line) for _, lines in sections for line in lines)
